(function(){
"use strict";
const host=location.hostname;
const isPreview=host.startsWith("deploy-preview-")||host.includes("--tennis-value-scanner-developer.netlify.app")||location.pathname.startsWith("/developer/");
const edition=window.TVS_EDITION||(isPreview?{channel:"developer",version:"2.1.0-dev.2",modelVersion:"general-elo-v2"}:{channel:"production",version:"2.0.0",modelVersion:"general-elo-v2"});
const isDeveloper=edition.channel==="developer";
document.documentElement.dataset.edition=edition.channel;
document.body.dataset.edition=edition.channel;
const badge=document.getElementById("editionVersion");
if(badge)badge.textContent=(isDeveloper?"DEVELOPER":"PRODUCTION")+" · v"+edition.version;
const labButton=document.getElementById("quickLab");
if(!isDeveloper){if(labButton){labButton.hidden=true;labButton.setAttribute("aria-hidden","true");labButton.onclick=null;}document.getElementById("labView")?.remove();window.showLab=()=>{};return;}
if(!labButton)return;
const KEY="tvs-lab-models-v1";
const baseline={id:"general-elo-v2",name:"ELO baseline",k:32,surfaceWeight:0.3,formWeight:80,h2hWeight:60,kind:"baseline",createdAt:"built-in"};
const readModels=()=>{try{const saved=JSON.parse(localStorage.getItem(KEY)||"null");return Array.isArray(saved)&&saved.some(x=>x&&x.id===baseline.id)?saved:[baseline];}catch(_){return [baseline];}};
const saveModels=models=>localStorage.setItem(KEY,JSON.stringify(models));
const existingShowLab=labButton.onclick;
function showLab(){
if(typeof existingShowLab==="function")existingShowLab();
const view=document.getElementById("labView");if(!view)return;
view.style.display="block";
view.innerHTML='<header class="screen-header"><div><div class="brand">ЛАБОРАТОРИЯ МОДЕЛЕЙ</div><div class="sub">DEVELOPER EDITION · экспериментальные конфигурации</div></div></header>'+
'<section class="more-screen-card"><h2>Профили прогнозных систем</h2><p>Создавайте и сохраняйте отдельные конфигурации. Они не заменяют рабочую модель и не меняют прогнозы на главном экране.</p><div id="labModelList" class="archive-list"></div></section>'+
'<section class="more-screen-card" style="margin-top:12px"><h2>Новая экспериментальная модель</h2>'+
'<div class="field"><label for="labModelName">Название варианта</label><input id="labModelName" type="text" maxlength="48" value="ELO experiment"></div>'+
'<div class="field"><label for="labK">K-фактор: <output id="labKValue">32</output></label><input id="labK" type="range" min="8" max="100" step="1" value="32"></div>'+
'<div class="field"><label for="labSurface">Вес покрытия: <output id="labSurfaceValue">0.30</output></label><input id="labSurface" type="range" min="0" max="1" step="0.05" value="0.3"></div>'+
'<div class="field"><label for="labForm">Вес формы: <output id="labFormValue">80</output></label><input id="labForm" type="range" min="0" max="200" step="5" value="80"></div>'+
'<div class="field"><label for="labH2h">Вес H2H: <output id="labH2hValue">60</output></label><input id="labH2h" type="range" min="0" max="150" step="5" value="60"></div>'+
'<div class="actions"><button type="button" id="labReset">Сбросить</button><button type="button" class="primary" id="labSave">Сохранить вариант</button></div>'+
'<p class="archive-meta">Параметры сохраняются только в Developer Edition. Исторический runner — отдельная исследовательская Elo-система; он не подменяет расчёт live-прогнозов.</p></section>'+
'<section class="more-screen-card" style="margin-top:12px"><h2>Историческое моделирование</h2><p>Загрузи CSV с историей матчей. Файл обрабатывается локально в Developer Edition и не отправляется на сервер.</p><div class="field"><label for="labDatasetFile">Историческая база CSV</label><input id="labDatasetFile" type="file" accept=".csv,text/csv"></div><div id="labDatasetMeta" class="archive-meta">Ожидаю файл с датой, ID игроков, покрытием и победителем.</div><div class="actions"><button type="button" class="primary" id="labRunButton" disabled>Запустить сравнение моделей</button></div><div id="labProgress" class="archive-meta" role="status">Прогон выполняется по хронологии; матчи одного календарного дня не обновляют рейтинги до завершения прогнозов этого дня.</div><div id="labResults" class="research-table-wrap"></div></section>'+
'<div class="stats-actions"><button type="button" id="labBack">← На главную</button></div>';
const bind=(id,out,format=v=>v)=>{const input=document.getElementById(id),target=document.getElementById(out);input.addEventListener("input",()=>target.textContent=format(input.value));};
bind("labK","labKValue");bind("labSurface","labSurfaceValue",v=>Number(v).toFixed(2));bind("labForm","labFormValue");bind("labH2h","labH2hValue");
const reset=()=>{document.getElementById("labModelName").value="ELO experiment";for(const [id,v] of [["labK",32],["labSurface",0.3],["labForm",80],["labH2h",60]]){document.getElementById(id).value=v;document.getElementById(id).dispatchEvent(new Event("input"));}};
document.getElementById("labReset").onclick=reset;
document.getElementById("labSave").onclick=()=>{
const name=document.getElementById("labModelName").value.trim();if(!name){alert("Укажи название модели.");return;}
const models=readModels();models.push({id:"experiment-"+Date.now().toString(36),name,k:Number(document.getElementById("labK").value),surfaceWeight:Number(document.getElementById("labSurface").value),formWeight:Number(document.getElementById("labForm").value),h2hWeight:Number(document.getElementById("labH2h").value),kind:"experiment",createdAt:new Date().toISOString()});
try{saveModels(models);renderModels();document.getElementById("labRunStatus").textContent="Вариант сохранён. Для оценки требуется исторический прогон.";}catch(error){alert("Не удалось сохранить профиль: "+String(error.message||error));}
};
document.getElementById("labBack").onclick=()=>{const home=document.getElementById("navHome");if(home)home.click();else{view.style.display="none";document.querySelector(".app").style.display="block";}};
function renderModels(){const list=document.getElementById("labModelList");list.innerHTML="";readModels().forEach(model=>{
const card=document.createElement("article");card.className="archive-item";const title=document.createElement("b");title.textContent=model.name+(model.kind==="baseline"?" · базовая":" · эксперимент");
const meta=document.createElement("div");meta.className="archive-meta";meta.textContent="K="+model.k+" · покрытие="+Number(model.surfaceWeight).toFixed(2)+" · форма="+model.formWeight+" · H2H="+model.h2hWeight;card.append(title,meta);
if(model.kind==="experiment"){const remove=document.createElement("button");remove.type="button";remove.className="more-screen-action";remove.textContent="Удалить вариант";remove.onclick=()=>{saveModels(readModels().filter(x=>x.id!==model.id));renderModels();};card.appendChild(remove);}list.appendChild(card);
});}
renderModels();
if(window.TVSModelLab?.mount)window.TVSModelLab.mount(view,readModels);
else window.addEventListener("tvs-model-lab-ready",()=>{if(view.style.display==="block"&&window.TVSModelLab?.mount)window.TVSModelLab.mount(view,readModels);},{once:true});
}
labButton.onclick=showLab;labButton.hidden=false;labButton.removeAttribute("aria-hidden");
})();