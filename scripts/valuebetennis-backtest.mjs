#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseCsv, runBacktest } from "./backtest.mjs";

const REQUIRED = ["match_id","date","tournoi_id","genre","surface","joueur1_id","joueur2_id","vainqueur_id","score"];
const SURFACES = new Map([["hard","Hard"],["dur","Hard"],["dur intérieur","Hard"],["clay","Clay"],["terre battue","Clay"],["grass","Grass"],["gazon","Grass"],["carpet","Carpet"],["moquette intérieur","Carpet"]]);
const ODDS_FIELDS = {
  opening: ["cote1_ouverture", "cote2_ouverture"],
  closing: ["cote1_cloture", "cote2_cloture"]
};
function parseOdds(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 && n <= 100 ? n : null;
}
function marketBenchmark(rows, fields) {
  let valid = 0, invalid = 0, overround = 0, favouriteWins = 0, decisiveFavourite = 0, excludedNonstandard = 0;
  let brier = 0, logLoss = 0;
  for (const row of rows) {
    if (/\b(?:W\/O|RET|ABD|DEF|DEFAULT)\b/i.test(String(row.score ?? ""))) { excludedNonstandard++; continue; }
    const [field1, field2] = fields;
    const odds1 = parseOdds(row[field1]), odds2 = parseOdds(row[field2]);
    if (!odds1 || !odds2) { invalid++; continue; }
    const implied1 = 1 / odds1, implied2 = 1 / odds2, total = implied1 + implied2;
    const p1 = implied1 / total, outcome1 = String(row.vainqueur_id) === String(row.joueur1_id) ? 1 : 0;
    const favourite = odds1 === odds2 ? null : odds1 < odds2 ? 1 : 2;
    valid++;
    overround += total - 1;
    brier += (p1 - outcome1) ** 2;
    const p = Math.min(1 - 1e-12, Math.max(1e-12, p1));
    logLoss -= outcome1 * Math.log(p) + (1 - outcome1) * Math.log(1 - p);
    if (favourite !== null) {
      decisiveFavourite++;
      if ((favourite === 1 && outcome1 === 1) || (favourite === 2 && outcome1 === 0)) favouriteWins++;
    }
  }
  return {
    matchesWithTwoValidOdds: valid,
    matchesMissingOrInvalidOdds: invalid,
    matchesExcludedNonstandardOutcome: excludedNonstandard,
    averageOverroundPct: valid ? Number((100 * overround / valid).toFixed(3)) : null,
    marketFavouriteWinRatePct: decisiveFavourite ? Number((100 * favouriteWins / decisiveFavourite).toFixed(2)) : null,
    marketFavouriteSample: decisiveFavourite,
    noVigPlayer1ProbabilityBrier: valid ? Number((brier / valid).toFixed(5)) : null,
    noVigPlayer1ProbabilityLogLoss: valid ? Number((logLoss / valid).toFixed(5)) : null,
    note: "Descriptive market benchmark only; no simulated betting ROI and no claim of executable prices."
  };
}

function pairedModelMarketComparison(predictions, period) {
  const fields = ODDS_FIELDS[period];
  const names = ["elo", "surface", "form", "h2h", "combined"];
  const makeCalibration = () => Array.from({ length: 10 }, () => ({ n: 0, predicted: 0, wins: 0, winsSquared: 0, fractionalVariance: 0 }));
  const addCalibration = (bins, probability, outcome) => {
    const favouriteProbability = Math.max(probability, 1 - probability);
    const favouriteOutcome = probability > 0.5 ? outcome : probability < 0.5 ? 1 - outcome : 0.5;
    const index = Math.min(9, Math.max(0, Math.floor((favouriteProbability - 0.5) * 20)));
    const bin = bins[index];
    bin.n++;
    bin.predicted += favouriteProbability;
    bin.wins += favouriteOutcome;
    bin.winsSquared += favouriteOutcome * favouriteOutcome;
    bin.fractionalVariance += favouriteOutcome * (1 - favouriteOutcome);
  };
  const formatCalibration = (bins, count) => {
    const used = bins.filter(bin => bin.n);
    const ece = used.reduce((sum, bin) => sum + bin.n * Math.abs(bin.predicted / bin.n - bin.wins / bin.n), 0) / (count || 1);
    return {
      expectedCalibrationErrorPct: count ? Number((ece * 100).toFixed(2)) : null,
      bins: bins.map((bin, index) => {
        const observedRate = bin.n ? bin.wins / bin.n : null;
        const variance = bin.n > 1
          ? Math.max(0, (bin.winsSquared - bin.n * observedRate * observedRate + bin.fractionalVariance) / (bin.n - 1))
          : null;
        const margin = variance === null ? null : 1.96 * Math.sqrt(variance / bin.n);
        return {
          range: String(50 + index * 5) + "-" + String(55 + index * 5) + "%",
          matches: bin.n,
          predictedFavouritePct: bin.n ? Number((bin.predicted / bin.n * 100).toFixed(2)) : null,
          observedFavouriteWinPct: bin.n ? Number((observedRate * 100).toFixed(2)) : null,
          observedFavouriteLower95Pct: margin === null ? null : Number((Math.max(0, observedRate - margin) * 100).toFixed(2)),
          observedFavouriteUpper95Pct: margin === null ? null : Number((Math.min(1, observedRate + margin) * 100).toFixed(2)),
          absoluteCalibrationGapPp: bin.n ? Number((Math.abs(bin.predicted / bin.n - observedRate) * 100).toFixed(2)) : null,
          sampleQuality: bin.n < 30 ? "low" : bin.n < 100 ? "limited" : "larger_sample"
        };
      })
    };
  };
  const makeBucket = () => ({
    count: 0, missing: 0,
    market: { brier: 0, logLoss: 0 },
    marketCalibration: makeCalibration(),
    models: Object.fromEntries(names.map(name => [name, {
      brier: 0, logLoss: 0,
      brierDiffSum: 0, brierDiffSquared: 0,
      logLossDiffSum: 0, logLossDiffSquared: 0
    }])),
    modelCalibration: Object.fromEntries(names.map(name => [name, makeCalibration()]))
  });
  const overall = makeBucket();
  const byYear = new Map(), bySurface = new Map(), byYearAndSurface = new Map(), byH2hMeetings = new Map();
  const h2hBand = count => count === 0 ? "0" : count === 1 ? "1" : count === 2 ? "2" : count === 3 ? "3" : "4+";
  const clamp = value => Math.min(1 - 1e-12, Math.max(1e-12, value));
  for (const prediction of predictions) {
    const year = String(prediction.date).slice(0, 4);
    const surface = prediction.surface ?? "Unknown";
    const buckets = [overall];
    const h2hBandKey = h2hBand(prediction.h2hMeetings ?? 0);
    if (!byH2hMeetings.has(h2hBandKey)) byH2hMeetings.set(h2hBandKey, makeBucket());
    buckets.push(byH2hMeetings.get(h2hBandKey));
    for (const [map, key] of [[byYear, year], [bySurface, surface], [byYearAndSurface, year + "|" + surface]]) {
      if (!map.has(key)) map.set(key, makeBucket());
      buckets.push(map.get(key));
    }
    const odds1 = parseOdds(prediction.sourceOdds?.[period + "1"]);
    const odds2 = parseOdds(prediction.sourceOdds?.[period + "2"]);
    if (!odds1 || !odds2) {
      for (const bucket of buckets) bucket.missing++;
      continue;
    }
    const implied1 = 1 / odds1, implied2 = 1 / odds2;
    const marketP1 = implied1 / (implied1 + implied2);
    const player1Won = prediction.winnerId === prediction.sourceOdds.player1Id ? 1 : 0;
    const marketP = clamp(marketP1);
    const marketBrier = (marketP - player1Won) ** 2;
    const marketLogLoss = -player1Won * Math.log(marketP) - (1 - player1Won) * Math.log(1 - marketP);
    for (const bucket of buckets) {
      bucket.count++;
      bucket.market.brier += marketBrier;
      bucket.market.logLoss += marketLogLoss;
      addCalibration(bucket.marketCalibration, marketP, player1Won);
      for (const name of names) {
        // Model probabilities are always oriented to the lower-ID player.
        // Re-orient to Valuebetennis player1 without consulting the match result.
        const modelP1 = prediction.player1Id === prediction.sourceOdds.player1Id
          ? prediction.probabilities[name] : 1 - prediction.probabilities[name];
        const p = clamp(modelP1);
        const modelBrier = (p - player1Won) ** 2;
        const modelLogLoss = -player1Won * Math.log(p) - (1 - player1Won) * Math.log(1 - p);
        const brierDifference = modelBrier - marketBrier;
        const logLossDifference = modelLogLoss - marketLogLoss;
        const modelBucket = bucket.models[name];
        modelBucket.brier += modelBrier;
        modelBucket.logLoss += modelLogLoss;
        modelBucket.brierDiffSum += brierDifference;
        modelBucket.brierDiffSquared += brierDifference * brierDifference;
        modelBucket.logLossDiffSum += logLossDifference;
        modelBucket.logLossDiffSquared += logLossDifference * logLossDifference;
        addCalibration(bucket.modelCalibration[name], p, player1Won);
      }
    }
  }
  const format = bucket => {
    const metrics = value => bucket.count ? {
      brier: Number((value.brier / bucket.count).toFixed(5)),
      logLoss: Number((value.logLoss / bucket.count).toFixed(5))
    } : { brier: null, logLoss: null };
    const market = metrics(bucket.market);
    return {
      matches: bucket.count,
      matchesMissingOrInvalidOdds: bucket.missing,
      market,
      calibration: {
        market: formatCalibration(bucket.marketCalibration, bucket.count),
        models: Object.fromEntries(names.map(name => [name, formatCalibration(bucket.modelCalibration[name], bucket.count)]))
      },
      models: Object.fromEntries(names.map(name => {
        const model = metrics(bucket.models[name]);
        const paired = bucket.models[name];
        const interval = (sum, sumSquared, lowerBound = -Infinity, upperBound = Infinity) => {
          if (bucket.count < 2) return null;
          const mean = sum / bucket.count;
          const variance = Math.max(0, (sumSquared - sum * sum / bucket.count) / (bucket.count - 1));
          const margin = 1.96 * Math.sqrt(variance / bucket.count);
          return {
            lower: Number(Math.max(lowerBound, mean - margin).toFixed(5)),
            upper: Number(Math.min(upperBound, mean + margin).toFixed(5))
          };
        };
        return [name, {
          ...model,
          brierDifferenceVsMarket: bucket.count ? Number((model.brier - market.brier).toFixed(5)) : null,
          brierDifferenceVsMarketCI95: interval(paired.brierDiffSum, paired.brierDiffSquared, -1, 1),
          logLossDifferenceVsMarket: bucket.count ? Number((model.logLoss - market.logLoss).toFixed(5)) : null,
          logLossDifferenceVsMarketCI95: interval(paired.logLossDiffSum, paired.logLossDiffSquared)
        }];
      }))
    };
  };
  const byKey = map => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => [key, format(bucket)]));
  return {
    period,
    ...format(overall),
    byYear: byKey(byYear),
    bySurface: byKey(bySurface),
    byYearAndSurface: byKey(byYearAndSurface),
    byPriorH2hMeetings: byKey(byH2hMeetings),
    note: "Paired probability-quality comparison on exactly the same evaluated matches with valid two-sided Pinnacle odds. Difference confidence intervals are approximate normal 95% intervals over per-match paired loss differences and are null for fewer than two matches; they are not a multiple-comparison correction. Positive differences mean the model scores worse than the market. Year/surface groups with small samples are descriptive only. This is not betting ROI."
  };
}

function detectDelimiter(text) {
  const line=String(text).replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]??"";
  let quoted=false;const counts=[[",",0],[";",0],["\t",0]];
  for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&line[i+1]==='"'){i++;continue;}if(ch==='"')quoted=!quoted;else if(!quoted){const x=counts.find(v=>v[0]===ch);if(x)x[1]++;}}
  counts.sort((a,b)=>b[1]-a[1]);if(!counts[0][1])throw new SyntaxError("Could not detect CSV delimiter");return counts[0][0];
}
function validDate(value){
  const raw=String(value??"").trim(),m=/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?)?$/.exec(raw);
  if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],date=new Date(Date.UTC(y,mo-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  if(m[4]!==undefined&&(Number(m[4])>23||Number(m[5])>59||Number(m[6]??0)>59))return null;
  return m[1]+m[2]+m[3];
}
function validateMatchScore(score) {
  const raw = String(score ?? "").trim();
  if (!raw) return "invalid_score_format";
  const tokens = raw.split(/\s+/);
  // Nonstandard outcomes are retained for the downstream RET/W/O exclusion.
  if (tokens.some(token => /^(?:W\/O|RET|ABD|DEF|DEFAULT)$/i.test(token))) return "nonstandard";
  const sets = tokens.map(token => {
    const match = /^(\d{1,2})-(\d{1,2})(?:\((\d{1,2})\))?$/.exec(token);
    return match ? [Number(match[1]), Number(match[2])] : null;
  });
  if (sets.some(set => set === null) || sets.length < 2 || sets.length > 5) return "invalid_score_format";
  const completed = sets.every(([a, b]) => {
    const high = Math.max(a, b), low = Math.min(a, b);
    return high >= 6 && (high - low >= 2 || (high === 7 && low === 6));
  });
  return completed ? "valid" : "incomplete_set_score";
}
export function parseValuebetennisCsv(text){
  const delimiter=detectDelimiter(text),rows=parseCsv(text,{delimiter});
  if(!rows.length)return{rows:[],inputRows:0,rejectedRows:0,rejectedByReason:{},delimiter};
  const headers=Object.keys(rows[0]),missing=REQUIRED.filter(x=>!headers.includes(x));
  if(missing.length)throw new Error("Valuebetennis CSV missing required columns: "+missing.join(", "));
  const normalized=[],rejectedByReason={},reject=reason=>{rejectedByReason[reason]=(rejectedByReason[reason]||0)+1;};
  for(const row of rows){
    const date=validDate(row.date),p1=String(row.joueur1_id??"").trim(),p2=String(row.joueur2_id??"").trim();
    const winner=String(row.vainqueur_id??"").trim(),id=String(row.match_id??"").trim(),tour=String(row.genre??"").trim().toLowerCase();
    if(!date){reject("invalid_date");continue;}
    if(!/^\d+$/.test(p1)||Number(p1)<=0||!/^\d+$/.test(p2)||Number(p2)<=0||p1===p2){reject("invalid_player_ids");continue;}
    if(winner!==p1&&winner!==p2){reject("winner_not_in_match");continue;}
    if(!id){reject("missing_match_id");continue;}
    const scoreStatus=validateMatchScore(row.score);
    if(scoreStatus==="incomplete_set_score"){reject("incomplete_set_score");continue;}
    if(scoreStatus==="invalid_score_format"){reject("invalid_score_format");continue;}
    if(!["atp","wta"].includes(tour)){reject(tour?"unsupported_tour":"missing_tour");continue;}
    const rawDuration=String(row.duree_min??"").trim().replace(",", ".");
    const parsedDuration=rawDuration?Number(rawDuration):null;
    const durationMinutes=Number.isFinite(parsedDuration)&&parsedDuration>=1&&parsedDuration<=600?parsedDuration:null;
    normalized.push({tourney_date:date,tourney_id:String(row.tournoi_id??"").trim()||id,match_num:id,player1Id:p1,player2Id:p2,player1Name:String(row.joueur1??"").trim(),player2Name:String(row.joueur2??"").trim(),category:String(row.categorie??"").trim(),winner_id:winner,loser_id:winner===p1?p2:p1,score:String(row.score??"").trim(),surface:SURFACES.get(String(row.surface??"").trim().toLowerCase())??null,tour,durationMinutes,sourceOdds:{opening1:row.cote1_ouverture??"",opening2:row.cote2_ouverture??"",closing1:row.cote1_cloture??"",closing2:row.cote2_cloture??"",player1Id:p1,winnerId:winner}});
  }
  return{rows:normalized,inputRows:rows.length,rejectedRows:Object.values(rejectedByReason).reduce((a,b)=>a+b,0),rejectedByReason,delimiter};
}
function deduplicateSourceMatches(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.tour, row.tourney_id, row.match_num].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const unique = [];
  let duplicateRows = 0, conflictingDuplicateMatches = 0, conflictingDuplicateRows = 0;
  for (const group of groups.values()) {
    const signature = row => JSON.stringify([
      row.tourney_date, row.winner_id, row.loser_id, row.score, row.surface, row.durationMinutes,
      row.sourceOdds?.opening1, row.sourceOdds?.opening2,
      row.sourceOdds?.closing1, row.sourceOdds?.closing2,
      row.sourceOdds?.player1Id, row.sourceOdds?.winnerId
    ]);
    const signatures = new Set(group.map(signature));
    if (signatures.size > 1) {
      conflictingDuplicateMatches++;
      conflictingDuplicateRows += group.length;
      continue;
    }
    unique.push(group[0]);
    duplicateRows += group.length - 1;
  }
  return { rows: unique, duplicateRows, conflictingDuplicateMatches, conflictingDuplicateRows };
}
export function runValuebetennisBacktest(csvTexts, options = {}) {
  const inputs = Array.isArray(csvTexts) ? csvTexts : [csvTexts];
  const parsed = inputs.map(parseValuebetennisCsv);
  const rawRows = parsed.flatMap(item => item.rows);
  const deduped = deduplicateSourceMatches(rawRows);
  const rows = deduped.rows;
  const rejectedByReason = {};
  const parseRejected = parsed.reduce((count, item) => count + item.rejectedRows, 0);
  for (const item of parsed) {
    for (const [reason, count] of Object.entries(item.rejectedByReason)) {
      rejectedByReason[reason] = (rejectedByReason[reason] || 0) + count;
    }
  }
  if (deduped.conflictingDuplicateRows) rejectedByReason.conflicting_duplicate_match = deduped.conflictingDuplicateRows;

  const marketRows = rows.map(row => ({
    joueur1_id: row.sourceOdds.player1Id, vainqueur_id: row.sourceOdds.winnerId,
    cote1_ouverture: row.sourceOdds.opening1, cote2_ouverture: row.sourceOdds.opening2,
    cote1_cloture: row.sourceOdds.closing1, cote2_cloture: row.sourceOdds.closing2,
    score: row.score
  }));
  const tours = [...new Set(rows.map(row => row.tour).filter(Boolean))].sort();
  const years = [...new Set(rows.map(row => row.tourney_date.slice(0, 4)))].sort();
  const reports = Object.fromEntries(tours.map(tour => {
    const report = runBacktest(rows.filter(row => row.tour === tour), { ...options, includePredictions: true });
    const { predictions, ...publicReport } = report;
    return [tour, { report: publicReport, predictions }];
  }));
  const reportsByTour = Object.fromEntries(tours.map(tour => [tour, reports[tour].report]));
  const pairedMarketComparison = Object.fromEntries(tours.map(tour => {
    const predictions = reports[tour].predictions;
    return [tour, {
      opening: pairedModelMarketComparison(predictions, "opening"),
      closing: pairedModelMarketComparison(predictions, "closing")
    }];
  }));

  return {
    source: "Valuebetennis open data (CC BY 4.0)",
    inputRows: parsed.reduce((count, item) => count + item.inputRows, 0),
    normalizedRows: rows.length,
    rejectedRows: parseRejected + deduped.conflictingDuplicateRows,
    rejectedByReason,
    duplicateRows: deduped.duplicateRows,
    conflictingDuplicateMatches: deduped.conflictingDuplicateMatches,
    conflictingDuplicateRows: deduped.conflictingDuplicateRows,
    delimiters: [...new Set(parsed.map(item => item.delimiter))],
    tours,
    years: years.length ? { from: years[0], to: years.at(-1), count: years.length } : null,
    marketBenchmarks: {
      opening: marketBenchmark(marketRows, ODDS_FIELDS.opening),
      closing: marketBenchmark(marketRows, ODDS_FIELDS.closing)
    },
    pairedMarketComparison,
    report: tours.length === 1 ? reportsByTour[tours[0]] : null,
    reportsByTour,
    importantLimit: "The source provides match results and Pinnacle opening/last pre-match odds, but no archived pre-match model probabilities or full quote capture provenance. The paired comparison evaluates historical Elo candidates against Pinnacle on the same matches; it does not establish betting ROI or qualify for the strict odds-backtest."
  };
}
async function main(){
  const args=process.argv.slice(2),options={},files=[];
  for(let i=0;i<args.length;i++){if(args[i]==="--from"||args[i]==="--to"){if(!args[i+1])throw new Error("Missing date after "+args[i]);options[args[i]==="--from"?"evaluationStart":"evaluationEnd"]=args[++i];}else if(args[i].startsWith("--from="))options.evaluationStart=args[i].slice(7);else if(args[i].startsWith("--to="))options.evaluationEnd=args[i].slice(5);else if(args[i].startsWith("--"))throw new Error("Unknown option: "+args[i]);else files.push(args[i]);}
  if(!files.length){console.error("Usage: node scripts/valuebetennis-backtest.mjs [--from YYYYMMDD] [--to YYYYMMDD] valuebetennis-matchs-2026.csv [more CSV files...]");process.exitCode=2;return;}
  const texts=[];for(const file of files){texts.push(await readFile(file,"utf8"));console.error("Loaded "+basename(file));}
  console.log(JSON.stringify(runValuebetennisBacktest(texts,options),null,2));console.error("Lower Brier/log-loss is better. This is prediction quality, not ROI.");
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1]))await main();
