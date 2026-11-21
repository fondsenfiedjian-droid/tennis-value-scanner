#!/usr/bin/env node
/**
 * Compare Sackmann weekly rankings with a normalized Sackmann match archive.
 * Exact player-ID join only. Read-only; no production data is changed.
 *
 * node scripts/sackmann-ranking-link-audit.mjs --tour atp \
 *   --archive ~/tennis-data/atp-normalized.csv \
 *   ~/tennis-data/rankings/raw/atp_rankings_*.csv
 */
import fs from 'node:fs';
import readline from 'node:readline';

function parseLine(line, delimiter) {
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
  out.push(value); return out;
}
async function* rows(file){
  const rl=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  let delimiter=',', header=null;
  for await(const line of rl){
    if(!header){
      const clean=line.replace(/^\uFEFF/,'');
      delimiter=(clean.split(';').length>clean.split(',').length)?';':',';
      header=parseLine(clean,delimiter).map(x=>x.trim().toLowerCase());
      yield {header,fields:null};
    } else if(line.trim()) yield {header,fields:parseLine(line,delimiter)};
  }
}
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
const tour=arg('--tour');
const archive=arg('--archive');
const files=[];
for(let i=2;i<process.argv.length;i++){
  if(process.argv[i]==='--tour'||process.argv[i]==='--archive'){i++;continue;}
  if(!process.argv[i].startsWith('--'))files.push(process.argv[i]);
}
if(!['atp','wta'].includes(tour)||!archive||!files.length){
  console.error('Usage: node scripts/sackmann-ranking-link-audit.mjs --tour atp|wta --archive normalized.csv ranking-files.csv [...]');
  process.exit(2);
}
if(!fs.existsSync(archive)) throw new Error('Archive not found: '+archive);
const archiveIds=new Set();
let archiveRows=0;
for await(const row of rows(archive)){
  if(!row.fields) continue;
  const wi=row.header.indexOf('winner_id'), li=row.header.indexOf('loser_id');
  if(wi<0||li<0) throw new Error('Archive must contain winner_id and loser_id columns');
  const a=String(row.fields[wi]??'').trim(),b=String(row.fields[li]??'').trim();
  if(a)archiveIds.add(a); if(b)archiveIds.add(b); archiveRows++;
}
const reports=[];
for(const file of files){
  if(!fs.existsSync(file)){reports.push({file,error:'not found'});continue;}
  let header=null, dateIdx=-1, rankIdx=-1, idIdx=-1, pointsIdx=-1;
  let rowsN=0,missingId=0,missingDate=0,missingPoints=0,matchedRows=0;
  let minDate=null,maxDate=null,lastDate=null,nonMonotonicDates=0,duplicatePlayerDate=0;
  let dateIds=new Set(),currentDate=null;
  const uniqueIds=new Set();
  let matchedUniqueIds=0;
  for await(const row of rows(file)){
    if(!row.fields){header=row.header;dateIdx=header.indexOf('ranking_date');rankIdx=header.indexOf('rank');idIdx=header.indexOf('player');pointsIdx=header.indexOf('points');
      if([dateIdx,rankIdx,idIdx,pointsIdx].some(x=>x<0))throw new Error(file+': expected ranking_date, rank, player, points'); continue;}
    rowsN++;
    const d=String(row.fields[dateIdx]??'').trim(),id=String(row.fields[idIdx]??'').trim(),p=String(row.fields[pointsIdx]??'').trim();
    if(!d)missingDate++; else {if(!minDate||d<minDate)minDate=d;if(!maxDate||d>maxDate)maxDate=d;
      if(lastDate&&d<lastDate)nonMonotonicDates++; lastDate=d;
      if(d!==currentDate){currentDate=d;dateIds=new Set();}
      if(id){if(dateIds.has(id))duplicatePlayerDate++;dateIds.add(id);}
    }
    if(!id)missingId++; else {if(!uniqueIds.has(id)){uniqueIds.add(id);if(archiveIds.has(id))matchedUniqueIds++;}if(archiveIds.has(id))matchedRows++;}
    if(!p)missingPoints++;
  }
  reports.push({file,rows:rowsN,dateRange:{from:minDate,to:maxDate},uniqueRankingPlayerIds:uniqueIds.size,
    exactArchiveIdMatches:matchedUniqueIds,
    archiveIdMatchRate:uniqueIds.size?Number((matchedUniqueIds/uniqueIds.size).toFixed(6)):null,
    rankingRowsWithArchiveId:matchedRows,missingPlayerIdRows:missingId,missingDateRows:missingDate,
    missingPointsRows:missingPoints,duplicatePlayerWithinDate:duplicatePlayerDate,nonMonotonicDateRows:nonMonotonicDates});
}
console.log(JSON.stringify({schemaVersion:1,readOnly:true,tour,archive,archiveRows,archiveUniquePlayerIds:archiveIds.size,files:reports},null,2));
