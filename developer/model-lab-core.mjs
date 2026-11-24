const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const eloProbability=delta=>1/(1+Math.pow(10,-delta/400));
const surfaceName=value=>{
 const s=String(value||"").trim().toLowerCase();
 if(/terre|clay|грунт/.test(s))return "Clay";
 if(/gazon|grass|трава/.test(s))return "Grass";
 if(/moquette|carpet|ковёр|ковер/.test(s))return "Carpet";
 if(/dur|hard|хард/.test(s))return "Hard";
 return "";
};
function parseRows(source){
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue;}
  if(ch==='"'){quoted=!quoted;continue;}
  if(ch===";"&&!quoted){row.push(cell);cell="";continue;}
  if((ch==="\n"||ch==="\r")&&!quoted){
   if(ch==="\r"&&next==="\n")i++;
   row.push(cell);cell="";
   if(row.some(value=>value.trim()!==""))rows.push(row);
   row=[];continue;
  }
  cell+=ch;
 }
 row.push(cell);if(row.some(value=>value.trim()!==""))rows.push(row);
 return rows;
}
function parseDate(value){
 const s=String(value||"").trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const [year,month,day]=s.split("-").map(Number);const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?s:"";}
 const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
 if(m){const year=Number(m[3]),month=Number(m[2]),day=Number(m[1]),d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):"";}
 return "";
}
export function mergeMatchDatasets(parts){
 const unique=new Map(),conflicts=new Set();let totalRows=0,rejected=0,conflictCount=0;
 for(const part of parts){for(const id of part.conflictIds||[])conflicts.add(id);}
 for(const part of parts){
  totalRows+=part.totalRows;rejected+=part.rejected;conflictCount+=part.conflicts||0;
  for(const match of part.matches){
   if(conflicts.has(match.id)){rejected++;continue;}
   const existing=unique.get(match.id);
   if(!existing){unique.set(match.id,match);continue;}
   const same=existing.date===match.date&&existing.surface===match.surface&&pairKey(existing.p1,existing.p2)===pairKey(match.p1,match.p2)&&existing.winner===match.winner;
   if(same){rejected++;continue;}
   unique.delete(match.id);conflicts.add(match.id);rejected+=2;
  }
 }
 const matches=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(!matches.length)throw new Error("После объединения CSV не осталось однозначных матчей: проверьте совпадающие ID и содержимое файлов.");
 return {matches,totalRows,rejected,firstDate:matches[0].date,lastDate:matches[matches.length-1].date,conflicts:conflicts.size};
}
export function parseMatchCsv(source){
 const rows=parseRows(String(source||"").replace(/^\uFEFF/,""));
 if(rows.length<2)throw new Error("В CSV нет строк матчей.");
 const headers=rows[0].map(value=>value.trim().toLowerCase().replace(/^\uFEFF/,""));
 const index=(...names)=>headers.findIndex(header=>names.includes(header));
 const ix={id:index("match_id","matchid","id"),date:index("date","match_date","matchdate"),surface:index("surface","court"),p1:index("joueur1_id","player1_id","player_a_id"),p2:index("joueur2_id","player2_id","player_b_id"),winner:index("vainqueur_id","winner_id","winnerid")};
 const missing=Object.entries(ix).filter(([key,value])=>key!=="id"&&value<0).map(([key])=>key);
 if(missing.length)throw new Error("Не найдены обязательные столбцы: "+missing.join(", "));
 const unique=new Map(),conflicts=new Set();let rejected=0;
 for(let i=1;i<rows.length;i++){
  const cells=rows[i],date=parseDate(cells[ix.date]),p1=String(cells[ix.p1]||"").trim(),p2=String(cells[ix.p2]||"").trim(),winner=String(cells[ix.winner]||"").trim();
  if(!date||!p1||!p2||p1===p2||!(winner===p1||winner===p2)){rejected++;continue;}
  const id=ix.id>=0?String(cells[ix.id]||"").trim():"";
  const key=id||[date,...[p1,p2].sort()].join("|");
  const match={id:id||key,date,surface:surfaceName(ix.surface>=0?cells[ix.surface]:""),p1,p2,winner};
  if(conflicts.has(key)){rejected++;continue;}
  const existing=unique.get(key);
  if(!existing){unique.set(key,match);continue;}
  const same=existing.date===match.date&&existing.surface===match.surface&&pairKey(existing.p1,existing.p2)===pairKey(match.p1,match.p2)&&existing.winner===match.winner;
  if(same){rejected++;continue;}
  unique.delete(key);conflicts.add(key);rejected+=2;
 }
 const matches=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 if(!matches.length)throw new Error("Не найдено однозначных завершённых матчей с корректными датами, ID игроков и победителем.");
 return {matches,rejected,totalRows:rows.length-1,firstDate:matches[0].date,lastDate:matches[matches.length-1].date,conflicts:conflicts.size,conflictIds:[...conflicts]};
}
const pairKey=(a,b)=>a<b?a+"|"+b:b+"|"+a;
function createState(){return {ratings:new Map(),surfaceRatings:new Map(),form:new Map(),h2h:new Map()};}
function rating(map,key){return map.get(key)??1500;}
function formMean(state,id){
 const values=state.form.get(id)||[];
 if(!values.length)return .5;
 return values.reduce((sum,value)=>sum+value,0)/values.length;
}
function h2hDifference(state,a,b){
 const key=pairKey(a,b),record=state.h2h.get(key);
 if(!record)return 0;
 const diff=a===record.low?record.lowWins-record.highWins:record.highWins-record.lowWins;
 return diff/(record.lowWins+record.highWins+4);
}
function pushForm(state,id,result){
 const values=state.form.get(id)||[];values.push(result);
 if(values.length>10)values.shift();state.form.set(id,values);
}
function updateH2h(state,a,b,winner){
 const low=a<b?a:b,high=a<b?b:a,key=pairKey(a,b);
 const record=state.h2h.get(key)||{low,high,lowWins:0,highWins:0};
 if(winner===low)record.lowWins++;else record.highWins++;
 state.h2h.set(key,record);
}
function metricsAccumulator(){return {n:0,brier:0,logLoss:0,correct:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))};}
function addMetric(acc,p,y){
 p=clamp(p,1e-9,1-1e-9);acc.n++;acc.brier+=(p-y)**2;
 acc.logLoss+=-(y*Math.log(p)+(1-y)*Math.log(1-p));
 if((p>=.5?1:0)===y)acc.correct++;
 const bin=Math.min(9,Math.floor(p*10)),bucket=acc.bins[bin];bucket.n++;bucket.p+=p;bucket.y+=y;
}
function finishMetrics(acc){
 const ece=acc.bins.reduce((sum,b)=>sum+(b.n?b.n/Math.max(1,acc.n)*Math.abs(b.p/b.n-b.y/b.n):0),0);
 return {n:acc.n,brier:acc.brier/Math.max(1,acc.n),logLoss:acc.logLoss/Math.max(1,acc.n),accuracy:acc.correct/Math.max(1,acc.n),ece};
}
export async function runWalkForward(matches,models,{onProgress=()=>{}}={}){
 if(!Array.isArray(matches)||!matches.length)throw new Error("Сначала загрузите исторический CSV.");
 const configs=models.slice(0,12).map(model=>({id:String(model.id),name:String(model.name||model.id),k:clamp(Number(model.k)||32,1,150),surfaceWeight:clamp(Number(model.surfaceWeight)||0,0,2),formWeight:clamp(Number(model.formWeight)||0,0,250),h2hWeight:clamp(Number(model.h2hWeight)||0,0,200),state:createState(),metrics:metricsAccumulator()}));
 if(!configs.length)throw new Error("Нет конфигураций моделей для проверки.");
 const days=[];for(const match of matches){const last=days[days.length-1];if(!last||last.date!==match.date)days.push({date:match.date,matches:[match]});else last.matches.push(match);}
 let processed=0;
 for(let dayIndex=0;dayIndex<days.length;dayIndex++){
  const day=days[dayIndex];
  // All predictions for a calendar day are calculated before any result from that day updates history.
  const predictions=configs.map(config=>day.matches.map(match=>{
   const state=config.state,a=match.p1,b=match.p2;
   const base=rating(state.ratings,a)-rating(state.ratings,b);
   const surface=match.surface?rating(state.surfaceRatings,a+"|"+match.surface)-rating(state.surfaceRatings,b+"|"+match.surface):0;
   const form=formMean(state,a)-formMean(state,b);
   const h2h=h2hDifference(state,a,b);
   const p=eloProbability(base+config.surfaceWeight*surface+config.formWeight*form+config.h2hWeight*h2h);
   const surfaceP=match.surface?eloProbability(surface):null;
   return {match,p,surfaceP,y:match.winner===a?1:0};
  }));
  configs.forEach((config,modelIndex)=>predictions[modelIndex].forEach(item=>addMetric(config.metrics,item.p,item.y)));
  configs.forEach((config,modelIndex)=>{
   const state=config.state;
   predictions[modelIndex].forEach(({match,p,surfaceP,y})=>{
    const outcome=y,a=match.p1,b=match.p2;
    const delta=config.k*(outcome-p);
    state.ratings.set(a,rating(state.ratings,a)+delta);
    state.ratings.set(b,rating(state.ratings,b)-delta);
    if(match.surface){
     const ka=a+"|"+match.surface,kb=b+"|"+match.surface;
     const ra=rating(state.surfaceRatings,ka),rb=rating(state.surfaceRatings,kb),surfaceDelta=config.k*.5*(outcome-(surfaceP??eloProbability(ra-rb)));
     state.surfaceRatings.set(ka,ra+surfaceDelta);state.surfaceRatings.set(kb,rb-surfaceDelta);
    }
    pushForm(state,a,outcome);pushForm(state,b,1-outcome);updateH2h(state,a,b,match.winner);
   });
  });
  processed+=day.matches.length;
  if(dayIndex%20===0||dayIndex===days.length-1){onProgress({processed,total:matches.length,date:day.date,percent:Math.round(processed/matches.length*100)});await new Promise(resolve=>setTimeout(resolve,0));}
 }
 const results=configs.map(config=>({id:config.id,name:config.name,...finishMetrics(config.metrics)}));
 const baseline=results.find(row=>row.id==="general-elo-v2")||results[0];
 return {results:results.map(row=>({...row,deltaBrier:row.brier-baseline.brier,deltaLogLoss:row.logLoss-baseline.logLoss})),baselineId:baseline.id,totalMatches:matches.length,days:days.length};
}
