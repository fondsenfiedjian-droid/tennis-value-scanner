#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseCsv } from "./backtest.mjs";

const VBT=/^valuebetennis-matchs-(\d{4})\.csv$/i;
const SACK=/^(atp|wta)_matches_(?:(futures|qual_chall|qual_itf)_)?(\d{4})\.csv$/i;
const normalize=value=>String(value??"").normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
const surface=value=>{
  const s=normalize(value);
  if(["hard","dur","durinterieur","hardcourt","indoorhard","outdoorhard"].includes(s))return "hard";
  if(["clay","terrebattue","terre","redclay"].includes(s))return "clay";
  if(["grass","gazon"].includes(s))return "grass";
  if(["carpet","moquette","moquetteinterieur","indoorcarpet"].includes(s))return "carpet";
  return null;
};
const tourney=value=>{
  const s=normalize(value).replace(/^(?:atp|wta)(?:125|250|500|1000)?/,"");
  const aliases={
    rolandgarros:"frenchopen",frenchopen:"frenchopen",rg:"frenchopen",
    australianopen:"australianopen",ao:"australianopen",
    wimbledon:"wimbledon",usopen:"usopen",
    bnpparibasopen:"indianwells",indianwells:"indianwells",
    miamiopen:"miami",miami:"miami",
    romemasters:"rome",internazionalibnlditalia:"rome",
    madridopen:"madrid",madridmasters:"madrid",
    parismasters:"paris",rolexparismasters:"paris",
    montecarlo:"montecarlo",montecarlomasters:"montecarlo",
    australianopenmelbourne:"australianopen",frenchopenparis:"frenchopen",usopennewyork:"usopen",wimbledonlondon:"wimbledon",
    mutuamadridopenmadrid:"madrid",internazionalibnlditaliarome:"rome",miamiopenmiami:"miami",miamimasters:"miami",
    bnpparibasopenindianwells:"indianwells",indianwellsmasters:"indianwells",chinaopenbeijing:"beijing",
    montecarlorolexmastersmontecarlo:"montecarlo",dubaidutyfreechampionshipsdubai:"dubai",
    shanghairolexmastersshanghai:"shanghai",shanghaimasters:"shanghai",rolexparismastersparis:"paris",
    citiopenwashington:"washington",libemaopenshertogenbosch:"shertogenbosch",asbclassicauckland:"auckland",
    brisbaneinternationalbrisbane:"brisbane",barcelonaopenbancsabadellbarcelona:"barcelona",
    creditonecharlestonopencharleston:"charleston",adelaideinternationaladelaide:"adelaide",
    westernsouthernopencincinnati:"cincinnati",cincinnatimasters:"cincinnati",cincinnatiopencincinnati:"cincinnati",
    winstonsalemopenwinstonsalem:"winstonsalem",qatartotalenergiesopendoha:"doha",
    hongkongtennisopenhongkong:"hongkong",bmwopenmunich:"munich",
    dubaidutyfreetennischampionshipsdubai:"dubai",rothesayinternationaleastbourne:"eastbourne",
    unitedcupaustralia:"unitedcup",abiertomexicanotelcelacapulco:"acapulco",
    tennisinthelandcleveland:"cleveland",porschetennisgrandprixstuttgart:"stuttgart",
    w15sandiego:"w15sandiegoca",m15sandiego:"m15sandiegoca",francavillach:"francavillaalmarech",
    nordeaopenbastad:"bastad",copacolsanitasbogota:"bogota",cinchchampionshipslondon:"queensclub",
    sttropezch:"sainttropezch",grandprixhassaniimarrakech:"marrakech",qatarexxonmobilopendoha:"doha",
    moselleopenmetz:"metz",abiertognpsegurosmonterrey:"monterrey",internationauxdestrasbourgstrasbourg:"strasbourg",
    hobartinternationalhobart:"hobart",gonetgenevaopengeneva:"geneva",plavalagunacroatiaopenumag:"umag",
    mallorcachampionshipsmallorca:"mallorca",usmensclaycourtchampionshiphouston:"houston",
    nationalbankopentoronto:"canadamasters",erstebankopenvienna:"vienna",palermoladiesopenpalermo:"palermo",
    genovach:"genoach",delraybeachopendelraybeach:"delraybeach",generaliopenkitzbuhel:"kitzbuhel",
    transylvaniaopenclujnapoca:"clujnapoca",adelaideinternational1adelaide:"adelaide1",
    meridaopenakronmerida:"merida",argentinaopenbuenosaires:"buenosaires",hungariangrandprixbudapest:"budapest",
    europeanopenhamburg:"hamburg",open13provencemarseille:"marseille",omniumbanquenationalemontreal:"montreal",
    guadalajaraopenakronguadalajara:"guadalajara",upperaustrialadieslinzlinz:"linz",
    w100bonitasprings:"w100bonitaspringsfl",m15fayetteville:"m15fayettevillear",w60rome:"w60romega",
    w25orlando:"w25orlandofl",w25bocaraton:"w25bocaratonfl",m15ithaca:"m15ithacany",
    w100landisville:"w100landisvillepa",w80tyler:"w80tylertx",m25calabasas:"m25calabasasca",
    m25austin:"m25austintx",m25bakersfield:"m25bakersfieldca",w60orlando:"w60orlandofl",
    m25columbus:"m25columbusoh",w60charlottesville:"w60charlottesvilleva",w15hiltonhead:"w15hiltonheadsc",
    w35bocaraton:"w35bocaratonfl",w100charleston:"w100charlestonsc",
    m15lakewood:"m15lakewoodca",m15verobeach:"m15verobeachfl",m15orangepark:"m15orangeparkfl",
    openparclyon:"lyon",open6senslyon:"lyon",badhomburgopenbadhomburg:"badhomburg",
    toraypanpacificopentokyo:"tokyo",dallasopendallas:"dallas",
    open35desaintmalosaintmalo:"saintmalo125",
    livesportpragueopenprague:"prague",rioopenriodejaneiro:"riodejaneiro",
    nationalbankopenmontreal:"canadamasters"
  };
  if(aliases[s])return aliases[s];
  if(s.endsWith("challenger"))return s.slice(0,-10)+"ch";
  return s;
};
const parseVbtDate=value=>{
  const s=String(value??"").trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  const t=Date.UTC(+m[1],+m[2]-1,+m[3]);
  const d=new Date(t);
  return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?t/86400000:null;
};
const parseSackDate=value=>{
  const s=String(value??"").trim();
  if(!/^\d{8}$/.test(s))return null;
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8),t=Date.UTC(y,m-1,d),dt=new Date(t);
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?t/86400000:null;
};
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;

export function auditValuebetSackmann(valuebetFiles,sackmannFiles,{maxDateOffsetDays=14,playerFiles=[]}={}){
  if(!valuebetFiles.length||!sackmannFiles.length)throw new Error("Both Valuebetennis and Sackmann files are required");
  const sackIndex=new Map(),sackPairIndex=new Map(),sourceRows={},sourceRowsByYear={};
  const registryNameIndex={ATP:new Map(),WTA:new Map()},registryMeta={ATP:new Map(),WTA:new Map()};
  for(const file of playerFiles){
    const fileName=basename(file.filename).toLowerCase();
    const tour=fileName.startsWith("atp_")?"ATP":fileName.startsWith("wta_")?"WTA":null;
    if(!tour)throw new Error("Unexpected player registry filename: "+basename(file.filename));
    for(const row of parseCsv(file.content)){
      const id=String(row.player_id??row.id??"").trim();
      const first=String(row.name_first??row.first_name??"").trim(),last=String(row.name_last??row.last_name??"").trim();
      if(id)registryMeta[tour].set(id,{dob:String(row.dob??"").trim(),ioc:String(row.ioc??"").trim().toUpperCase(),hand:String(row.hand??"").trim().toUpperCase()});
      if(!id||(!first&&!last))continue;
      for(const name of new Set([normalize([first,last].filter(Boolean).join(" ")),normalize([last,first].filter(Boolean).join(" "))])){
        if(!name)continue;
        if(!registryNameIndex[tour].has(name))registryNameIndex[tour].set(name,new Set());
        registryNameIndex[tour].get(name).add(id);
      }
    }
  }
  for(const file of sackmannFiles){
    const m=basename(file.filename).match(SACK);
    if(!m)throw new Error("Unexpected Sackmann filename: "+basename(file.filename));
    const tour=m[1].toUpperCase(),tier=m[2]||"main",year=m[3];
    const rows=parseCsv(file.content);
    sourceRows[tour+":"+tier]=(sourceRows[tour+":"+tier]||0)+rows.length;
    sourceRowsByYear[tour+":"+year]=(sourceRowsByYear[tour+":"+year]||0)+rows.length;
    for(const row of rows){
      const a=normalize(row.winner_name),b=normalize(row.loser_name);
      const date=parseSackDate(row.tourney_date),sf=surface(row.surface);
      if(!a||!b||a===b||date===null||!sf)continue;
      const pairKey=[tour,[a,b].sort().join("|")].join("::");
      const key=pairKey+"::"+sf;
      const record={date,tier,year,surface:sf,event:tourney(row.tourney_name),winnerId:String(row.winner_id??"").trim(),loserId:String(row.loser_id??"").trim(),winnerName:a,loserName:b};
      if(!sackIndex.has(key))sackIndex.set(key,[]);
      sackIndex.get(key).push(record);
      if(!sackPairIndex.has(pairKey))sackPairIndex.set(pairKey,[]);
      sackPairIndex.get(pairKey).push(record);
    }
  }
  const totals={valuebetRows:0,validValuebetRows:0,candidateRows:0,linkedUnique:0,linkedWithoutTournament:0,linkedByTournament:0,eventNameExactMatch:0,eventNameMismatch:0,eventNameUnavailableInSackmann:0,sourceEventMissing:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0};
  const byTour={},byYear={},byCategory={},byTourCategory={},offsets=[],eventMismatchPairs=new Map();
  const sourcePlayerIds={ATP:new Set(),WTA:new Set()},sourceIdEvidence={ATP:new Map(),WTA:new Map()},directNameEvidence={ATP:new Map(),WTA:new Map()};
  let matchRowsWithBothPlayerIdsEvidence=0;
  const valuebetSchema={columns:[],categorical:{}};
  for(const file of valuebetFiles){
    const m=basename(file.filename).match(VBT);
    if(!m)throw new Error("Unexpected Valuebetennis filename: "+basename(file.filename));
    const rows=parseCsv(file.content,{delimiter:";"});
    if(!valuebetSchema.columns.length)valuebetSchema.columns=Object.keys(rows[0]||{});
    const categoryKeys=Object.keys(rows[0]||{}).filter(k=>/^(genre|surface|niveau|level|category|round|tour|type|competition|categorie)$/i.test(k));
    for(const key of categoryKeys){
      const counts=valuebetSchema.categorical[key]||(valuebetSchema.categorical[key]={});
      for(const row of rows){const value=String(row[key]??"").trim()||"(empty)";counts[value]=(counts[value]||0)+1;}
    }
    const yearBucket=byYear[m[1]]||(byYear[m[1]]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidDate:0,unknownSurface:0,unknownTour:0});
    for(const row of rows){
      yearBucket.rows++;
      totals.valuebetRows++;
      const category=String(row.categorie??"").trim()||"(empty)";
      const cg=byCategory[category]||(byCategory[category]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
      cg.rows++;
      const tour=String(row.genre??"").trim().toUpperCase();
      if(["ATP","WTA"].includes(tour))for(const side of ["joueur1","joueur2"]){
        const id=String(row[side+"_id"]??"").trim(),name=normalize(row[side]);
        if(id)sourcePlayerIds[tour].add(id);
        const ids=registryNameIndex[tour].get(name);
        if(id&&ids){
          if(!directNameEvidence[tour].has(id))directNameEvidence[tour].set(id,new Set());
          for(const candidateId of ids)directNameEvidence[tour].get(id).add(candidateId);
        }
      }
      const tourCategoryKey=(tour||"(empty)")+"::"+category;
      const tcg=byTourCategory[tourCategoryKey]||(byTourCategory[tourCategoryKey]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
      tcg.rows++;
      const date=parseVbtDate(row.date),a=normalize(row.joueur1),b=normalize(row.joueur2);
      if(!byTour[tour])byTour[tour]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,linkedWithoutTournament:0,linkedByTournament:0,eventNameExactMatch:0,eventNameMismatch:0,eventNameUnavailableInSackmann:0,sourceEventMissing:0,ambiguous:0,noCandidate:0,invalidDate:0,unknownSurface:0};
      const g=byTour[tour];g.rows++;
      if(!["ATP","WTA"].includes(tour)){totals.unknownTour++;yearBucket.unknownTour++;cg.unknownTour++;tcg.unknownTour++;continue;}
      if(date===null){totals.invalidDate++;g.invalidDate++;yearBucket.invalidDate++;cg.invalidDate++;tcg.invalidDate++;continue;}
      if(!a||!b||a===b){totals.noCandidate++;totals.invalidPlayerPair++;g.noCandidate++;yearBucket.noCandidate++;cg.noCandidate++;tcg.noCandidate++;cg.invalidPlayerPair++;tcg.invalidPlayerPair++;continue;}
      const sf=surface(row.surface),ev=tourney(row.tournoi);
      totals.validValuebetRows++;g.validRows++;yearBucket.validRows++;cg.validRows++;tcg.validRows++;
      if(!sf){
        totals.unknownSurface++;g.unknownSurface++;yearBucket.unknownSurface++;cg.unknownSurface++;tcg.unknownSurface++;
        totals.noCandidate++;g.noCandidate++;yearBucket.noCandidate++;cg.noCandidate++;tcg.noCandidate++;
        continue;
      }
      const key=[tour,[a,b].sort().join("|"),sf].join("::");
      const pairKey=[tour,[a,b].sort().join("|")].join("::");
      const samePair=sackPairIndex.get(pairKey)||[];
      const samePairSurface=samePair.filter(x=>x.surface===sf);
      const candidates=samePairSurface.filter(x=>Math.abs(date-x.date)<=maxDateOffsetDays);
      if(!samePair.length){totals.pairAbsent++;cg.pairAbsent++;tcg.pairAbsent++;yearBucket.pairAbsent++;}
      else if(!samePairSurface.length){totals.surfaceAbsent++;cg.surfaceAbsent++;tcg.surfaceAbsent++;yearBucket.surfaceAbsent++;}
      else if(!candidates.length){totals.dateWindowMiss++;cg.dateWindowMiss++;tcg.dateWindowMiss++;yearBucket.dateWindowMiss++;}
      if(candidates.length){totals.candidateRows++;g.candidateRows++;yearBucket.candidateRows++;cg.candidateRows++;tcg.candidateRows++;}
      const eventCandidates=ev?candidates.filter(x=>x.event===ev):[];
      const selected=candidates.length===1?candidates[0]:(eventCandidates.length===1?eventCandidates[0]:null);
      if(selected){
        totals.linkedUnique++;g.linkedUnique++;yearBucket.linkedUnique++;cg.linkedUnique++;tcg.linkedUnique++;
        if(candidates.length===1){totals.linkedWithoutTournament++;g.linkedWithoutTournament++;}
        else{totals.linkedByTournament++;g.linkedByTournament++;}
        if(!ev){totals.sourceEventMissing++;g.sourceEventMissing++;}
        else if(!selected.event){totals.eventNameUnavailableInSackmann++;g.eventNameUnavailableInSackmann++;}
        else if(selected.event===ev){totals.eventNameExactMatch++;g.eventNameExactMatch++;}
        else{totals.eventNameMismatch++;g.eventNameMismatch++;const mismatchKey=ev+" -> "+selected.event;eventMismatchPairs.set(mismatchKey,(eventMismatchPairs.get(mismatchKey)||0)+1);}
        offsets.push(date-selected.date);
        const source1=String(row.joueur1_id??"").trim(),source2=String(row.joueur2_id??"").trim();
        const sackFor=(name)=>name===selected.winnerName?selected.winnerId:name===selected.loserName?selected.loserId:"";
        const sack1=sackFor(a),sack2=sackFor(b);
        if(source1&&source2&&sack1&&sack2){
          if(!sourceIdEvidence[tour].has(source1))sourceIdEvidence[tour].set(source1,new Set());
          if(!sourceIdEvidence[tour].has(source2))sourceIdEvidence[tour].set(source2,new Set());
          sourceIdEvidence[tour].get(source1).add(sack1);
          sourceIdEvidence[tour].get(source2).add(sack2);
          matchRowsWithBothPlayerIdsEvidence++;
        }
      }else if(candidates.length>1){totals.ambiguous++;g.ambiguous++;yearBucket.ambiguous++;cg.ambiguous++;tcg.ambiguous++;}
      else{totals.noCandidate++;g.noCandidate++;yearBucket.noCandidate++;cg.noCandidate++;tcg.noCandidate++;}
    }
  }
  const sorted=offsets.slice().sort((a,b)=>a-b);
  totals.linkagePct=pct(totals.linkedUnique,totals.validValuebetRows);
  const playerIdEvidence={};
  for(const tour of ["ATP","WTA"]){
    let resolvedToSingleSackmannId=0,conflictingSackmannIds=0;
    const conflictProfile={sameBirthDateAndCountry:0,differentBirthDateOrCountry:0,missingRegistryMetadata:0};
    for(const ids of sourceIdEvidence[tour].values()){
      if(ids.size===1)resolvedToSingleSackmannId++;
      else if(ids.size>1){
        conflictingSackmannIds++;
        const metas=[...ids].map(id=>registryMeta[tour].get(id));
        if(metas.some(m=>!m||!m.dob||!m.ioc))conflictProfile.missingRegistryMetadata++;
        else if(new Set(metas.map(m=>m.dob+"::"+m.ioc)).size===1)conflictProfile.sameBirthDateAndCountry++;
        else conflictProfile.differentBirthDateOrCountry++;
      }
    }
    playerIdEvidence[tour]={
      distinctValuebetPlayerIds:sourcePlayerIds[tour].size,
      withAcceptedMatchEvidence:sourceIdEvidence[tour].size,
      resolvedToSingleSackmannId,
      conflictingSackmannIds,
      conflictProfile,
      withoutAcceptedMatchEvidence:sourcePlayerIds[tour].size-sourceIdEvidence[tour].size,
      resolutionPct:pct(resolvedToSingleSackmannId,sourcePlayerIds[tour].size)
    };
  }
  const playerIdComparison=playerFiles.length?{}:null;
  if(playerIdComparison){
    for(const tour of ["ATP","WTA"]){
      const counts={distinctValuebetPlayerIds:sourcePlayerIds[tour].size,directUnique:0,matchEvidenceUnique:0,bothUniqueAgreement:0,bothUniqueDisagreement:0,directOnlyUnique:0,matchOnlyUnique:0,ambiguousInEither:0,neitherUnique:0};
      for(const sourceId of sourcePlayerIds[tour]){
        const direct=directNameEvidence[tour].get(sourceId)||new Set();
        const match=sourceIdEvidence[tour].get(sourceId)||new Set();
        if(direct.size===1)counts.directUnique++;
        if(match.size===1)counts.matchEvidenceUnique++;
        if(direct.size===1&&match.size===1){
          if([...direct][0]===[...match][0])counts.bothUniqueAgreement++;
          else counts.bothUniqueDisagreement++;
        }else if(direct.size===1&&match.size===0)counts.directOnlyUnique++;
        else if(direct.size===0&&match.size===1)counts.matchOnlyUnique++;
        else if(direct.size>1||match.size>1)counts.ambiguousInEither++;
        else counts.neitherUnique++;
      }
      counts.bothUniqueAgreementPct=pct(counts.bothUniqueAgreement,counts.distinctValuebetPlayerIds);
      playerIdComparison[tour]=counts;
    }
  }
  for(const [tour,g] of Object.entries(byTour))g.linkagePct=pct(g.linkedUnique,g.validRows);
  return {
    schemaVersion:2,
    purpose:"Conservative aggregate-only linkage audit; no match-level or player-level links are written.",
    sources:{valuebetennisFiles:valuebetFiles.map(x=>basename(x.filename)).sort(),sackmannFiles:sackmannFiles.map(x=>basename(x.filename)).sort(),sackmannSourceRows:sourceRows,sackmannSourceRowsByYear:sourceRowsByYear},
    matching:{playerNames:"exact normalized full-name pair, order-independent",tournament:"not required for a single player-pair/surface/date candidate; exact normalized name or explicit alias is used only to resolve multiple candidates",surface:"normalized exact surface, including French Valuebetennis labels",date:"absolute difference from Sackmann tourney_date <= "+maxDateOffsetDays+" days",acceptance:"one candidate is accepted; multiple candidates require exactly one tournament-name match, otherwise remain ambiguous"},
    eventNameDiagnostics:{method:"For accepted links, compare normalized source tournament name with Sackmann tournament name; a mismatch is diagnostic only and does not automatically reject a unique pair/surface/date candidate.",topMismatchPairs:[...eventMismatchPairs].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([pair,count])=>({pair,count}))},
    totals:{
      ...totals,
      dateOffsetDays:sorted.length?{count:sorted.length,min:sorted[0],median:sorted[Math.floor((sorted.length-1)/2)],p90:sorted[Math.floor((sorted.length-1)*.9)],max:sorted.at(-1)}:null
    },
    byTour,
    playerIdEvidence:{method:"accepted unique match links only; Valuebetennis player IDs are associated with Sackmann winner/loser IDs by exact normalized name orientation",matchRowsWithBothPlayerIdsEvidence,byTour:playerIdEvidence},
    playerIdComparison,
    byCategory:Object.fromEntries(Object.entries(byCategory).map(([category,g])=>[category,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    byTourCategory:Object.fromEntries(Object.entries(byTourCategory).map(([key,g])=>[key,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    valuebetSchema:{columns:valuebetSchema.columns,categorical:Object.fromEntries(Object.entries(valuebetSchema.categorical).map(([key,counts])=>{const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);return [key,{distinctValues:entries.length,topValues:entries.slice(0,30).map(([value,count])=>({value,count})),otherRows:entries.slice(30).reduce((n,x)=>n+x[1],0)}]}))},
    byYear:Object.fromEntries(Object.entries(byYear).map(([year,g])=>[year,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    warnings:[
      "This is a conservative linkage audit. A single candidate is linked by exact normalized player pair, surface and date window; tournament names are used only to resolve multiple candidates.",
      "Sackmann tourney_date is generally the event-week date, not the exact match date; the date window is a candidate filter, not a claim about match start time.",
      "No initials/fuzzy-name matching is attempted. Match-evidence player-ID links are emitted only as aggregate counts and never as raw crosswalk rows.",
      "Do not merge rows into Production. Use only the aggregate report to assess source overlap and data quality.",
      "Jeff Sackmann data is CC BY-NC-SA 4.0; non-commercial use, attribution and share-alike conditions apply."
    ]
  };
}

async function main(){
  const args=process.argv.slice(2);let vdir="",sdir="",out="aggregator1-linkage-audit.json",window=14;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--valuebet-dir")vdir=args[++i];
    else if(args[i]==="--sackmann-dir")sdir=args[++i];
    else if(args[i]==="--out")out=args[++i];
    else if(args[i]==="--date-window")window=Number(args[++i]);
    else throw new Error("Usage: node scripts/aggregator1-linkage-audit.mjs --valuebet-dir DIR --sackmann-dir DIR [--date-window 14] [--out report.json]");
  }
  if(!vdir||!sdir||!Number.isInteger(window)||window<0||window>31)throw new Error("Invalid input directories or date window");
  const vnames=(await readdir(vdir)).filter(n=>VBT.test(n)).sort();
  const snames=(await readdir(sdir)).filter(n=>SACK.test(n)).sort();
  const pnames=(await readdir(sdir)).filter(n=>/^(atp|wta)_players\.csv$/i.test(n)).sort();
  const vfiles=[];for(const n of vnames)vfiles.push({filename:n,content:await readFile(join(vdir,n),"utf8")});
  const sfiles=[];for(const n of snames)sfiles.push({filename:n,content:await readFile(join(sdir,n),"utf8")});
  const pfiles=[];for(const n of pnames)pfiles.push({filename:n,content:await readFile(join(sdir,n),"utf8")});
  const report=auditValuebetSackmann(vfiles,sfiles,{maxDateOffsetDays:window,playerFiles:pfiles});
  await writeFile(out,JSON.stringify(report,null,2)+"\n");
  console.log("Valuebetennis rows: "+report.totals.valuebetRows);
  console.log("Unique links: "+report.totals.linkedUnique+" ("+report.totals.linkagePct+"% of valid rows); ambiguous: "+report.totals.ambiguous);
  console.log("Player ID comparison: "+JSON.stringify(report.playerIdComparison));
  console.log("Aggregate report written to "+out);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
