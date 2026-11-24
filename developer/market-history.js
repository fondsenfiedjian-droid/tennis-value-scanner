const API=location.hostname.startsWith("deploy-preview-")
  ?"https://tennis-value-api-preview.fonds-enfiedjian.workers.dev"
  :"https://tennis-value-api.fonds-enfiedjian.workers.dev";
const loaded=new WeakSet();
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const listFrom=payload=>{
  if(Array.isArray(payload))return payload;
  if(!payload||typeof payload!=="object")return [];
  for(const key of ["data","markets","prices","items","results","history"])if(Array.isArray(payload[key]))return payload[key];
  return [];
};
const historyRows=payload=>{
  const rows=listFrom(payload);
  if(!rows.length)return [];
  const nested=rows.flatMap(group=>{
    const prices=group?.prices??group?.history??group?.data;
    if(!Array.isArray(prices))return [group];
    return prices.map(price=>({
      ...price,
      market_name:price?.market_name??price?.marketName??group?.name??group?.market_name??group?.type,
      outcome:price?.outcome??price?.selection??group?.outcome??group?.selection
    }));
  });
  return nested;
};
const marketId=item=>item?.id??item?.market_id??item?.marketId??item?.market?.id??null;
const label=item=>item?.name??item?.market_name??item?.marketName??item?.type??item?.market_type??"Рынок";
const dateOf=item=>item?.timestamp??item?.created_at??item?.createdAt??item?.updated_at??item?.date??item?.time??null;
const priceOf=item=>item?.odds??item?.price??item?.odds_decimal??item?.oddsDecimal??item?.decimal_odds??item?.value??null;
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
async function load(panel,matchId){
 status(panel,"Загружаем историю рынка…");
 try{
  const marketPayload=await get("/markets?match_id="+encodeURIComponent(matchId));
  const markets=listFrom(marketPayload);
  if(!markets.length){status(panel,"История рынка пока не предоставлена API для этого матча.");return;}
  const historyPayload=await get("/markets/"+encodeURIComponent(matchId)+"/prices?limit=100");
  const rows=historyRows(historyPayload).slice().sort((a,b)=>Date.parse(dateOf(a)||0)-Date.parse(dateOf(b)||0)).slice(-24);
  if(!rows.length){
   status(panel,"Рынки найдены, но история изменения коэффициентов пока пуста.");
   return;
  }
  const entries=rows.map(row=>{
   const price=priceOf(row),date=dateOf(row);
   const formattedDate=date&&Number.isFinite(Date.parse(date))?new Date(date).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"Время не указано";
   const outcome=row?.outcome??row?.selection??row?.runner_name??row?.name??"";
   return '<div class="archive-meta">'+esc(formattedDate)+(outcome?' · '+esc(outcome):'')+' · <b>'+esc(price===null?"—":Number.isFinite(Number(price))?Number(price).toFixed(2):price)+'</b></div>';
  }).join("");
  const marketNames=markets.map(label).filter(Boolean).slice(0,3).join(" · ");
  panel.innerHTML='<div class="section-head" style="margin:0 0 8px"><h2>История коэффициентов</h2><span class="muted">Live Tennis API</span></div>'+
   (marketNames?'<div class="archive-meta">'+esc(marketNames)+'</div>':"")+entries+
   '<div class="archive-meta">Показаны последние '+rows.length+' наблюдений. История не меняет прогноз или EV автоматически.</div>';
 }catch(error){
  status(panel,error.status===403?"История коэффициентов требует доступа PRO Live Tennis API.":error.status===404?"История для этого матча или рынка не найдена.":error.message||"Не удалось загрузить историю коэффициентов.");
 }
}
function attach(card){
 if(loaded.has(card))return;
 const matchId=card.dataset.liveMatchId;
 if(!matchId||!/^[1-9]\d{0,14}$/.test(matchId))return;
 const details=card.querySelector(".match-details");if(!details)return;
 const panel=document.createElement("div");panel.className="market-history-panel model-result model-muted";panel.setAttribute("aria-live","polite");
 details.append(panel);loaded.add(card);load(panel,matchId);
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
