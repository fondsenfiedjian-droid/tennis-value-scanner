#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const norm=v=>String(v??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const surface=v=>{
  const s=norm(v);
  if(["hard","dur","durinterieur","hardcourt","indoorhard","outdoorhard"].includes(s))return "hard";
  if(["clay","terrebattue","terre","redclay"].includes(s))return "clay";
  if(["grass","gazon"].includes(s))return "grass";
  if(["carpet","moquette","moquetteinterieur","indoorcarpet"].includes(s))return "carpet";
  return null;
};
const day=v=>{
  let s=String(v??"").trim();
  if(s.includes("-"))s=s.slice(0,10).replaceAll("-","");else s=s.slice(0,8);
  if(s.length!==8||!/^\d{8}$/.test(s))return null;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8),t=Date.UTC(y,m-1,d),dt=new Date(t);
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?t/86400000:null;
};
const eventKey=v=>norm(v).replace(/^(?:atp|wta)(?:125|250|500|1000)?/,"");
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
const pairNames=r=>[norm(r.winner_name),norm(r.loser_name)].sort().join("|");
const pairIds=(a,b)=>[String(a),String(b)].sort().join("|");
const eventAliases={
  rolandgarros:"frenchopen",frenchopen:"frenchopen",rg:"frenchopen",
  australianopen:"australianopen",ao:"australianopen",wimbledon:"wimbledon",usopen:"usopen",
  bnpparibasopen:"indianwells",indianwells:"indianwells",miamiopen:"miami",miami:"miami",
  romemasters:"rome",internazionalibnlditalia:"rome",madridopen:"madrid",madridmasters:"madrid",
  parismasters:"paris",rolexparismasters:"paris",montecarlo:"montecarlo",montecarlomasters:"montecarlo"
};
const eventNorm=v=>{const s=eventKey(v);return eventAliases[s]||s;};

export function auditValuebetIdBridge(valuebetFiles,tmlFiles,sackmannFiles,registryFile,{maxDateOffsetDays=14}={}){
  if(!valuebetFiles.length||!tmlFiles.length||!sackmannFiles.length||!registryFile?.content)throw new Error("Valuebetennis, TennisMyLife, Sackmann and ATP registry inputs are required");
  const registryRows=parseCsv(registryFile.content),registry=new Map(registryRows.filter(r=>r.id).map(r=>[String(r.id).trim(),r]));
  const nameToIds=new Map();
  for(const [id,p] of registry){
    for(const name of [p.atpname,p.player]){
      const n=norm(name);if(!n)continue;
      if(!nameToIds.has(n))nameToIds.set(n,new Set());
      nameToIds.get(n).add(id);
    }
  }
  const sackByYear=new Map(),sackNameIndex=new Map(),sackIdIndex=new Map();
  for(const file of sackmannFiles){
    const m=basename(file.filename).match(/atp_matches_(\d{4})\.csv/i);
    if(!m)throw new Error("Unexpected Sackmann file: "+file.filename);
    const year=m[1],rows=parseCsv(file.content),nameIndex=new Map(),idIndex=new Map();
    for(const row of rows){
      const d=day(row.tourney_date),sf=surface(row.surface);
      if(d===null||!sf||!row.winner_name||!row.loser_name)continue;
      const nk=[sf,pairNames(row)].join("::");
      if(!nameIndex.has(nk))nameIndex.set(nk,[]);
      nameIndex.get(nk).push({row,day:d});
      if(row.winner_id&&row.loser_id){
        const ik=[sf,pairIds(row.winner_id,row.loser_id)].join("::");
        if(!idIndex.has(ik))idIndex.set(ik,[]);
        idIndex.get(ik).push({row,day:d});
      }
    }
    sackByYear.set(year,{nameIndex,idIndex});
    for(const [k,v] of nameIndex)sackNameIndex.set(year+"::"+k,v);
    for(const [k,v] of idIndex)sackIdIndex.set(year+"::"+k,v);
  }

  // Build TML-ID -> Sackmann-ID aliases from independently overlapping ATP matches.
  const crosswalk=new Map(),tmlIdsInMatches=new Set();
  for(const file of tmlFiles){
    const year=basename(file.filename).replace(".csv",""),indexes=sackByYear.get(year);
    if(!indexes)continue;
    for(const row of parseCsv(file.content)){
      const d=day(row.tourney_date),sf=surface(row.surface);if(d===null||!sf)continue;
      const candidates=(indexes.nameIndex.get([sf,pairNames(row)].join("::"))||[]).filter(x=>Math.abs(d-x.day)<=maxDateOffsetDays);
      for(const side of ["winner","loser"]){
        const id=String(row[side+"_id"]??"").trim(),name=row[side+"_name"];
        if(!id||!name)continue;tmlIdsInMatches.add(id);
        for(const candidate of candidates){
          const z=candidate.row;
          const sackSide=norm(name)===norm(z.winner_name)?"winner":norm(name)===norm(z.loser_name)?"loser":null;
          if(!sackSide)continue;
          const ta=Number(row[side+"_age"]),sa=Number(z[sackSide+"_age"]);
          if(ta>0&&sa>0&&Math.abs(ta-sa)>0.6)continue;
          const sid=String(z[sackSide+"_id"]??"").trim();if(!sid)continue;
          if(!crosswalk.has(id))crosswalk.set(id,new Set());
          crosswalk.get(id).add(sid);
        }
      }
    }
  }

  const totals={
    valuebetAtpRows:0,validAtpRows:0,invalidDateRows:0,unknownSurfaceRows:0,
    playerNamesBothInRegistry:0,playerNamesOneOrBothMissing:0,ambiguousRegistryNames:0,
    bothTmlIdsHaveSackmannCrosswalk:0,oneOrBothTmlIdsLackSackmannCrosswalk:0,
    directNameCandidateRows:0,directNameResolvedRows:0,
    idBridgeCandidateRows:0,idBridgeResolvedRows:0,idBridgeUnresolvedAmbiguousRows:0,
    idBridgeNewResolvedRows:0,idBridgeAgreementRows:0,idBridgeDisagreementRows:0
  };
  const byYear={};
  for(const file of valuebetFiles){
    const m=basename(file.filename).match(/valuebetennis-matchs-(\d{4})\.csv/i);
    if(!m)throw new Error("Unexpected Valuebetennis file: "+file.filename);
    const year=m[1],indexes=sackByYear.get(year);
    if(!indexes)continue;
    const y={rows:0,validRows:0,directNameCandidateRows:0,directNameResolvedRows:0,idBridgeCandidateRows:0,idBridgeResolvedRows:0,idBridgeUnresolvedAmbiguousRows:0,idBridgeNewResolvedRows:0};
    byYear[year]=y;
    for(const row of parseCsv(file.content,{delimiter:";"})){
      if(String(row.genre??"").trim().toUpperCase()!=="ATP")continue;
      totals.valuebetAtpRows++;y.rows++;
      const d=day(row.date),sf=surface(row.surface);
      if(d===null){totals.invalidDateRows++;continue;}
      if(!sf){totals.unknownSurfaceRows++;continue;}
      totals.validAtpRows++;y.validRows++;
      const n1=norm(row.joueur1),n2=norm(row.joueur2);
      const nameCandidates1=nameToIds.get(n1)||new Set(),nameCandidates2=nameToIds.get(n2)||new Set();
      if(nameCandidates1.size===1&&nameCandidates2.size===1)totals.playerNamesBothInRegistry++;
      else{
        totals.playerNamesOneOrBothMissing++;
        if(nameCandidates1.size>1||nameCandidates2.size>1)totals.ambiguousRegistryNames++;
      }
      const direct=(indexes.nameIndex.get([sf,[n1,n2].sort().join("|")].join("::"))||[]).filter(x=>Math.abs(d-x.day)<=maxDateOffsetDays);
      if(direct.length)totals.directNameCandidateRows++,y.directNameCandidateRows++;
      const directEvent=direct.filter(x=>eventNorm(x.row.tourney_name)===eventNorm(row.tournoi));
      const directResolved=direct.length===1||(direct.length>1&&directEvent.length===1);
      if(directResolved)totals.directNameResolvedRows++,y.directNameResolvedRows++;

      if(nameCandidates1.size!==1||nameCandidates2.size!==1)continue;
      const id1=[...nameCandidates1][0],id2=[...nameCandidates2][0];
      const sack1=crosswalk.get(id1),sack2=crosswalk.get(id2);
      if(!sack1||!sack2){totals.oneOrBothTmlIdsLackSackmannCrosswalk++;continue;}
      totals.bothTmlIdsHaveSackmannCrosswalk++;
      const idCandidates=new Map();
      for(const a of sack1)for(const b of sack2){
        if(a===b)continue;
        const key=[sf,pairIds(a,b)].join("::");
        for(const x of indexes.idIndex.get(key)||[]){
          if(Math.abs(d-x.day)<=maxDateOffsetDays){
            const matchKey=[x.row.tourney_date,x.row.match_num,x.row.tourney_name,pairIds(x.row.winner_id,x.row.loser_id)].join("~");
            idCandidates.set(matchKey,x);
          }
        }
      }
      const candidates=[...idCandidates.values()];
      if(candidates.length)totals.idBridgeCandidateRows++,y.idBridgeCandidateRows++;
      const idEvent=candidates.filter(x=>eventNorm(x.row.tourney_name)===eventNorm(row.tournoi));
      const idResolved=candidates.length===1||(candidates.length>1&&idEvent.length===1);
      if(idResolved){
        totals.idBridgeResolvedRows++;y.idBridgeResolvedRows++;
        if(!directResolved)totals.idBridgeNewResolvedRows++,y.idBridgeNewResolvedRows++;
        else{
          const dk=direct.length===1?[direct[0].row.tourney_date,direct[0].row.match_num,direct[0].row.tourney_name].join("~"):
            [directEvent[0].row.tourney_date,directEvent[0].row.match_num,directEvent[0].row.tourney_name].join("~");
          const ik=[(candidates.length===1?candidates[0]:idEvent[0]).row.tourney_date,(candidates.length===1?candidates[0]:idEvent[0]).row.match_num,(candidates.length===1?candidates[0]:idEvent[0]).row.tourney_name].join("~");
          if(dk===ik)totals.idBridgeAgreementRows++;else totals.idBridgeDisagreementRows++;
        }
      }else if(candidates.length>1)totals.idBridgeUnresolvedAmbiguousRows++,y.idBridgeUnresolvedAmbiguousRows++;
    }
  }
  totals.directNameCoveragePct=pct(totals.directNameResolvedRows,totals.validAtpRows);
  totals.idBridgeCoveragePct=pct(totals.idBridgeResolvedRows,totals.validAtpRows);
  totals.additionalResolvedRows=totals.idBridgeNewResolvedRows;
  for(const y of Object.values(byYear)){
    y.directNameCoveragePct=pct(y.directNameResolvedRows,y.validRows);
    y.idBridgeCoveragePct=pct(y.idBridgeResolvedRows,y.validRows);
  }
  return {
    schemaVersion:1,
    purpose:"Aggregate-only test of whether TennisMyLife ATP IDs improve Valuebetennis-to-Sackmann linkage; no player-level crosswalk is exported.",
    sources:{
      valuebetennisFiles:valuebetFiles.map(x=>basename(x.filename)).sort(),
      tmlFiles:tmlFiles.map(x=>basename(x.filename)).sort(),
      sackmannFiles:sackmannFiles.map(x=>basename(x.filename)).sort(),
      tmlRegistryRows:registryRows.length,
      tmlPlayerIdsInMatchData:tmlIdsInMatches.size,
      tmlPlayerIdsWithSackmannCrosswalk:crosswalk.size
    },
    matching:{
      direct:"exact normalized Valuebetennis player-name pair, exact surface, date window",
      idBridge:"exact Valuebetennis name to unique TennisMyLife ATP registry ID, then to Sackmann ID alias set, exact surface and date window",
      date:"absolute difference between tournament-week dates <= "+maxDateOffsetDays+" days",
      ambiguity:"one candidate accepted; otherwise unique normalized tournament-name match; unresolved candidates are not counted",
      scope:"ATP only; WTA is excluded because this TML registry and crosswalk are ATP-specific"
    },
    totals,byYear,
    warnings:[
      "This is an aggregate comparison, not proof that every ID-linked match is correct; inspect any ID-bridge-only gains before operational use.",
      "The TML-to-Sackmann player crosswalk is derived from overlapping match rows and is not exported.",
      "Unknown surfaces and non-ATP rows are excluded from this test.",
      "TennisMyLife public terms restrict use to personal, educational and non-commercial research; commercial model use requires prior written permission.",
      "No data from this audit is merged into Production."
    ]
  };
}

async function main(){
  const args=process.argv.slice(2);let vdir="",tdir="",sdir="",registryPath="",out="audit-output/aggregator1-valuebet-id-bridge.json",window=14;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--valuebet-dir")vdir=args[++i];
    else if(args[i]==="--tml-dir")tdir=args[++i];
    else if(args[i]==="--sackmann-dir")sdir=args[++i];
    else if(args[i]==="--registry")registryPath=args[++i];
    else if(args[i]==="--date-window")window=Number(args[++i]);
    else if(args[i]==="--out")out=args[++i];
    else throw new Error("Usage: node scripts/aggregator1-valuebet-id-bridge.mjs --valuebet-dir DIR --tml-dir DIR --sackmann-dir DIR --registry FILE");
  }
  if(!vdir||!tdir||!sdir||!registryPath||!Number.isInteger(window)||window<0||window>31)throw new Error("Invalid input paths or date window");
  const vnames=(await readdir(vdir)).filter(n=>/^valuebetennis-matchs-\d{4}\.csv$/i.test(n)).sort();
  const tnames=(await readdir(tdir)).filter(n=>/^\d{4}\.csv$/i.test(n)).sort();
  const snames=(await readdir(sdir)).filter(n=>/^atp_matches_\d{4}\.csv$/i.test(n)).sort();
  const load=async(dir,names)=>{const out=[];for(const n of names)out.push({filename:n,content:await readFile(join(dir,n),"utf8")});return out;};
  const report=auditValuebetIdBridge(await load(vdir,vnames),await load(tdir,tnames),await load(sdir,snames),{filename:basename(registryPath),content:await readFile(registryPath,"utf8")},{maxDateOffsetDays:window});
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log("ATP Valuebetennis rows: "+report.totals.valuebetAtpRows);
  console.log("Direct name links: "+report.totals.directNameResolvedRows+"; TML ID bridge links: "+report.totals.idBridgeResolvedRows);
  console.log("Additional ID-bridge links: "+report.totals.idBridgeNewResolvedRows);
  console.log("Aggregate report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
