const API=location.hostname.startsWith("deploy-preview-")
  ?"https://tennis-value-api-preview.fonds-enfiedjian.workers.dev"
  :"https://tennis-value-api.fonds-enfiedjian.workers.dev";
const loaded=new WeakSet();
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const listFrom=payload=>{
  if(Array.isArray(payload))return payload;
  if(!payload||typeof payload!=="object")return [];
  for(const key of ["data","prices","items","results","history"])if(Array.isArray(payload[key]))return payload[key];
  return [];
};
const priceRows=payload=>{
  if(Array.isArray(payload?.prices))return payload.prices;
  if(Array.isArray(payload?.data?.prices))return payload.data.prices;
  if(Array.isArray(payload?.market?.prices))return payload.market.prices;
  return listFrom(payload);
};
const dateOf=item=>item?.timestamp??item?.created_at??item?.createdAt??item?.updated_at??item?.date??item?.time??null;
const timestampOf=value=>{
  if(typeof value==="number"&&Number.isFinite(value)){
    const millis=value<1e12?value*1000:value;
    return Number.isFinite(millis)?millis:NaN;
  }
  if(typeof value==="string"&&/^\d{10,13}$/.test(value.trim())){
    const numeric=Number(value);
    return numeric<1e12?numeric*1000:numeric;
  }
  return value?Date.parse(value):NaN;
};
const formatDate=value=>{
  const timestamp=timestampOf(value);
  return Number.isFinite(timestamp)?new Date(timestamp).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"Время не указано";
};
const probability=value=>{
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<=1?(n*100).toFixed(1)+"%":null;
};
function status(panel,message){panel.innerHTML='<div class="archive-meta">'+esc(message)+'</div>';}
async function get(path){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 let response;
 try{
  response=await fetch(API+path,{headers:{Accept:"application/json"},signal:controller.signal});
 }finally{clearTimeout(timeout);}
 let body={};try{body=await response.json();}catch{}
 if(!response.ok){const error=new Error(body?.error||("HTTP "+response.status));error.status=response.status;error.accessStatus=body?.accessStatus;throw error;}
 return body;
}
async function load(panel,matchId,playerNames){
 status(panel,"Загружаем историю рыночных котировок…");
 try{
  const payload=await get("/matches/"+encodeURIComponent(matchId)+"/prices?limit=100");
  const rows=priceRows(payload).slice().sort((a,b)=>timestampOf(dateOf(a))-timestampOf(dateOf(b))).slice(-24);
  if(!rows.length){
   status(panel,"История котировок пока отсутствует. Для старых матчей данные могут быть удалены по сроку хранения API.");
   return;
  }
  const entries=rows.map(row=>{
   const mid=probability(row?.mid),bid=probability(row?.bid),ask=probability(row?.ask);
   const side=row?.side===1?"Сторона 1"+(playerNames[0]?" · "+playerNames[0]:""):row?.side===2?"Сторона 2"+(playerNames[1]?" · "+playerNames[1]:""):"Сторона не указана";
   const quote=mid!==null?"mid "+mid:(bid!==null||ask!==null?"bid "+(bid??"—")+" / ask "+(ask??"—"):"Котировка недоступна");
   const book=bid!==null||ask!==null?" · bid/ask "+(bid??"—")+" / "+(ask??"—"):"";
   const bookQuality=row?.synthetic===true?" · bid/ask оценочные":row?.synthetic===false?" · реальный стакан":row?.synthetic===null||row?.synthetic===undefined?" · тип стакана неизвестен":"";
   const source=row?.price_source?" · источник "+String(row.price_source):"";
   return '<div class="archive-meta">'+esc(formatDate(dateOf(row)))+' · '+esc(side)+' · <b>'+esc(quote)+'</b>'+esc(book)+esc(bookQuality)+esc(source)+'</div>';
  }).join("");
  panel.innerHTML='<div class="section-head" style="margin:0 0 8px"><h2>История рыночных котировок</h2><span class="muted">Live Tennis API · PRO</span></div>'+
   entries+
   '<div class="archive-meta">Показаны последние '+rows.length+' наблюдений. Значения mid/bid/ask — вероятностные котировки рынка от 0 до 100%, а не десятичные коэффициенты Winamax. Они не используются для расчёта прогноза или EV.</div>';
 }catch(error){
  status(panel,error.status===403?"История рыночных котировок требует доступа PRO Live Tennis API.":error.status===404?"Для этого матча рынок не найден или котировки отсутствуют.":error.message||"Не удалось загрузить историю рыночных котировок.");
 }
}
function attach(card){
 if(loaded.has(card))return;
 const matchId=card.dataset.liveMatchId;
 if(!matchId||!/^[1-9]\d{0,14}$/.test(matchId))return;
 const details=card.querySelector(".match-details");if(!details)return;
 const panel=document.createElement("div");panel.className="market-history-panel model-result model-muted";panel.setAttribute("aria-live","polite");
 const playersText=card.querySelector(".match-players")?.textContent??"";
 const playerNames=playersText.split("—").map(value=>value.replace(/\s+/g," ").trim()).filter(Boolean);
 details.append(panel);loaded.add(card);load(panel,matchId,playerNames);
}
document.addEventListener("click",event=>{
 const card=event.target.closest(".match-card");
 if(card&&card.classList.contains("expanded"))attach(card);
});
document.addEventListener("keydown",event=>{
 if(event.key!=="Enter"&&event.key!==" ")return;
 const card=event.target.closest?.(".match-card");
 if(card)setTimeout(()=>{if(card.classList.contains("expanded"))attach(card);},0);
});
