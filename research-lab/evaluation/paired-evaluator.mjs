import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const EPS = 1e-15;
const REQUIRED_SYSTEMS = ["PFE", "ACE", "SMA", "HFA"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function validProbability(p) {
  return Number.isFinite(p) && p > 0 && p < 1;
}
function clamp(p) {
  return Math.min(1 - EPS, Math.max(EPS, p));
}
function logLoss(p, y) {
  const q = clamp(p);
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}
function brier(p, y) {
  return (p - y) ** 2;
}
function parseTime(value, field) {
  const t = Date.parse(value);
  assert(Number.isFinite(t), `Invalid ${field}: ${value}`);
  return t;
}
function normalizeRecord(r) {
  assert(r && typeof r === "object", "Each input row must be an object.");
  assert(typeof r.match_id === "string" && r.match_id.length > 0, "match_id is required.");
  assert(typeof r.tour === "string" && r.tour.length > 0, `tour missing for ${r.match_id}`);
  assert(typeof r.surface === "string" && r.surface.length > 0, `surface missing for ${r.match_id}`);
  assert(typeof r.player_a_id === "string" && typeof r.player_b_id === "string" &&
    r.player_a_id !== r.player_b_id, `invalid player ids for ${r.match_id}`);
  assert(r.winner_id === r.player_a_id || r.winner_id === r.player_b_id,
    `winner must be one of the match players: ${r.match_id}`);
  const start = parseTime(r.match_start_at, "match_start_at");
  const systems = r.systems ?? {};
  for (const [id, output] of Object.entries(systems)) {
    assert(REQUIRED_SYSTEMS.includes(id), `Unknown SAS ${id} in ${r.match_id}`);
    if (!output || output.status !== "available") continue;
    assert(validProbability(output.probability_a), `Invalid ${id} probability_a for ${r.match_id}`);
    assert(validProbability(output.probability_b), `Invalid ${id} probability_b for ${r.match_id}`);
    assert(Math.abs(output.probability_a + output.probability_b - 1) < 1e-6,
      `Probabilities must sum to 1 for ${id} / ${r.match_id}`);
    const created = parseTime(output.prediction_created_at, `${id}.prediction_created_at`);
    const cutoff = parseTime(output.data_cutoff_at, `${id}.data_cutoff_at`);
    assert(created < start, `${id} prediction is not strictly pre-match: ${r.match_id}`);
    assert(cutoff <= created, `${id} data cutoff is after prediction: ${r.match_id}`);
  }
  return { ...r, match_start_ms: start };
}

function deduplicate(records) {
  const byId = new Map();
  for (const row of records) {
    const old = byId.get(row.match_id);
    if (!old) {
      byId.set(row.match_id, row);
      continue;
    }
    const signature = x => JSON.stringify({
      tour:x.tour,surface:x.surface,player_a_id:x.player_a_id,
      player_b_id:x.player_b_id,winner_id:x.winner_id,
      match_start_at:x.match_start_at,systems:x.systems
    });
    assert(signature(old) === signature(row), `Conflicting duplicate match_id: ${row.match_id}`);
  }
  return [...byId.values()];
}

function metricSummary(rows, probabilityKey) {
  const n = rows.length;
  assert(n > 0, "Cannot score an empty sample.");
  const ys = rows.map(r => r.winner_id === r.player_a_id ? 1 : 0);
  const ps = rows.map(r => r[probabilityKey]);
  const briers = ps.map((p,i) => brier(p,ys[i]));
  const losses = ps.map((p,i) => logLoss(p,ys[i]));
  const correct = ps.reduce((sum,p,i) => sum + ((p >= 0.5) === (ys[i] === 1) ? 1 : 0),0);
  const bins = Array.from({length:10},(_,i)=>({bin:`${i/10.toFixed?i/10: i/10}-${(i+1)/10}`,n:0,mean_probability:0,observed_rate:0}));
  for(let i=0;i<n;i++){
    const index=Math.min(9,Math.floor(ps[i]*10));
    bins[index].n++;
    bins[index].mean_probability+=ps[i];
    bins[index].observed_rate+=ys[i];
  }
  for(const bin of bins) if(bin.n){bin.mean_probability/=bin.n;bin.observed_rate/=bin.n;}
  return {
    matches:n,
    brier:briers.reduce((a,b)=>a+b,0)/n,
    log_loss:losses.reduce((a,b)=>a+b,0)/n,
    accuracy:correct/n,
    calibration_bins:bins.filter(b=>b.n>0)
  };
}

function pairedDifference(rows, baselineKey, candidateKey) {
  const diffs = rows.map(r =>
    brier(r[candidateKey], r.y) - brier(r[baselineKey], r.y)
  );
  const logDiffs = rows.map(r =>
    logLoss(r[candidateKey], r.y) - logLoss(r[baselineKey], r.y)
  );
  const summarize = values => {
    const n=values.length, mean=values.reduce((a,b)=>a+b,0)/n;
    const variance=values.reduce((s,x)=>s+(x-mean)**2,0)/(n-1 || 1);
    const se=Math.sqrt(variance/n);
    return {mean,ci95_normal:[mean-1.96*se,mean+1.96*se]};
  };
  return {brier:summarize(diffs),log_loss:summarize(logDiffs)};
}

function buildCandidateRows(records, candidate) {
  const rows=[];
  const excluded={baseline_unavailable:0,candidate_unavailable:0,orientation_or_match_mismatch:0};
  for(const r of records){
    const pfe=r.systems.PFE;
    const cand=candidate==="PFE"?pfe:r.systems[candidate];
    if(!pfe || pfe.status!=="available"){excluded.baseline_unavailable++;continue;}
    if(!cand || cand.status!=="available"){excluded.candidate_unavailable++;continue;}
    if(!validProbability(cand.probability_a)){excluded.orientation_or_match_mismatch++;continue;}
    const y=r.winner_id===r.player_a_id?1:0;
    rows.push({...r,y,pfe_probability:pfe.probability_a,candidate_probability:cand.probability_a});
  }
  return {rows,excluded};
}

function evaluateStratum(rows, candidate) {
  const baseline=metricSummary(rows,"pfe_probability");
  const candidateMetrics=metricSummary(rows,"candidate_probability");
  const paired=pairedDifference(rows,"pfe_probability","candidate_probability");
  return {matches:rows.length,baseline,candidate:candidateMetrics,paired_delta_candidate_minus_pfe:paired};
}

export function evaluateCommonSample(input, options={}) {
  assert(Array.isArray(input),"Input must be a JSON array of match records.");
  const records=deduplicate(input.map(normalizeRecord));
  const candidates=options.candidates ?? ["SMA","ACE","HFA"];
  const output={
    protocol:"TVS-COMMON-SAMPLE-v0.1",
    baseline:"PFE",
    sample_hash_sha256:createHash("sha256").update(records.map(r=>r.match_id).sort().join("\n")).digest("hex"),
    input_records:input.length,
    unique_matches:records.length,
    candidates:{}
  };
  for(const candidate of candidates){
    assert(REQUIRED_SYSTEMS.includes(candidate),"Candidate must be one of ACE/SMA/HFA/PFE.");
    if(candidate==="PFE") continue;
    const {rows,excluded}=buildCandidateRows(records,candidate);
    const result={
      excluded,
      overall:rows.length?evaluateStratum(rows,candidate):null,
      by_tour:{},
      by_surface:{},
      by_tour_surface:{}
    };
    const groups=(key)=>Object.groupBy(rows,r=>r[key]??"Unknown");
    for(const [tour,subset] of Object.entries(groups("tour"))) result.by_tour[tour]=evaluateStratum(subset,candidate);
    for(const [surface,subset] of Object.entries(groups("surface"))) result.by_surface[surface]=evaluateStratum(subset,candidate);
    for(const [key,subset] of Object.entries(groups("tour"))){
      for(const [surface,part] of Object.entries(Object.groupBy(subset,r=>r.surface??"Unknown"))){
        result.by_tour_surface[`${key}|${surface}`]=evaluateStratum(part,candidate);
      }
    }
    output.candidates[candidate]=result;
  }
  return output;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath=process.argv[2];
  assert(inputPath,"Usage: node paired-evaluator.mjs <records.json> [output.json]");
  const raw=JSON.parse(await readFile(inputPath,"utf8"));
  const result=evaluateCommonSample(raw);
  const serialized=JSON.stringify(result,null,2);
  if(process.argv[3]){
    const {writeFile}=await import("node:fs/promises");
    await writeFile(process.argv[3],serialized+"\n");
  } else console.log(serialized);
}
