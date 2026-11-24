import { parseMatchCsv, mergeMatchDatasets, runWalkForward } from "./model-lab-core.mjs";

export function mountModelLab(root,readModels){
 const file=root.querySelector("#labDatasetFile"),meta=root.querySelector("#labDatasetMeta"),run=root.querySelector("#labRunButton"),progress=root.querySelector("#labProgress"),results=root.querySelector("#labResults");
 if(!file||!run)return;
 let dataset=null;
 file.addEventListener("change",async()=>{
  const selected=Array.from(file.files||[]);if(!selected.length)return;
  meta.textContent="Читаю CSV-файл…";results.textContent="";run.disabled=true;
  try{
   const parsed=[];
   for(let index=0;index<selected.length;index++){
    meta.textContent="Читаю CSV "+(index+1)+" / "+selected.length+": "+selected[index].name;
    parsed.push(parseMatchCsv(await selected[index].text()));
   }
   dataset=mergeMatchDatasets(parsed);
   meta.textContent=selected.map(item=>item.name).join(" + ")+" · строк: "+dataset.totalRows+" · матчей: "+dataset.matches.length+" · исключено: "+dataset.rejected+" · конфликтующих ID: "+dataset.conflicts+" · "+dataset.firstDate+" — "+dataset.lastDate;run.disabled=false;
  }
  catch(error){dataset=null;meta.textContent="Ошибка файла: "+String(error.message||error);run.disabled=true;}
 });
 run.addEventListener("click",async()=>{
  if(!dataset)return;
  let models=readModels().slice(0,6);if(!models.some(model=>model.id==="general-elo-v2")){models=models.slice(0,5);models.unshift({id:"general-elo-v2",name:"ELO baseline",k:32,surfaceWeight:.3,formWeight:80,h2hWeight:60});}
  run.disabled=true;progress.textContent="Подготовка walk-forward расчёта…";results.replaceChildren();
  try{
   const output=await runWalkForward(dataset.matches,models,{onProgress:p=>{progress.textContent="Обработано "+p.processed.toLocaleString("ru-RU")+" / "+p.total.toLocaleString("ru-RU")+" матчей · "+p.percent+"% · дата "+p.date;}});
   const baseline=output.results.find(row=>row.id===output.baselineId);
   const table=document.createElement("table");table.className="research-table";
   table.innerHTML="<thead><tr><th>Модель</th><th>N</th><th>Brier ↓</th><th>LogLoss ↓</th><th>Точность</th><th>ECE ↓</th><th>Δ Brier</th></tr></thead>";
   const body=document.createElement("tbody");
   output.results.forEach(row=>{
    const tr=document.createElement("tr");
    const values=[row.name,row.n.toLocaleString("ru-RU"),row.brier.toFixed(5),row.logLoss.toFixed(5),(row.accuracy*100).toFixed(2)+"%",(row.ece*100).toFixed(2)+"%",(row.deltaBrier>0?"+":"")+row.deltaBrier.toFixed(5)];
    values.forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.appendChild(td);});body.appendChild(tr);
   });
   table.appendChild(body);results.appendChild(table);
   const note=document.createElement("p");note.className="archive-meta";note.textContent="Одинаковая выборка для всех вариантов: "+output.totalMatches.toLocaleString("ru-RU")+" матчей, "+output.days+" календарных дней. Все прогнозы дня рассчитываются до обновления рейтингов результатами этого же дня. Базовая точка сравнения: "+(baseline?baseline.name:"первая модель")+". ROI не рассчитывался.";
   results.appendChild(note);progress.textContent="Расчёт завершён. Метрики сохранены только на экране; исходный CSV не отправлялся и не сохранялся.";
  }catch(error){progress.textContent="Ошибка расчёта: "+String(error.message||error);}
  finally{run.disabled=false;}
 });
}

window.TVSModelLab={mount:mountModelLab};
window.dispatchEvent(new Event("tvs-model-lab-ready"));
