#!/usr/bin/env node
// Stratified, aggregate-only inventory of the BASIC 1968-2022 results archive.
// 1 /usage + 12 small list pages (ATP/WTA x six eras) + at most 12 match details.
// Never writes raw records, names, IDs, API key, or raw provider responses.
const BASE = "https://api.livetennisapi.com/api/public/v1";
const key = process.env.LIVE_TENNIS_API_KEY;
if (!key) { console.error("BLOCKED: LIVE_TENNIS_API_KEY is missing."); process.exit(2); }
const headers = { "X-API-Key": key, "Accept": "application/json", "User-Agent": "TennisValueScanner-Aggregator1-ArchiveInventory/1.0" };
const eras = [
  ["1968-1979","1968-01-01","1979-12-31"],
  ["1980-1989","1980-01-01","1989-12-31"],
  ["1990-1999","1990-01-01","1999-12-31"],
  ["2000-2009","2000-01-01","2009-12-31"],
  ["2010-2015","2010-01-01","2015-12-31"],
  ["2016-2022","2016-01-01","2022-12-31"]
];
const report = {
  generated_at:new Date().toISOString(),
  source:"Live Tennis API",
  mode:"stratified archive inventory; aggregate-only; no bulk export",
  request_budget:37, requests_made:0, account:null, sample_page_size:20,
  buckets:[], detail_samples:[], major_draw_checks:[], warnings:[]
};
async function get(path) {
  report.requests_made++;
  const response=await fetch(BASE+path,{headers,signal:AbortSignal.timeout(20000)});
  const raw=await response.text(); let json;
  try{json=JSON.parse(raw);}catch{return {ok:false,status:response.status,error:"non_json"};}
  return {ok:response.ok,status:response.status,json};
}
const keys=x=>x&&typeof x==="object"&&!Array.isArray(x)?Object.keys(x).sort():[];
try {
  const ures=await get("/usage");
  if(!ures.ok)throw new Error("GET /usage HTTP "+ures.status);
  const u=ures.json.data||ures.json.usage||ures.json, limits=u.limits||{}, today=u.today||{};
  report.account={tier:u.tier||u.base_tier||null,subscription_state:u.subscription_state||null,
    per_minute_limit:limits.per_minute??u.per_minute_limit??null,
    daily_limit:limits.per_day??u.daily_limit??null,
    requests_today:today.calls??null,requests_remaining_today:today.remaining_day??null};

  for(const tour of ["atp","wta"]) for(const [label,from,to] of eras){
    const path="/history/archive/matches?tour="+tour+"&from="+from+"&to="+to+"&limit=20";
    const r=await get(path);
    if(!r.ok){report.buckets.push({tour,era:label,http_status:r.status,error:r.json?.error||r.error||"request_failed"});continue;}
    const data=Array.isArray(r.json.data)?r.json.data:[];
    const meta=r.json.meta||{};
    const freq=(field)=>{const out={};for(const x of data){const v=field(x);const k=v==null?"null":String(v);out[k]=(out[k]||0)+1;}return out;};
    const bucket={tour,era:label,http_status:r.status,sample_rows:data.length,
      page_has_more:meta.has_more??null,total_count:meta.total??meta.count??null,
      surface_sample:freq(x=>x.surface),level_sample:freq(x=>x.level),
      round_sample:freq(x=>x.round),
      winner_rank_present:data.filter(x=>x.winner?.rank!=null).length,
      loser_rank_present:data.filter(x=>x.loser?.rank!=null).length,
      sample_record_fields:keys(data[0])};
    report.buckets.push(bucket);
    const first=data.find(x=>x.id!=null);
    if(first){
      const d=await get("/history/archive/matches/"+encodeURIComponent(first.id));
      const rec=d.json?.data||d.json;
      report.detail_samples.push(d.ok
        ? {tour,era:label,http_status:d.status,detail_fields:keys(rec),
           stats_present:rec?.stats!=null,
           winner_stat_fields:keys(rec?.stats?.winner),loser_stat_fields:keys(rec?.stats?.loser)}
        : {tour,era:label,http_status:d.status,error:d.json?.error||d.error||"request_failed"});
    }else report.detail_samples.push({tour,era:label,skipped:true,reason:"no sample match in page"});
  }

  // Targeted Grand Slam sample: verify stats-rich records and archive player/career lookups.
  // Two broad eras, both tours; one result detail, one player bio and one career aggregate per bucket.
  for(const tour of ["atp","wta"]) for(const [era,from,to] of [
    ["1991-2000","1991-01-01","2000-12-31"],
    ["2016-2022","2016-01-01","2022-12-31"]
  ]){
    const list=await get("/history/archive/matches?tour="+tour+"&level=G&from="+from+"&to="+to+"&limit=1");
    if(!list.ok){
      report.major_draw_checks.push({tour,era,http_status:list.status,error:list.json?.error||list.error||"request_failed"});
      continue;
    }
    const match=Array.isArray(list.json.data)?list.json.data[0]:null;
    if(!match?.id){
      report.major_draw_checks.push({tour,era,http_status:list.status,empty:true});
      continue;
    }
    const detail=await get("/history/archive/matches/"+encodeURIComponent(match.id));
    const rec=detail.json?.data||detail.json;
    const player=match.winner||{};
    const bio=player.player_id!=null
      ? await get("/history/archive/players?id="+encodeURIComponent(player.player_id)+"&tour="+tour)
      : {ok:false,status:0,error:"winner_player_id_missing"};
    const career=player.name
      ? await get("/history/archive/career?name="+encodeURIComponent(player.name))
      : {ok:false,status:0,error:"winner_name_missing"};
    const bioRows=Array.isArray(bio.json?.data)?bio.json.data:[];
    const careerRec=career.json?.data||career.json||{};
    report.major_draw_checks.push({
      tour,era,http_status:list.status,
      list_meta:{count:list.json.meta?.count??null,has_more:list.json.meta?.has_more??null},
      detail_http_status:detail.status,stats_present:detail.ok&&rec?.stats!=null,
      winner_stat_fields:keys(rec?.stats?.winner),loser_stat_fields:keys(rec?.stats?.loser),
      player_bio_http_status:bio.status,player_bio_rows:bioRows.length,
      player_bio_fields:keys(bioRows[0]),
      career_http_status:career.status,career_fields:keys(careerRec),
      career_record_fields:keys(careerRec.record),career_serve_fields:keys(careerRec.serve)
    });
  }

  report.result=report.buckets.every(x=>x.http_status===200)&&report.detail_samples.every(x=>x.http_status===200||x.skipped)&&report.major_draw_checks.every(x=>x.http_status===200&&x.detail_http_status===200&&x.player_bio_http_status===200&&x.career_http_status===200)
    ?"inventory_completed":"some_archive_checks_failed";
  await (await import("node:fs/promises")).writeFile("livetennis-archive-inventory.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if(report.result!=="inventory_completed")process.exitCode=1;
}catch(e){
  report.fatal_error=e.message;
  await (await import("node:fs/promises")).writeFile("livetennis-archive-inventory.json",JSON.stringify(report,null,2)+"\n");
  console.error(JSON.stringify(report,null,2));process.exitCode=1;
}
