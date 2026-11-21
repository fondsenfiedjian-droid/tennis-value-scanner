#!/usr/bin/env node
/**
 * Research-only temporal join of weekly Sackmann rankings onto completed matches.
 * Uses the latest ranking_date <= match date for each exact player ID.
 * Streams both files; keeps only the latest snapshot per player in memory.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

function expandHome(value) {
  return value === '~' ? os.homedir() : value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
}
export function parseCsvLine(line, delimiter=',') {
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
async function* csvRows(file) {
  const rl=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
  let header=null,delimiter=',';
  for await(const line of rl){
    if(header===null){
      const clean=line.replace(/^\uFEFF/,'');
      delimiter=clean.split(';').length>clean.split(',').length?';':',';
      header=parseCsvLine(clean,delimiter).map(x=>x.trim().toLowerCase());
      yield {header,fields:null};
    } else if(line.trim()) yield {header,fields:parseCsvLine(line,delimiter)};
  }
}
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function daysBetween(earlier,later){
  const a=Date.UTC(+earlier.slice(0,4),+earlier.slice(4,6)-1,+earlier.slice(6,8));
  const b=Date.UTC(+later.slice(0,4),+later.slice(4,6)-1,+later.slice(6,8));
  return Math.floor((b-a)/86400000);
}
function usage(){
  console.error('Usage: node scripts/sackmann-weekly-rankings-asof.mjs --tour atp|wta --matches normalized.csv --rankings weekly-rankings.csv --output research-matches.csv [--report report.json]');
  process.exit(2);
}
function write(stream,line){
  return new Promise((resolve,reject)=>{
    if(stream.destroyed) return reject(new Error('Output stream is destroyed'));
    if(stream.write(line)) return resolve();
    const cleanup=()=>{stream.removeListener('drain',onDrain);stream.removeListener('error',onError);};
    const onDrain=()=>{cleanup();resolve();};
    const onError=error=>{cleanup();reject(error);};
    stream.once('drain',onDrain);
    stream.once('error',onError);
  });
}
async function finish(stream){
  await new Promise((resolve,reject)=>{
    const onError=error=>{stream.removeListener('finish',onFinish);reject(error);};
    const onFinish=()=>{stream.removeListener('error',onError);resolve();};
    stream.once('error',onError);stream.once('finish',onFinish);stream.end();
  });
}
async function main(){
  const tour=arg('--tour'),matches=arg('--matches'),rankings=arg('--rankings'),output=arg('--output'),reportPath=arg('--report');
  if(!['atp','wta'].includes(tour)||!matches||!rankings||!output)usage();
  const inputFiles=[matches,rankings].map(expandHome),out=expandHome(output),report=expandHome(reportPath||output.replace(/\.csv$/i,'-report.json'));
  for(const file of [...inputFiles])if(!fs.existsSync(file))throw new Error('Input not found: '+file);
  if(out===inputFiles[0]||out===inputFiles[1]||report===inputFiles[0]||report===inputFiles[1])throw new Error('Output/report must not overwrite an input file');
  await fs.promises.mkdir(path.dirname(out),{recursive:true});
  await fs.promises.mkdir(path.dirname(report),{recursive:true});

  const rankIter=csvRows(inputFiles[1])[Symbol.asyncIterator]();
  const rankHead=await rankIter.next();
  if(rankHead.done||rankHead.value.fields!==null)throw new Error('Ranking file is empty or has no header');
  const rh=rankHead.value.header;
  const ri={date:rh.indexOf('ranking_date'),id:rh.indexOf('player_id'),rank:rh.indexOf('rank'),points:rh.indexOf('points')};
  if(Object.values(ri).some(x=>x<0))throw new Error('Rankings require ranking_date, player_id, rank, points');
  let nextRank=await rankIter.next(),rankDateLast='';
  const latest=new Map();
  function consumeRanking(row){
    const date=String(row[ri.date]??'').trim(),id=String(row[ri.id]??'').trim();
    if(!/^\d{8}$/.test(date)||!id)return;
    if(rankDateLast&&date<rankDateLast)throw new Error('Ranking file is not chronological: '+date+' follows '+rankDateLast);
    rankDateLast=date;latest.set(id,{date,rank:String(row[ri.rank]??'').trim(),points:String(row[ri.points]??'').trim()});
  }
  if(nextRank.done)throw new Error('Ranking file has no data rows');
  const rankFirst=nextRank.value;
  let pendingRank=rankFirst.fields;
  const miIter=csvRows(inputFiles[0])[Symbol.asyncIterator]();
  const matchHead=await miIter.next();
  if(matchHead.done||matchHead.value.fields!==null)throw new Error('Match archive is empty');
  const mh=matchHead.value.header;
  const mi={date:mh.indexOf('tourney_date'),winner:mh.indexOf('winner_id'),loser:mh.indexOf('loser_id')};
  if(Object.values(mi).some(x=>x<0))throw new Error('Match archive requires tourney_date, winner_id, loser_id');
  const additions=['winner_weekly_rank','winner_weekly_rank_date','winner_weekly_points','loser_weekly_rank','loser_weekly_rank_date','loser_weekly_points'];
  if(additions.some(x=>mh.includes(x)))throw new Error('Match archive already contains one or more weekly ranking output columns');
  const writer=fs.createWriteStream(out);
  await write(writer,csvLine([...mh,...additions]));
  const stats={schemaVersion:1,readOnlyInputs:true,tour,matchRows:0,rankRowsConsumed:0,winnerRankMatched:0,loserRankMatched:0,missingWinnerRank:0,missingLoserRank:0,missingWinnerPoints:0,missingLoserPoints:0,matchDateRegressions:0,rankingDateRegressions:0,rankAgeDays:{under30:0,'30to89':0,'90plus':0},rankAgeSamples:0};
  let lastMatchDate='';
  async function advanceRanks(date){
    while(pendingRank && String(pendingRank[ri.date]??'').trim()<=date){
      consumeRanking(pendingRank);stats.rankRowsConsumed++;
      nextRank=await rankIter.next();pendingRank=nextRank.done?null:nextRank.value.fields;
    }
  }
  try{
    for(;;){
      const item=await miIter.next();if(item.done)break;
      const row=item.value.fields;
      const date=String(row[mi.date]??'').trim(),winner=String(row[mi.winner]??'').trim(),loser=String(row[mi.loser]??'').trim();
      if(!/^\d{8}$/.test(date))throw new Error('Invalid match date at row '+(stats.matchRows+2)+': '+date);
      if(lastMatchDate&&date<lastMatchDate)throw new Error('Match archive is not chronological: '+date+' follows '+lastMatchDate);
      lastMatchDate=date;
      await advanceRanks(date);
      const w=latest.get(winner),l=latest.get(loser);
      if(w){stats.winnerRankMatched++;const age=daysBetween(w.date,date);stats.rankAgeSamples++;if(age<30)stats.rankAgeDays.under30++;else if(age<90)stats.rankAgeDays['30to89']++;else stats.rankAgeDays['90plus']++;if(!w.points)stats.missingWinnerPoints++;}
      else stats.missingWinnerRank++;
      if(l){stats.loserRankMatched++;const age=daysBetween(l.date,date);stats.rankAgeSamples++;if(age<30)stats.rankAgeDays.under30++;else if(age<90)stats.rankAgeDays['30to89']++;else stats.rankAgeDays['90plus']++;if(!l.points)stats.missingLoserPoints++;}
      else stats.missingLoserRank++;
      await write(writer,csvLine([...row,w?.rank||'',w?.date||'',w?.points||'',l?.rank||'',l?.date||'',l?.points||'']));
      stats.matchRows++;
    }
    await finish(writer);
  }catch(error){writer.destroy();throw error;}
  stats.rankingDateRegressions=0;
  stats.winnerRankCoverage=stats.matchRows?Number((stats.winnerRankMatched/stats.matchRows).toFixed(6)):null;
  stats.loserRankCoverage=stats.matchRows?Number((stats.loserRankMatched/stats.matchRows).toFixed(6)):null;
  stats.output=out;stats.report=report;stats.createdAt=new Date().toISOString();
  await fs.promises.writeFile(report,JSON.stringify(stats,null,2)+'\n');
  console.log(JSON.stringify(stats,null,2));
}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
