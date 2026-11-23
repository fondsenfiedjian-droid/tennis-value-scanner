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
    nationalbankopenmontreal:"canadamasters",
    // Explicit source-name variants observed in the full archive audit.
    m15naples:"m15naplesfl",m15naplesfl:"m15naplesfl",
    w25naples:"w25naplesfl",w25naplesfl:"w25naplesfl",
    rothesayopennottingham:"nottingham",millenniumestorilopenestoril:"estoril",
    sandiegoopensandiego:"sandiego",opencapfinancesrouenmetropolerouen:"rouen",
    koreaopenseoul:"seoul",wuhanopenwuhan:"wuhan",terrawortmannopenhalle:"halle",
    jasminopentunisiamonastir:"monastir",hamburgeuropeanopenhamburg:"hamburg",
    atxopenaustin:"austin",abnamroworldtennistournamentrotterdam:"rotterdam",
    swissindoorsbaselbasel:"basel",w25austin:"w25austintx",
    olympicstokyo:"tokyoolympics",dowtennisclassicmidland:"midland125",
    openblsdelimogeslimoges:"limoges125",bossopenstuttgart:"stuttgart",
    australianopenqualifyingdoha:"dohaausopenqualies",opensuddefrancemontpellier:"montpellier",
    sofiaopensofia:"sofia",hanabankkoreaopenseoul:"seoul",
    bbvaopeninternacionalvalencia:"valencia125",chengduopenchengdu:"chengdu",
    chiledovemencareopensantiago:"santiago",mubadalaabudhabiopenabudhabi:"abudhabi",
    opendellepugliebari:"bari125",europeanopenantwerp:"antwerp",
    lpopenbyindcolina:"colina125",ladiesopenlausannelausanne:"lausanne",
    sainttropezch:"sainttropezch",francavillaalmarech:"francavillaalmarech",genoach:"genoach",
    bratislavach:"bratislavach",nottingham:"nottingham",estoril:"estoril",sandiego:"sandiego",
    rouen:"rouen",cuernavacach:"cuernavacach",w60berkeleyca:"w60berkeleyca",
    seoul:"seoul",wuhan:"wuhan",halle:"halle",monastir:"monastir",m25champaignil:"m25champaignil",
    hamburg:"hamburg",austin:"austin",rotterdam:"rotterdam",basel:"basel",
    w25austintx:"w25austintx",m15tallahasseefl:"m15tallahasseefl",w15lakewoodca:"w15lakewoodca",
    m25wichitaks:"m25wichitaks",m25pensacolafl:"m25pensacolafl",tokyoolympics:"tokyoolympics",
    m25tulsaok:"m25tulsaok",midland125:"midland125",limoges125:"limoges125",stuttgart:"stuttgart",
    dohaausopenqualies:"dohaausopenqualies",montpellier:"montpellier",sofia:"sofia",
    w25reddingca:"w25reddingca",valencia125:"valencia125",chengdu:"chengdu",santiago:"santiago",
    abudhabi:"abudhabi",bari125:"bari125",w25sumtersc:"w25sumtersc",antwerp:"antwerp",
    w15ranchosantafeca:"w15ranchosantafeca",colina125:"colina125",lausanne:"lausanne",
    // Additional location and sponsor variants confirmed by the archive mismatch profile.
    morelosch:"cuernavacach",w60berkeley:"w60berkeleyca",m25champaign:"m25champaignil",
    m15tallahassee:"m15tallahasseefl",w15lakewood:"w15lakewoodca",m25wichita:"m25wichitaks",
    m25pensacola:"m25pensacolafl",m25tulsa:"m25tulsaok",w25redding:"w25reddingca",
    w25sumter:"w25sumtersc",m15champaign:"m15champaignil",w15ranchosantafe:"w15ranchosantafeca",
    m15sunrise:"m15sunrisefl",w80macon:"w80maconga",m15ranchosantafe:"m15ranchosantafeca",
    w35naples:"w35naplesfl",m25harlingen:"m25harlingentx",cordobaopencordoba:"cordoba",
    truistatlantaopenatlanta:"atlanta",stockholmopenstockholm:"stockholm",
    olympicsparis:"parisolympics",w60pelham:"w60pelhamal",efgswissopengstaad:"gstaad",
    guangzhouopenguangzhou:"guangzhou",w25florence:"w25florencesc",w15huntsville:"w15huntsvilleal",
    australianopenqualifyingdubai:"dubaiausopenqualies",stbrieucch:"saintbrieucch",
    stpetersburgladiestrophystpetersburg:"stpetersburg",w15losangeles:"w15losangelesca",
    sanbenedettoch:"sanbenedettodeltrontoch",w60arcadia:"w60arcadiaca",
    tropheeclarinsparis:"paris125",venetoopengaiba:"gaiba125",m25edwardsville:"m25edwardsvilleil",
    m15winstonsalem:"m15winstonsalemnc",mubadalacitidcopenwashington:"washington",
    cuernavacach:"cuernavacach",w60berkeleyca:"w60berkeleyca",m25champaignil:"m25champaignil",
    m15tallahasseefl:"m15tallahasseefl",w15lakewoodca:"w15lakewoodca",m25wichitaks:"m25wichitaks",
    m25pensacolafl:"m25pensacolafl",m25tulsaok:"m25tulsaok",w25reddingca:"w25reddingca",
    w25sumtersc:"w25sumtersc",w15ranchosantafeca:"w15ranchosantafeca",m15sunrisefl:"m15sunrisefl",
    w80maconga:"w80maconga",w35naplesfl:"w35naplesfl",m25harlingentx:"m25harlingentx",
    cordoba:"cordoba",atlanta:"atlanta",stockholm:"stockholm",parisolympics:"parisolympics",
    w60pelhamal:"w60pelhamal",gstaad:"gstaad",guangzhou:"guangzhou",w25florencesc:"w25florencesc",
    w15huntsvilleal:"w15huntsvilleal",dubaiausopenqualies:"dubaiausopenqualies",
    saintbrieucch:"saintbrieucch",stpetersburg:"stpetersburg",w15losangelesca:"w15losangelesca",
    sanbenedettodeltrontoch:"sanbenedettodeltrontoch",w60arcadiaca:"w60arcadiaca",
    paris125:"paris125",gaiba125:"gaiba125",m25edwardsvilleil:"m25edwardsvilleil",
    m15winstonsalemnc:"m15winstonsalemnc",washington:"washington"
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
  const sackIndex=new Map(),sackPairIndex=new Map(),sourceRows={},sourceRowsByYear={},sourceRowsByYearTier={};
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
    sourceRowsByYearTier[tour+":"+year+":"+tier]=(sourceRowsByYearTier[tour+":"+year+":"+tier]||0)+rows.length;
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
  const byTour={},byYear={},byTourYear={},byCategory={},byTourCategory={},byTourYearCategory={},offsets=[],eventMismatchPairs=new Map(),eventMismatchBreakdown=new Map();
  const ambiguousDiagnostics={rows:0,exactEventDisambiguated:0,noExactEventMatch:0,multipleExactEventMatches:0,candidateRows:0,rowsWithCrossTierDuplicateCandidate:0,rowsWithSameTierDuplicateCandidate:0,rowsWithMultipleDistinctEventDates:0,duplicateCandidateExtraRows:0,distinctCandidateSignatures:0,rowsWithTiedNearestCandidateDate:0,rowsWithUniqueNearestCandidateDate:0,rowsWithExactDateCandidate:0};
  const ambiguousCandidateBreakdown=new Map();
  const ambiguousNearestOffsetCounts=new Map(),ambiguousNearestGapCounts=new Map(),ambiguousDistinctDateCounts=new Map();
  const ambiguousReasonBreakdown=new Map();
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
    const yearBucket=byYear[m[1]]||(byYear[m[1]]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
    for(const row of rows){
      yearBucket.rows++;
      totals.valuebetRows++;
      const category=String(row.categorie??"").trim()||"(empty)";
      const cg=byCategory[category]||(byCategory[category]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
      cg.rows++;
      const tour=String(row.genre??"").trim().toUpperCase();
      const tourYearKey=(tour||"(empty)")+"::"+m[1];
      const tourYearBucket=byTourYear[tourYearKey]||(byTourYear[tourYearKey]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
      tourYearBucket.rows++;
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
      const tourYearCategoryKey=(tour||"(empty)")+"::"+m[1]+"::"+category;
      const tycg=byTourYearCategory[tourYearCategoryKey]||(byTourYearCategory[tourYearCategoryKey]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,ambiguous:0,noCandidate:0,pairAbsent:0,surfaceAbsent:0,dateWindowMiss:0,invalidPlayerPair:0,invalidDate:0,unknownSurface:0,unknownTour:0});
      tycg.rows++;
      const date=parseVbtDate(row.date),a=normalize(row.joueur1),b=normalize(row.joueur2);
      if(!byTour[tour])byTour[tour]={rows:0,validRows:0,candidateRows:0,linkedUnique:0,linkedWithoutTournament:0,linkedByTournament:0,eventNameExactMatch:0,eventNameMismatch:0,eventNameUnavailableInSackmann:0,sourceEventMissing:0,ambiguous:0,noCandidate:0,invalidDate:0,unknownSurface:0};
      const g=byTour[tour];g.rows++;
      if(!["ATP","WTA"].includes(tour)){totals.unknownTour++;yearBucket.unknownTour++;tourYearBucket.unknownTour++;cg.unknownTour++;tcg.unknownTour++;tycg.unknownTour++;continue;}
      if(date===null){totals.invalidDate++;g.invalidDate++;yearBucket.invalidDate++;tourYearBucket.invalidDate++;cg.invalidDate++;tcg.invalidDate++;tycg.invalidDate++;continue;}
      if(!a||!b||a===b){totals.noCandidate++;totals.invalidPlayerPair++;g.noCandidate++;yearBucket.noCandidate++;tourYearBucket.noCandidate++;yearBucket.invalidPlayerPair++;tourYearBucket.invalidPlayerPair++;cg.noCandidate++;tcg.noCandidate++;tycg.noCandidate++;cg.invalidPlayerPair++;tcg.invalidPlayerPair++;tycg.invalidPlayerPair++;continue;}
      const sf=surface(row.surface),ev=tourney(row.tournoi);
      totals.validValuebetRows++;g.validRows++;yearBucket.validRows++;tourYearBucket.validRows++;cg.validRows++;tcg.validRows++;tycg.validRows++;
      if(!sf){
        totals.unknownSurface++;g.unknownSurface++;yearBucket.unknownSurface++;tourYearBucket.unknownSurface++;cg.unknownSurface++;tcg.unknownSurface++;tycg.unknownSurface++;
        totals.noCandidate++;g.noCandidate++;yearBucket.noCandidate++;tourYearBucket.noCandidate++;cg.noCandidate++;tcg.noCandidate++;tycg.noCandidate++;
        continue;
      }
      const key=[tour,[a,b].sort().join("|"),sf].join("::");
      const pairKey=[tour,[a,b].sort().join("|")].join("::");
      const samePair=sackPairIndex.get(pairKey)||[];
      const samePairSurface=samePair.filter(x=>x.surface===sf);
      const candidates=samePairSurface.filter(x=>Math.abs(date-x.date)<=maxDateOffsetDays);
      if(!samePair.length){totals.pairAbsent++;cg.pairAbsent++;tcg.pairAbsent++;tycg.pairAbsent++;yearBucket.pairAbsent++;tourYearBucket.pairAbsent++;}
      else if(!samePairSurface.length){totals.surfaceAbsent++;cg.surfaceAbsent++;tcg.surfaceAbsent++;tycg.surfaceAbsent++;yearBucket.surfaceAbsent++;tourYearBucket.surfaceAbsent++;}
      else if(!candidates.length){totals.dateWindowMiss++;cg.dateWindowMiss++;tcg.dateWindowMiss++;tycg.dateWindowMiss++;yearBucket.dateWindowMiss++;tourYearBucket.dateWindowMiss++;}
      if(candidates.length){totals.candidateRows++;g.candidateRows++;yearBucket.candidateRows++;tourYearBucket.candidateRows++;cg.candidateRows++;tcg.candidateRows++;tycg.candidateRows++;}
      const eventCandidates=ev?candidates.filter(x=>x.event===ev):[];
      if(candidates.length>1){
        ambiguousDiagnostics.rows++;
        ambiguousDiagnostics.candidateRows+=candidates.length;
        if(eventCandidates.length===1)ambiguousDiagnostics.exactEventDisambiguated++;
        else if(eventCandidates.length===0)ambiguousDiagnostics.noExactEventMatch++;
        else ambiguousDiagnostics.multipleExactEventMatches++;
        const candidateGroups=new Map();
        for(const candidate of candidates){
          const signature=[candidate.date,candidate.event||"(missing)",candidate.winnerName,candidate.loserName].join("::");
          if(!candidateGroups.has(signature))candidateGroups.set(signature,[]);
          candidateGroups.get(signature).push(candidate);
        }
        const groups=[...candidateGroups.values()];
        ambiguousDiagnostics.distinctCandidateSignatures+=groups.length;
        ambiguousDiagnostics.duplicateCandidateExtraRows+=candidates.length-groups.length;
        const crossTierDuplicate=groups.some(group=>new Set(group.map(x=>x.tier)).size>1);
        const sameTierDuplicate=groups.some(group=>new Set(group.map(x=>x.tier)).size===1&&group.length>1);
        const eventDates=new Set(eventCandidates.map(x=>x.date));
        const multipleEventDates=eventDates.size>1;
        const candidateDates=[...new Set(candidates.map(x=>x.date))].sort((x,y)=>Math.abs(date-x)-Math.abs(date-y));
        const candidateOffsets=candidateDates.map(x=>Math.abs(date-x));
        const nearestOffset=candidateOffsets[0];
        const nearestGap=candidateOffsets[1]-nearestOffset;
        const nearestCount=candidateOffsets.filter(x=>x===nearestOffset).length;
        ambiguousNearestOffsetCounts.set(nearestOffset,(ambiguousNearestOffsetCounts.get(nearestOffset)||0)+1);
        ambiguousNearestGapCounts.set(nearestGap,(ambiguousNearestGapCounts.get(nearestGap)||0)+1);
        ambiguousDistinctDateCounts.set(candidateDates.length,(ambiguousDistinctDateCounts.get(candidateDates.length)||0)+1);
        if(nearestOffset===0)ambiguousDiagnostics.rowsWithExactDateCandidate++;
        if(nearestCount>1)ambiguousDiagnostics.rowsWithTiedNearestCandidateDate++;
        else ambiguousDiagnostics.rowsWithUniqueNearestCandidateDate++;
        if(crossTierDuplicate)ambiguousDiagnostics.rowsWithCrossTierDuplicateCandidate++;
        if(sameTierDuplicate)ambiguousDiagnostics.rowsWithSameTierDuplicateCandidate++;
        if(multipleEventDates)ambiguousDiagnostics.rowsWithMultipleDistinctEventDates++;
        const reasonKey=[tour,m[1],category,crossTierDuplicate?"cross-tier-duplicate":"no-cross-tier-duplicate",sameTierDuplicate?"same-tier-duplicate":"no-same-tier-duplicate",multipleEventDates?"same-event-multiple-dates":"single-event-date-or-no-exact-event"].join("::");
        ambiguousReasonBreakdown.set(reasonKey,(ambiguousReasonBreakdown.get(reasonKey)||0)+1);
        for(const candidate of candidates){
          const detailKey=[tour,m[1],category,candidate.tier,ev||"(missing)",candidate.event||"(missing)"].join("::");
          ambiguousCandidateBreakdown.set(detailKey,(ambiguousCandidateBreakdown.get(detailKey)||0)+1);
        }
      }
      const selected=candidates.length===1?candidates[0]:(eventCandidates.length===1?eventCandidates[0]:null);
      if(selected){
        totals.linkedUnique++;g.linkedUnique++;yearBucket.linkedUnique++;tourYearBucket.linkedUnique++;cg.linkedUnique++;tcg.linkedUnique++;tycg.linkedUnique++;
        if(candidates.length===1){totals.linkedWithoutTournament++;g.linkedWithoutTournament++;}
        else{totals.linkedByTournament++;g.linkedByTournament++;}
        if(!ev){totals.sourceEventMissing++;g.sourceEventMissing++;}
        else if(!selected.event){totals.eventNameUnavailableInSackmann++;g.eventNameUnavailableInSackmann++;}
        else if(selected.event===ev){totals.eventNameExactMatch++;g.eventNameExactMatch++;}
        else{totals.eventNameMismatch++;g.eventNameMismatch++;const mismatchKey=ev+" -> "+selected.event;eventMismatchPairs.set(mismatchKey,(eventMismatchPairs.get(mismatchKey)||0)+1);const detailKey=[tour,m[1],category,selected.tier,mismatchKey].join("::");eventMismatchBreakdown.set(detailKey,(eventMismatchBreakdown.get(detailKey)||0)+1);}
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
      }else if(candidates.length>1){totals.ambiguous++;g.ambiguous++;yearBucket.ambiguous++;tourYearBucket.ambiguous++;cg.ambiguous++;tcg.ambiguous++;tycg.ambiguous++;}
      else{totals.noCandidate++;g.noCandidate++;yearBucket.noCandidate++;tourYearBucket.noCandidate++;cg.noCandidate++;tcg.noCandidate++;tycg.noCandidate++;}
    }
  }
  const sorted=offsets.slice().sort((a,b)=>a-b);
  totals.linkagePct=pct(totals.linkedUnique,totals.validValuebetRows);
  const playerIdEvidence={};
  for(const tour of ["ATP","WTA"]){
    let resolvedToSingleSackmannId=0,conflictingSackmannIds=0;
    const conflictProfile={sameBirthDateAndCountry:0,differentBirthDateOrCountry:0,differentHandOnly:0,sameDobIocDifferentHand:0,identicalAvailableSignature:0,missingRegistryMetadata:0,missingDob:0,missingIoc:0,missingHand:0};
    for(const ids of sourceIdEvidence[tour].values()){
      if(ids.size===1)resolvedToSingleSackmannId++;
      else if(ids.size>1){
        conflictingSackmannIds++;
        const metas=[...ids].map(id=>registryMeta[tour].get(id));
        const missingDob=metas.some(m=>!m||!m.dob),missingIoc=metas.some(m=>!m||!m.ioc),missingHand=metas.some(m=>!m||!m.hand);
        if(missingDob)conflictProfile.missingDob++;
        if(missingIoc)conflictProfile.missingIoc++;
        if(missingHand)conflictProfile.missingHand++;
        if(missingDob||missingIoc||missingHand)conflictProfile.missingRegistryMetadata++;
        const dobIoc=new Set(metas.map(m=>(m?.dob||"")+"::"+(m?.ioc||"")));
        const full=new Set(metas.map(m=>(m?.dob||"")+"::"+(m?.ioc||"")+"::"+(m?.hand||"")));
        const dobIocHandKnown=metas.every(m=>m?.dob&&m?.ioc&&m?.hand);
        if(!missingDob&&!missingIoc&&dobIoc.size===1)conflictProfile.sameBirthDateAndCountry++;
        else if(!missingDob&&!missingIoc)conflictProfile.differentBirthDateOrCountry++;
        if(!missingDob&&!missingIoc&&dobIoc.size===1&&!missingHand&&full.size>1)conflictProfile.sameDobIocDifferentHand++;
        if(dobIocHandKnown&&full.size===1)conflictProfile.identicalAvailableSignature++;
        if(!missingDob&&!missingIoc&&dobIoc.size===1&&missingHand===false&&full.size>1)conflictProfile.differentHandOnly++;
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
    coverageInterpretation:{denominator:"Observed Valuebetennis archive rows with valid tour, date and player pair; this is not an official tournament-schedule denominator.",sourceTierCounts:"Sackmann source row counts are reported by tour/year/file tier and are not interchangeable with Valuebetennis competition labels.",partialYear:"2026 is a current/partial archive snapshot and must not be compared with completed historical years as if it were complete.",completeness:"No year is certified complete by this linkage audit; source row counts describe only the files downloaded for this run."},
    sources:{valuebetennisFiles:valuebetFiles.map(x=>basename(x.filename)).sort(),sackmannFiles:sackmannFiles.map(x=>basename(x.filename)).sort(),sackmannSourceRows:sourceRows,sackmannSourceRowsByYear:sourceRowsByYear,sackmannSourceRowsByYearTier:sourceRowsByYearTier},
    matching:{playerNames:"exact normalized full-name pair, order-independent",tournament:"not required for a single player-pair/surface/date candidate; exact normalized name or explicit alias is used only to resolve multiple candidates",surface:"normalized exact surface, including French Valuebetennis labels",date:"absolute difference from Sackmann tourney_date <= "+maxDateOffsetDays+" days",acceptance:"one candidate is accepted; multiple candidates require exactly one tournament-name match, otherwise remain ambiguous"},
    eventNameDiagnostics:{method:"For accepted links, compare normalized source tournament name with Sackmann tournament name; a mismatch is diagnostic only and does not automatically reject a unique pair/surface/date candidate.",topMismatchPairs:[...eventMismatchPairs].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([pair,count])=>({pair,count})),topMismatchBreakdown:[...eventMismatchBreakdown].sort((a,b)=>b[1]-a[1]).slice(0,250).map(([key,count])=>{const [tour,year,category,sackmannTier,pair]=key.split("::");return{tour,year,category,sackmannTier,pair,count};}),ambiguousCandidateResolution:{...ambiguousDiagnostics,topReasonBreakdown:[...ambiguousReasonBreakdown].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([key,count])=>{const [tour,year,category,crossTierDuplicate,sameTierDuplicate,eventDatePattern]=key.split("::");return{tour,year,category,crossTierDuplicate,sameTierDuplicate,eventDatePattern,count};}),nearestCandidateOffsetDays:[...ambiguousNearestOffsetCounts].sort((a,b)=>a[0]-b[0]).map(([days,count])=>({days,count})),nearestCandidateGapDays:[...ambiguousNearestGapCounts].sort((a,b)=>a[0]-b[0]).map(([days,count])=>({days,count})),distinctCandidateDates:[...ambiguousDistinctDateCounts].sort((a,b)=>a[0]-b[0]).map(([dates,count])=>({dates,count})),topBreakdown:[...ambiguousCandidateBreakdown].sort((a,b)=>b[1]-a[1]).slice(0,250).map(([key,count])=>{const [tour,year,category,sackmannTier,sourceEvent,candidateEvent]=key.split("::");return{tour,year,category,sackmannTier,sourceEvent,candidateEvent,count};})}},
    totals:{
      ...totals,
      dateOffsetDays:sorted.length?{count:sorted.length,min:sorted[0],median:sorted[Math.floor((sorted.length-1)/2)],p90:sorted[Math.floor((sorted.length-1)*.9)],max:sorted.at(-1)}:null
    },
    byTour,
    playerIdEvidence:{method:"accepted unique match links only; Valuebetennis player IDs are associated with Sackmann winner/loser IDs by exact normalized name orientation; conflicting IDs are profiled by available DOB/IOC/hand signatures but never auto-resolved",matchRowsWithBothPlayerIdsEvidence,byTour:playerIdEvidence},
    playerIdComparison,
    byCategory:Object.fromEntries(Object.entries(byCategory).map(([category,g])=>[category,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    byTourCategory:Object.fromEntries(Object.entries(byTourCategory).map(([key,g])=>[key,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    valuebetSchema:{columns:valuebetSchema.columns,categorical:Object.fromEntries(Object.entries(valuebetSchema.categorical).map(([key,counts])=>{const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);return [key,{distinctValues:entries.length,topValues:entries.slice(0,30).map(([value,count])=>({value,count})),otherRows:entries.slice(30).reduce((n,x)=>n+x[1],0)}]}))},
    byYear:Object.fromEntries(Object.entries(byYear).map(([year,g])=>[year,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    byTourYear:Object.fromEntries(Object.entries(byTourYear).map(([key,g])=>[key,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    byTourYearCategory:Object.fromEntries(Object.entries(byTourYearCategory).map(([key,g])=>[key,{...g,linkagePct:pct(g.linkedUnique,g.validRows),candidatePct:pct(g.candidateRows,g.validRows)}])),
    warnings:[
      "This is a conservative linkage audit. A single candidate is linked by exact normalized player pair, surface and date window; tournament names are used only to resolve multiple candidates.",
      "Coverage percentages use observed archive rows, not official event or match schedule denominators; 2026 is a partial snapshot, and no year is certified complete.",
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