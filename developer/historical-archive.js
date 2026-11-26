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
 const groups=[["winner_name","winner"],["loser_name","loser"],["tourney_date","date","match_date"]];
 const missing=groups.filter(g=>!has(g)).map(g=>g[0]);
 if(missing.length)throw Error("Не распознаны обязательные столбцы: "+missing.join(", ")+". Оригинал не сохранён.");
 const bad=rows.findIndex(r=>r.length!==headers.length);
 if(bad>=0)throw Error("Неверное число полей в строке "+(bad+2)+". Оригинал не сохранён.");
 return {headers,rowCount:rows.length};
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
 $("historicalArchiveList").innerHTML=archives.length?archives.map(a=>'<article class="archive-item"><b>'+esc(a.name)+'</b><div class="archive-meta">'+esc(a.sourceHint)+' · '+bytes(a.size)+' · '+esc(new Date(a.importedAt).toLocaleString("ru-RU"))+'</div><div class="archive-meta">SHA-256: <code>'+esc(a.sha256)+'</code></div><div class="archive-meta">Оригинал сохранён · данные не нормализованы и не подтверждены</div></article>').join(""):'<div class="archive-item">Исторические архивы пока не загружены.</div>';
 $("historicalArchiveLog").innerHTML=ops.length?ops.slice(0,20).map(o=>'<div class="archive-item"><b>'+esc(o.action)+' · '+esc(o.status)+'</b><div class="archive-meta">'+esc(new Date(o.createdAt).toLocaleString("ru-RU"))+'</div></div>').join(""):'<div class="archive-item">Операций пока нет.</div>';
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
 $("historicalArchiveImport").addEventListener("click",importFile);
 $("historicalArchiveRefresh").addEventListener("click",()=>refresh().then(()=>$("historicalArchiveStatus").textContent="Архив обновлён.").catch(e=>$("historicalArchiveStatus").textContent="Ошибка: "+e.message));
 refresh().then(()=>$("historicalArchiveStatus").textContent="Отдельное историческое хранилище готово. Оригиналы остаются на устройстве.").catch(e=>$("historicalArchiveStatus").textContent="Хранилище недоступно: "+e.message);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
