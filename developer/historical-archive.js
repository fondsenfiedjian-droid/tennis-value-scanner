(function(){
"use strict";
const DB_NAME="tvs-developer-historical-archives";
const DB_VERSION=1;
const MAX_BYTES=100*1024*1024;
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bytes=n=>n<1024?n+" Б":n<1048576?(n/1024).toFixed(1)+" КБ":(n/1048576).toFixed(2)+" МБ";
const uid=()=>crypto.randomUUID?.()||"hist-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains("archives")){const s=db.createObjectStore("archives",{keyPath:"id"});s.createIndex("sha256","sha256",{unique:true});s.createIndex("importedAt","importedAt");}
   if(!db.objectStoreNames.contains("operations")){const s=db.createObjectStore("operations",{keyPath:"id"});s.createIndex("createdAt","createdAt");}
   if(!db.objectStoreNames.contains("normalizedMatches")){const s=db.createObjectStore("normalizedMatches",{keyPath:"id"});s.createIndex("archiveId","archiveId");s.createIndex("reviewStatus","reviewStatus");}
  };
  req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
  req.onerror=()=>reject(req.error||new Error("Не удалось открыть IndexedDB."));
  req.onblocked=()=>reject(new Error("Открытая вкладка блокирует обновление хранилища."));
 });
}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Транзакция отменена."));});}
function reqValue(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function parseCSV(input){
 const text=String(input).replace(/^\uFEFF/,"");if(!text.trim())throw Error("CSV-файл пуст.");
 const first=text.split(/\r?\n/,1)[0],delim=[",",";","\t"].map(d=>({d,n:first.split(d).length})).sort((a,b)=>b.n-a.n)[0].d;
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
 else if(c==='"'&&!cell)quoted=true;else if(c===delim){row.push(cell);cell="";}
 else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell="";}
 else cell+=c;}
 if(quoted)throw Error("Незакрытая кавычка в CSV.");row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2)throw Error("Нужны заголовки и хотя бы одна строка данных.");
 const headers=rows.shift().map(x=>x.trim().toLowerCase().replace(/[\s-]+/g,"_"));
 if(headers.some(x=>!x))throw Error("Пустое имя столбца.");
 if(new Set(headers).size!==headers.length)throw Error("Повторяются имена столбцов.");
 const has=aliases=>aliases.some(x=>headers.includes(x));
 const englishSchema=has(["winner_name","winner"])&&has(["loser_name","loser"])&&has(["tourney_date","date","match_date"]);
 const frenchSchema=["joueur1","joueur1_id","joueur2","joueur2_id","vainqueur_id","date"].every(x=>headers.includes(x));
 if(!englishSchema&&!frenchSchema)throw Error("Не распознана схема CSV. Нужны winner_name/loser_name/date либо французские поля joueur1, joueur1_id, joueur2, joueur2_id, vainqueur_id, date. Оригинал не сохранён.");
 const bad=rows.findIndex(r=>r.length!==headers.length);
 if(bad>=0)throw Error("Неверное число полей в строке "+(bad+2)+". Оригинал не сохранён.");
 if(frenchSchema){
  const ix=Object.fromEntries(headers.map((h,i)=>[h,i]));
  const invalid=rows.findIndex(r=>{
   const id1=String(r[ix.joueur1_id]??"").trim(),id2=String(r[ix.joueur2_id]??"").trim(),winner=String(r[ix.vainqueur_id]??"").trim();
   return !String(r[ix.joueur1]??"").trim()||!String(r[ix.joueur2]??"").trim()||!id1||!id2||!winner||!(winner===id1||winner===id2)||!String(r[ix.date]??"").trim();
  });
  if(invalid>=0)throw Error("Некорректные игроки, дата или ID победителя в строке "+(invalid+2)+". Оригинал не сохранён.");
 }
 return {headers,rows,rowCount:rows.length,schema:frenchSchema?"tennismylife-fr":"standard"};
}
async function log(db,action,status,details){
 const tx=db.transaction("operations","readwrite"),done=txDone(tx);
 tx.objectStore("operations").add({id:uid(),createdAt:new Date().toISOString(),action,status,details});
 await done;
}
async function refresh(){
 const db=await openDB();
 const tx=db.transaction(["archives","operations"],"readonly"),done=txDone(tx);
 const [archives,ops]=await Promise.all([reqValue(tx.objectStore("archives").getAll()),reqValue(tx.objectStore("operations").getAll())]);await done;
 archives.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));ops.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 $("historicalArchiveCount").textContent=archives.length;
 $("historicalArchiveList").innerHTML=archives.length?archives.map(a=>'<article class="archive-item"><b>'+esc(a.name)+'</b><div class="archive-meta">'+esc(a.sourceHint)+' · '+bytes(a.size)+' · '+esc(new Date(a.importedAt).toLocaleString("ru-RU"))+'</div><div class="archive-meta">SHA-256: <code>'+esc(a.sha256)+'</code></div><div class="archive-meta">Оригинал сохранён · данные не нормализованы и не подтверждены</div><button type="button" class="secondary-btn" data-historical-analyze="'+esc(a.id)+'">Предварительный разбор</button></article>').join(""):'<div class="archive-item">Исторические архивы пока не загружены.</div>';
 $("historicalArchiveLog").innerHTML=ops.length?ops.slice(0,20).map(o=>'<div class="archive-item"><b>'+esc(o.action)+' · '+esc(o.status)+'</b><div class="archive-meta">'+esc(new Date(o.createdAt).toLocaleString("ru-RU"))+'</div></div>').join(""):'<div class="archive-item">Операций пока нет.</div>';
}

function classifyScoreStatus(value){
 const s=String(value??"").trim().toLowerCase();
 if(!s)return "без счёта";
 if(/\b(ret\.?|retired)\b/.test(s))return "retirement — отказ игрока";
 if(/\b(w\s*\/?\s*o|walkover)\b/.test(s))return "walkover — неявка/снятие до матча";
 if(/\b(def\.?|defaulted)\b/.test(s))return "default — дисквалификация/дефолт";
 if(/\b(abandoned|cancelled|canceled|suspended)\b/.test(s))return "прерван/отменён";
 return "обычный счёт";
}
function isValidScoreFormat(value){
 const s=String(value??"").trim();if(!s)return true;
 const core=s.replace(/\b(?:ret(?:ired)?\.?|w\s*\/?\s*o|walkover|def(?:aulted)?\.?|abandoned|cancelled|canceled|suspended)(?=\s|$)/ig,"").trim();
 return /^[0-9\s()-]+$/.test(core);
}
function classifyDate(value){
 const s=String(value??"").trim();
 if(/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(s))return "ISO YYYY-MM-DD";
 if(/^\d{8}$/.test(s))return "YYYYMMDD";
 if(/^\d{2}[/]\d{2}[/]\d{4}$/.test(s))return "DD/MM/YYYY или MM/DD/YYYY (неоднозначно)";
 if(/^\d{2}-\d{2}-\d{4}$/.test(s))return "DD-MM-YYYY или MM-DD-YYYY (неоднозначно)";
 return s?"неизвестный формат":"пустая дата";
}
async function analyzeLatestArchive(){
 const db=await openDB(),tx=db.transaction("archives","readonly"),done=txDone(tx);
 const archives=await reqValue(tx.objectStore("archives").getAll());await done;
 archives.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));
 if(!archives.length)throw Error("Сначала сохраните CSV в исторический архив.");
 await analyzeArchive(archives[0].id);
}
async function analyzeArchive(archiveId){
 const status=$("historicalArchiveStatus"),db=await openDB();
 const tx=db.transaction("archives","readonly"),done=txDone(tx);
 const archive=await reqValue(tx.objectStore("archives").get(archiveId));await done;
 if(!archive||!archive.original)throw Error("Оригинал архива не найден.");
 const parsed=parseCSV(await archive.original.text());
 if(parsed.schema!=="tennismylife-fr")throw Error("Предварительный разбор пока поддерживает только CSV TennisMyLife.");
 const ix=Object.fromEntries(parsed.headers.map((h,i)=>[h,i]));
 const get=(r,k)=>String(r[ix[k]]??"").trim();
 const dateCounts={},surfaceCounts={},scoreStatusCounts={},seenIds=new Set(),seenNaturalKeys=new Set(),naturalKeyFirst=new Map(),possibleDuplicateRows=[],invalidScoreRows=[],preview=[];
 let validWinner=0,invalidWinner=0,missingPlayers=0,missingDate=0,duplicateMatchId=0,duplicateNaturalKey=0,invalidScoreFormat=0,invalidOpenOdds=0,invalidCloseOdds=0;
 const missing={score:0,tournament:0,tournamentId:0,category:0,gender:0,round:0,openOdds:0,closeOdds:0};
 const present=(row,k)=>ix[k]!==undefined&&!!get(row,k);
 const naturalKey=(r)=>[get(r,"date").slice(0,10),get(r,"tournoi_id"),[get(r,"joueur1_id"),get(r,"joueur2_id")].sort().join("|")].join("|");
  const validOdds=v=>{const n=Number(String(v).trim().replace(",","."));return Number.isFinite(n)&&n>1&&n<=100;};
 for(let i=0;i<parsed.rows.length;i++){
  const r=parsed.rows[i],id1=get(r,"joueur1_id"),id2=get(r,"joueur2_id"),winner=get(r,"vainqueur_id"),date=get(r,"date"),matchId=get(r,"match_id");
  const w1=!!id1&&winner===id1,w2=!!id2&&winner===id2;
  if(w1||w2)validWinner++;else invalidWinner++;
  if(!get(r,"joueur1")||!get(r,"joueur2")||!id1||!id2)missingPlayers++;
  if(!date)missingDate++;
  const dt=classifyDate(date);dateCounts[dt]=(dateCounts[dt]||0)+1;
  const surface=get(r,"surface")||"(пусто)";surfaceCounts[surface]=(surfaceCounts[surface]||0)+1;
  if(matchId){if(seenIds.has(matchId))duplicateMatchId++;else seenIds.add(matchId);}
  const scoreValue=get(r,"score"),scoreStatus=classifyScoreStatus(scoreValue);scoreStatusCounts[scoreStatus]=(scoreStatusCounts[scoreStatus]||0)+1;
  const player1=get(r,"joueur1"),player2=get(r,"joueur2"),winnerName=w1?player1:w2?player2:"НЕ ОПРЕДЕЛЁН";
  const rowInfo={row:i+2,matchId,date,players:player1+" — "+player2,tournament:get(r,"tournoi"),score:scoreValue,player1Id:id1,player2Id:id2,winnerId:winner,winnerName};
  const nk=naturalKey(r);if(get(r,"tournoi_id")&&id1&&id2&&date){if(naturalKeyFirst.has(nk)){duplicateNaturalKey++;const first=naturalKeyFirst.get(nk);const playerIdsMatch=(first.player1Id===id1&&first.player2Id===id2)||(first.player1Id===id2&&first.player2Id===id1);const winnerIdMatch=first.winnerId===winner;const firstHasScore=!!first.score,duplicateHasScore=!!rowInfo.score;const confidence=playerIdsMatch&&winnerIdMatch&&firstHasScore!==duplicateHasScore?"высокая — одна запись без счёта":playerIdsMatch&&winnerIdMatch?"средняя — совпадают игроки и победитель":"требует ручной проверки";possibleDuplicateRows.push({first,duplicate:rowInfo,playerIdsMatch,winnerIdMatch,confidence});}else{seenNaturalKeys.add(nk);naturalKeyFirst.set(nk,rowInfo);}}
  for(const [key,field] of [["score","score"],["tournament","tournoi"],["tournamentId","tournoi_id"],["category","categorie"],["gender","genre"],["round","tour"]])if(!present(r,field))missing[key]++;
  if(!present(r,"cote1_ouverture")||!present(r,"cote2_ouverture"))missing.openOdds++;
   else if(!validOdds(get(r,"cote1_ouverture"))||!validOdds(get(r,"cote2_ouverture")))invalidOpenOdds++;
   if(!present(r,"cote1_cloture")||!present(r,"cote2_cloture"))missing.closeOdds++;
   else if(!validOdds(get(r,"cote1_cloture"))||!validOdds(get(r,"cote2_cloture")))invalidCloseOdds++;
   const score=get(r,"score");
   if(score&&!isValidScoreFormat(score)){invalidScoreFormat++;invalidScoreRows.push({row:i+2,date,players:get(r,"joueur1")+" — "+get(r,"joueur2"),tournament:get(r,"tournoi"),score,matchId});}
   if(preview.length<5)preview.push({row:i+2,date,players:get(r,"joueur1")+" — "+get(r,"joueur2"),winner:w1?get(r,"joueur1"):w2?get(r,"joueur2"):"НЕ ОПРЕДЕЛЁН",surface,score:get(r,"score")});
 }
 const list=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>"<li>"+esc(k)+": "+v+"</li>").join("");
 const sampleRows=preview.map(p=>"<tr><td>"+p.row+"</td><td>"+esc(p.date)+"</td><td>"+esc(p.players)+"</td><td>"+esc(p.winner)+"</td><td>"+esc(p.surface)+"</td><td>"+esc(p.score)+"</td></tr>").join("");
 const invalidScoreTable=invalidScoreRows.length?"<table><thead><tr><th>Строка</th><th>Дата</th><th>Турнир</th><th>Игроки</th><th>Счёт</th><th>match_id</th></tr></thead><tbody>"+invalidScoreRows.map(d=>"<tr><td>"+d.row+"</td><td>"+esc(d.date)+"</td><td>"+esc(d.tournament)+"</td><td>"+esc(d.players)+"</td><td>"+esc(d.score)+"</td><td>"+esc(d.matchId)+"</td></tr>").join("")+"</tbody></table>":"<p>Подозрительных значений не обнаружено.</p>";
 const highConfidenceDuplicates=possibleDuplicateRows.filter(d=>d.confidence.startsWith("высокая")).length;
 const duplicateTable=possibleDuplicateRows.length?"<p>Высокая вероятность: "+highConfidenceDuplicates+" из "+possibleDuplicateRows.length+". Это классификация для проверки, не команда на удаление или объединение.</p><table><thead><tr><th>Статус</th><th>Первая строка</th><th>Повторная строка</th><th>Дата</th><th>Турнир</th><th>Игроки</th><th>ID игроков</th><th>Победитель первой / повторной</th><th>Счёт первой / повторной</th><th>match_id</th></tr></thead><tbody>"+possibleDuplicateRows.map(d=>"<tr><td>"+esc(d.confidence)+"</td><td>"+d.first.row+"</td><td>"+d.duplicate.row+"</td><td>"+esc(d.duplicate.date)+"</td><td>"+esc(d.duplicate.tournament)+"</td><td>"+esc(d.duplicate.players)+"</td><td>"+(d.playerIdsMatch?"совпадают":"НЕ СОВПАДАЮТ")+" ("+esc(d.first.player1Id)+"/"+esc(d.first.player2Id)+"; "+esc(d.duplicate.player1Id)+"/"+esc(d.duplicate.player2Id)+")</td><td>"+esc(d.first.winnerName)+" ("+esc(d.first.winnerId)+") / "+esc(d.duplicate.winnerName)+" ("+esc(d.duplicate.winnerId)+") · "+(d.winnerIdMatch?"совпадает":"НЕ СОВПАДАЕТ")+"</td><td>"+esc(d.first.score)+" / "+esc(d.duplicate.score)+"</td><td>"+esc(d.first.matchId)+" / "+esc(d.duplicate.matchId)+"</td></tr>").join("")+"</tbody></table>":"<p>Кандидатов на повторы не обнаружено.</p>";
  let panel=$("historicalArchiveAnalysis");
 if(!panel){panel=document.createElement("section");panel.id="historicalArchiveAnalysis";panel.className="archive-item";$("historicalArchiveList").insertAdjacentElement("afterend",panel);}
 panel.innerHTML="<b>Предварительный разбор: "+esc(archive.name)+"</b><p>Строк: "+parsed.rowCount+" · победитель по ID определён: "+validWinner+" · спорный ID победителя: "+invalidWinner+" · неполные данные игроков: "+missingPlayers+" · пустая дата: "+missingDate+" · повторные match_id: "+duplicateMatchId+" · возможные повторы по дате/турниру/паре: "+duplicateNaturalKey+"</p><b>Форматы дат</b><ul>"+list(dateCounts)+"</ul><b>Поверхности</b><ul>"+list(surfaceCounts)+"</ul><b>Пропуски по полям</b><ul>"+Object.entries(missing).map(([k,v])=>"<li>"+esc(({score:"Без счёта",tournament:"Без названия турнира",tournamentId:"Без ID турнира",category:"Без категории",gender:"Без пола/тура",round:"Без раунда",openOdds:"Без полной пары стартовых коэффициентов",closeOdds:"Без полной пары закрывающих коэффициентов"})[k])+": "+v+"</li>").join("")+"</ul><b>Классификация счёта</b><ul>"+list(scoreStatusCounts)+"</ul><b>Проверка формата</b><ul><li>Подозрительный формат счёта: "+invalidScoreFormat+"</li><li>Неправдоподобные стартовые коэффициенты: "+invalidOpenOdds+"</li><li>Неправдоподобные закрывающие коэффициенты: "+invalidCloseOdds+"</li></ul><b>Строки с подозрительным форматом счёта</b><div style='overflow-x:auto'>"+invalidScoreTable+"</div><b>Кандидаты на повторы (не удалять автоматически)</b><div style='overflow-x:auto'>"+duplicateTable+"</div><b>Первые пять строк</b><div style='overflow-x:auto'><table><thead><tr><th>Строка</th><th>Дата</th><th>Игроки</th><th>Победитель</th><th>Покрытие</th><th>Счёт</th></tr></thead><tbody>"+sampleRows+"</tbody></table></div><p>Только чтение. Нормализованные записи не сохранены; сопоставление источников и допуск в модель не выполнялись.</p>";
 await log(db,"archive.analyze","preview_only",{archiveId,rows:parsed.rowCount,validWinner,invalidWinner,missingPlayers,missingDate,duplicateMatchId,duplicateNaturalKey,invalidScoreFormat,invalidOpenOdds,invalidCloseOdds,missing,dateCounts,surfaceCounts,scoreStatusCounts,possibleDuplicateRows,invalidScoreRows});
 status.textContent="Предварительный разбор завершён. Оригинал не изменён; данные в модель не передавались.";
}
async function importFile(){
 const file=$("historicalArchiveFile").files?.[0],status=$("historicalArchiveStatus"),button=$("historicalArchiveImport");
 if(!file){status.textContent="Сначала выберите CSV-файл.";return;}
 button.disabled=true;status.textContent="Проверка CSV, SHA-256 и сохранение оригинала…";
 try{
  if(!/\.csv$/i.test(file.name))throw Error("Пока поддерживается только CSV.");
  if(!file.size)throw Error("Файл пуст.");
  if(file.size>MAX_BYTES)throw Error("Лимит размера — 100 МБ.");
  const parsed=parseCSV(await file.text());
  if(!crypto.subtle)throw Error("SHA-256 недоступен в этом контексте браузера.");
  const buffer=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),b=>b.toString(16).padStart(2,"0")).join("");
  const db=await openDB(),check=db.transaction("archives","readonly"),checkDone=txDone(check);
  const duplicate=await reqValue(check.objectStore("archives").index("sha256").get(hash));await checkDone;
  if(duplicate){await log(db,"archive.import","duplicate",{archiveId:duplicate.id,name:file.name,sha256:hash});status.textContent="Этот файл уже сохранён. Повторная копия не создана.";await refresh();return;}
  const record={id:uid(),name:file.name,sourceHint:$("historicalArchiveSource").value||"unknown",format:"csv",size:file.size,sha256:hash,importedAt:new Date().toISOString(),status:"original_stored_unclassified",mimeType:file.type||"text/csv",original:new Blob([buffer],{type:file.type||"text/csv"})};
  const tx=db.transaction("archives","readwrite"),writeDone=txDone(tx);
  tx.objectStore("archives").add(record);await writeDone;
  await log(db,"archive.import","stored",{archiveId:record.id,name:record.name,sourceHint:record.sourceHint,size:record.size,sha256:hash});
  $("historicalArchiveFile").value="";status.textContent="Оригинал сохранён. Строк данных: "+parsed.rowCount+". Источник не считается подтверждённым; в модель ничего не передано.";await refresh();
 }catch(error){status.textContent="Импорт остановлен: "+String(error?.message||error);}
 finally{button.disabled=false;}
}
function init(){
 if(!$("historicalArchivePanel"))return;
 const topButton=$("historicalArchiveAnalyzeLatest");
 if(topButton)topButton.addEventListener("click",()=>{
  topButton.disabled=true;
  analyzeLatestArchive().catch(e=>$("historicalArchiveStatus").textContent="Разбор остановлен: "+String(e?.message||e)).finally(()=>{topButton.disabled=false;});
 });
 const importButton=$("historicalArchiveImport");
 if(importButton)importButton.addEventListener("click",event=>{event.preventDefault();importFile();});
 const archiveList=$("historicalArchiveList");
 if(archiveList)archiveList.addEventListener("click",event=>{
  const button=event.target.closest("[data-historical-analyze]");
  if(!button)return;
  button.disabled=true;
  analyzeArchive(button.getAttribute("data-historical-analyze"))
   .catch(e=>$("historicalArchiveStatus").textContent="Разбор остановлен: "+String(e?.message||e))
   .finally(()=>{button.disabled=false;});
 });
 $("historicalArchiveRefresh").addEventListener("click",()=>refresh().then(()=>$("historicalArchiveStatus").textContent="Архив обновлён.").catch(e=>$("historicalArchiveStatus").textContent="Ошибка: "+e.message));
 refresh().then(()=>$("historicalArchiveStatus").textContent="Отдельное историческое хранилище готово. Оригиналы остаются на устройстве.").catch(e=>$("historicalArchiveStatus").textContent="Хранилище недоступно: "+e.message);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();

})();
