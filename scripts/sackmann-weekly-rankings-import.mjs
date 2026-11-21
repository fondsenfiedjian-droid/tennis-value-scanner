#!/usr/bin/env node
/**
 * Normalize Sackmann weekly rankings without modifying source files.
 * External-sort implementation keeps memory bounded on mobile devices.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

function expandHome(value) {
  return value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}
function csvParse(line, delimiter=',') {
  const out=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(quoted){
      if(ch==='"' && line[i+1]==='"'){value+='"';i++;}
      else if(ch==='"') quoted=false;
      else value+=ch;
    } else if(ch==='"') quoted=true;
    else if(ch===delimiter){out.push(value);value='';}
    else value+=ch;
  }
  if(quoted) throw new Error('Unclosed quoted CSV field');
  out.push(value); return out;
}
function csvCell(value) {
  const s=String(value??'');
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function csvLine(values) { return values.map(csvCell).join(',')+'\n'; }
function compare(a,b) {
  return a.date.localeCompare(b.date) || a.playerId.localeCompare(b.playerId,undefined,{numeric:true}) ||
    Number(a.rank)-Number(b.rank) || a.points.localeCompare(b.points,undefined,{numeric:true}) ||
    a.source.localeCompare(b.source) || a.row-b.row;
}
function argsParse() {
  const args=process.argv.slice(2); let tour=null,outDir='~/tennis-data/rankings/processed',chunkSize=100000;
  const files=[];
  for(let i=0;i<args.length;i++){
    if(args[i]==='--tour') tour=args[++i];
    else if(args[i]==='--out-dir') outDir=args[++i];
    else if(args[i]==='--chunk-size') chunkSize=Number(args[++i]);
    else if(args[i].startsWith('--')) throw new Error('Unknown option: '+args[i]);
    else files.push(args[i]);
  }
  if(!['atp','wta'].includes(tour)||!files.length||!Number.isInteger(chunkSize)||chunkSize<1000)
    throw new Error('Usage: node scripts/sackmann-weekly-rankings-import.mjs --tour atp|wta [--out-dir DIR] [--chunk-size 100000] input.csv [...]');
  return {tour,outDir:expandHome(outDir),files:files.map(expandHome),chunkSize};
}
async function* csvRows(file) {
  const rl=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  let header=null,delimiter=',';
  for await(const line of rl){
    if(header===null){
      const clean=line.replace(/^\uFEFF/,'');
      delimiter=clean.split(';').length>clean.split(',').length?';':',';
      header=csvParse(clean,delimiter).map(x=>x.trim().toLowerCase());
      yield {header,fields:null};
    } else if(line.trim()) yield {header,fields:csvParse(line,delimiter)};
  }
}
async function writeChunk(records,file) {
  records.sort(compare);
  await fs.promises.writeFile(file,records.map(x=>JSON.stringify(x)).join('\n')+'\n');
}
async function* jsonRows(file) {
  const rl=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  for await(const line of rl) if(line) yield JSON.parse(line);
}
function makeWriters(outDir,tour) {
  const canonical=path.join(outDir,tour+'-weekly-rankings.csv');
  const quarantine=path.join(outDir,tour+'-weekly-rankings-quarantine.csv');
  const report=path.join(outDir,tour+'-weekly-rankings-report.json');
  const c=fs.createWriteStream(canonical),q=fs.createWriteStream(quarantine);
  c.write(csvLine(['tour','ranking_date','player_id','rank','points','source_file','source_row']));
  q.write(csvLine(['tour','ranking_date','player_id','rank','points','source_file','source_row','conflict_reason']));
  return {c,q,canonical,quarantine,report};
}
function write(stream,line){return new Promise((resolve,reject)=>{if(stream.write(line))resolve();else{stream.once('drain',resolve);stream.once('error',reject);}});}
async function finish(stream){await new Promise((resolve,reject)=>stream.end(err=>err?reject(err):resolve()));}
async function main(){
  const {tour,outDir,files,chunkSize}=argsParse();
  for(const file of files) if(!fs.existsSync(file)) throw new Error('Input not found: '+file);
  await fs.promises.mkdir(outDir,{recursive:true});
  const tempDir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'weekly-rankings-'));
  const chunks=[]; let buffer=[],inputRows=0,invalidRows=0,missingPoints=0;
  const sourceStats=[];
  try {
    for(const file of files){
      let header=null,idx={};
      let fileRows=0;
      for await(const item of csvRows(file)){
        if(!item.fields){
          header=item.header;
          for(const key of ['ranking_date','rank','player','points']) idx[key]=header.indexOf(key);
          if(Object.values(idx).some(v=>v<0)) throw new Error(file+': required columns ranking_date,rank,player,points not found');
          continue;
        }
        fileRows++; inputRows++;
        const date=String(item.fields[idx.ranking_date]??'').trim();
        const playerId=String(item.fields[idx.player]??'').trim();
        const rank=String(item.fields[idx.rank]??'').trim();
        const points=String(item.fields[idx.points]??'').trim();
        if(!/^\d{8}$/.test(date)||!Number.isInteger(Number(rank))||Number(rank)<1||!playerId){
          invalidRows++; continue;
        }
        if(!points) missingPoints++;
        else if(!/^\d+(\.\d+)?$/.test(points)) { invalidRows++; continue; }
        buffer.push({date,playerId,rank,points,source:path.basename(file),row:fileRows});
        if(buffer.length>=chunkSize){
          const chunk=path.join(tempDir,'chunk-'+chunks.length+'.jsonl');
          await writeChunk(buffer,chunk); chunks.push(chunk); buffer=[];
          if(inputRows%500000<chunkSize)console.log('Read progress:',inputRows.toLocaleString(),'rows; chunks:',chunks.length);
        }
      }
      sourceStats.push({file,rows:fileRows});
    }
    if(buffer.length){const chunk=path.join(tempDir,'chunk-'+chunks.length+'.jsonl');await writeChunk(buffer,chunk);chunks.push(chunk);buffer=[];}
    const writers=makeWriters(outDir,tour);
    // Min-heap keeps k-way merge O(log k) per row instead of scanning every chunk.
    const iterators=chunks.map(file=>jsonRows(file)[Symbol.asyncIterator]());
    const heap=[];
    function heapPush(node){
      let i=heap.length;heap.push(node);
      while(i>0){const p=(i-1)>>1;if(compare(heap[p].value,node.value)<=0)break;heap[i]=heap[p];i=p;heap[i]=node;}
    }
    function heapPop(){
      const first=heap[0],last=heap.pop();
      if(heap.length){let i=0;heap[0]=last;while(true){let l=i*2+1,r=l+1,b=i;if(l<heap.length&&compare(heap[l].value,heap[b].value)<0)b=l;if(r<heap.length&&compare(heap[r].value,heap[b].value)<0)b=r;if(b===i)break;[heap[i],heap[b]]=[heap[b],heap[i]];i=b;}}
      return first;
    }
    for(let i=0;i<iterators.length;i++){const n=await iterators[i].next();if(!n.done)heapPush({index:i,value:n.value});}
    let group=[],canonicalRows=0,quarantinedRows=0,exactDuplicateRows=0,filledPointsResolutions=0,conflictGroups=0,mergedRows=0;
    async function flushGroup(){
      if(!group.length)return;
      const ranks=new Set(group.map(x=>x.rank));
      const populatedPoints=new Set(group.map(x=>x.points).filter(Boolean));
      let reason=null;
      if(ranks.size>1) reason='conflicting_ranks';
      else if(populatedPoints.size>1) reason='conflicting_points';
      if(reason){
        conflictGroups++;
        for(const x of group){await write(writers.q,csvLine([tour,x.date,x.playerId,x.rank,x.points,x.source,x.row,reason]));quarantinedRows++;}
      } else {
        const selected=group.find(x=>x.points)||group[0];
        if(group.length>1){
          const signatures=new Set(group.map(x=>x.rank+'|'+x.points));
          if(signatures.size===1) exactDuplicateRows+=group.length-1;
          else filledPointsResolutions+=group.length-1;
        }
        await write(writers.c,csvLine([tour,selected.date,selected.playerId,selected.rank,selected.points,selected.source,selected.row]));
        canonicalRows++;
      }
      group=[];
    }
    while(heap.length){
      const node=heapPop(),current=node.value;
      if(group.length&&(group[0].date!==current.date||group[0].playerId!==current.playerId))await flushGroup();
      group.push(current);mergedRows++;
      const next=await iterators[node.index].next();
      if(!next.done)heapPush({index:node.index,value:next.value});
      if(mergedRows%250000===0)console.log('Merge progress:',mergedRows.toLocaleString(),'/',inputRows.toLocaleString());
    }
    await flushGroup();
    await finish(writers.c);await finish(writers.q);
    const summary={schemaVersion:1,tour,readOnlyInputs:true,createdAt:new Date().toISOString(),inputFiles:sourceStats,inputRows,invalidRows,missingPointsRows:missingPoints,
      canonicalRows,quarantinedRows,conflictGroups,exactDuplicateRowsRemoved:exactDuplicateRows,filledPointsDuplicateRowsResolved:filledPointsResolutions,
      chunkSize,output:{canonical:writers.canonical,quarantine:writers.quarantine}};
    await fs.promises.writeFile(writers.report,JSON.stringify(summary,null,2)+'\n');
    console.log(JSON.stringify({...summary,report:writers.report},null,2));
  } finally {
    await fs.promises.rm(tempDir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
