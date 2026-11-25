(() => {
  const productionHost = "fascinating-paprenjak-1aa9b3.netlify.app";
  const isPreview = location.hostname !== productionHost &&
    (location.hostname.endsWith(".netlify.app") || location.hostname.startsWith("deploy-preview-"));
  const API = isPreview
    ? "https://tennis-value-api-preview.fonds-enfiedjian.workers.dev"
    : "https://tennis-value-api.fonds-enfiedjian.workers.dev";
  const $ = id => document.getElementById(id);
  const openCompare = event => {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const app = document.querySelector(".app"), stats = $("statsView"), view = $("compareView");
    if (!app || !stats || !view) return;
    app.style.display = "none";
    stats.style.display = "none";
    view.style.display = "block";
    document.querySelectorAll(".nav button").forEach(button => button.classList.remove("active"));
    $("navCompare")?.classList.add("active");
  };
  const openMain = event => {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const app = document.querySelector(".app"), stats = $("statsView"), view = $("compareView");
    if (app) app.style.display = "block";
    if (stats) stats.style.display = "none";
    if (view) view.style.display = "none";
    $("navCompare")?.classList.remove("active");
    $("navHome")?.classList.add("active");
  };
  $("navCompare")?.addEventListener("click", openCompare, true);
  $("compareBack")?.addEventListener("click", openMain, true);
  if (!$("compareRun")) return;
  for (const side of ["A", "B"]) {
    const input = $("compareName" + side), idInput = $("compareId" + side), list = $("compareSuggestions" + side);
    let timer, sequence = 0;
    input.addEventListener("input", () => {
      idInput.value = ""; clearTimeout(timer);
      const q = input.value.trim(), seq = ++sequence;
      if (q.length < 2) { list.hidden = true; list.replaceChildren(); return; }
      list.hidden = false; list.textContent = "Поиск…";
      timer = setTimeout(async () => {
        try {
          const res = await fetch(API + "/players/search?search=" + encodeURIComponent(q) + "&limit=8");
          const payload = await res.json();
          if (seq !== sequence) return;
          if (!res.ok) throw new Error(payload.error || "HTTP " + res.status);
          list.replaceChildren();
          const players = (payload.players || []).filter(p => p && p.is_doubles_team !== true && Number.isSafeInteger(Number(p.id)) && Number(p.id) > 0 && p.name);
          if (!players.length) { list.textContent = "Игроки не найдены"; return; }
          for (const player of players) {
            const button = document.createElement("button"); button.type = "button";
            const name = document.createElement("span"); name.textContent = player.name; button.append(name);
            const meta = document.createElement("small"); meta.textContent = [player.tour, player.country, player.ranking ? "№" + player.ranking : ""].filter(Boolean).join(" · "); button.append(meta);
            button.addEventListener("click", () => { input.value = player.name; idInput.value = String(player.id); list.hidden = true; $("compareStatus").textContent = "Выбран игрок: " + player.name; });
            list.append(button);
          }
        } catch (error) { if (seq === sequence) list.textContent = "Ошибка поиска: " + error.message; }
      }, 350);
    });
  }
  $("compareRun").addEventListener("click", async () => {
    const button = $("compareRun"), status = $("compareStatus"), output = $("compareResult");
    const nameA = $("compareNameA").value.trim(), nameB = $("compareNameB").value.trim();
    const idA = Number($("compareIdA").value), idB = Number($("compareIdB").value);
    if (!nameA || !nameB || !Number.isSafeInteger(idA) || idA <= 0 || !Number.isSafeInteger(idB) || idB <= 0) { status.textContent = "Выбери обоих игроков из результатов поиска."; output.hidden = true; return; }
    if (idA === idB) { status.textContent = "Выбраны одинаковые игроки."; output.hidden = true; return; }
    button.disabled = true; button.textContent = "РАСЧЁТ…"; status.textContent = "Получаю профили и рассчитываю Elo…"; output.hidden = true;
    try {
      const res = await fetch(API + "/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerIdA: idA, playerIdB: idB, playerA: nameA, playerB: nameB, surface: $("compareSurface").value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
      const a = Number(data.probabilityA), b = Number(data.probabilityB), ra = Number(data.ratingA), rb = Number(data.ratingB);
      if (![a,b,ra,rb].every(Number.isFinite) || Math.abs(a+b-100) > .05) throw new Error("API вернул некорректные рейтинги или вероятности.");
      const card = (name, rating, probability, type) => '<div class="compare-result"><strong>'+escapeHtml(name)+'</strong><span class="compare-rating">'+rating.toFixed(0)+'</span><small>Elo · '+escapeHtml(type || "общий")+'</small><span class="compare-prob">'+probability.toFixed(1)+'%</span><small>Вероятность победы</small></div>';
      const safe = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
      output.innerHTML = '<div class="compare-results">'+card(safe(data.playerA || nameA),ra,a,data.ratingTypeA)+card(safe(data.playerB || nameB),rb,b,data.ratingTypeB)+'</div><p class="muted">Источник: '+safe(data.source || "Live Tennis API")+'</p>';
      output.hidden = false; status.textContent = "Сравнение рассчитано успешно.";
    } catch (error) { status.textContent = "Сравнение не выполнено: " + error.message; output.hidden = true; }
    finally { button.disabled = false; button.textContent = "СРАВНИТЬ ИГРОКОВ"; }
  });
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
})();
