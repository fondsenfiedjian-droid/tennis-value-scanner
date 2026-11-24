import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../developer/market-history.js", import.meta.url), "utf8");

async function renderHistory(payload, responseOptions = {}) {
  const listeners = {};
  const panel = { innerHTML: "", className: "", setAttribute() {} };
  const details = { append(node) { assert.equal(node, panel); } };
  const card = {
    dataset: { liveMatchId: "12345" },
    classList: { contains(value) { return value === "expanded"; } },
    querySelector(selector) {
      if (selector === ".match-details") return details;
      if (selector === ".match-players") return { textContent: "Player One — Player Two" };
      return null;
    }
  };
  const requests = [];
  const document = {
    addEventListener(name, callback) { listeners[name] = callback; },
    createElement() { return panel; }
  };
  const context = {
    location: { hostname: "deploy-preview-172--tennis-value-scanner-developer.netlify.app" },
    document,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
  vm.runInNewContext(source, context, { filename: "developer/market-history.js" });
  listeners.click({
    target: { closest(selector) { return selector === ".match-card" ? card : null; } }
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return { panel, requests };
}

test("Developer market history reads the documented top-level prices array and labels probabilities, not Winamax odds", async () => {
  const { panel, requests } = await renderHistory({
    id: 12345,
    prices: [
      { side: 1, mid: 0.52, bid: 0.51, ask: 0.53, synthetic: true, price_source: "prediction_market", timestamp: "2026-11-24T10:00:00Z" }
    ]
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/matches\/12345\/prices\?limit=100$/);
  assert.match(panel.innerHTML, /История рыночных котировок/);
  assert.match(panel.innerHTML, /52\.0%/);
  assert.match(panel.innerHTML, /Player One/);
  assert.match(panel.innerHTML, /bid\/ask оценочные/);
  assert.match(panel.innerHTML, /prediction_market/);
  assert.match(panel.innerHTML, /не десятичные коэффициенты Winamax/);
});

test("Developer market history also reads prices nested under data", async () => {
  const { panel } = await renderHistory({
    data: {
      id: 12345,
      prices: [
        { side: 2, mid: 0.67, bid: 0.66, ask: 0.68, synthetic: false, timestamp: "2026-11-24T10:01:00Z" }
      ]
    }
  });
  assert.match(panel.innerHTML, /67\.0%/);
  assert.match(panel.innerHTML, /Сторона 2 · Player Two/);
  assert.match(panel.innerHTML, /реальный стакан/);
});


test("Developer market history explains merged match identifiers", async () => {
  const { panel } = await renderHistory({ error: "Merged match" }, { status: 410 });
  assert.match(panel.innerHTML, /объединил этот идентификатор матча/);
});

test("Developer market history explains rate limits and Retry-After", async () => {
  const { panel } = await renderHistory({ error: "Rate limit exceeded" }, {
    status: 429,
    headers: { "Retry-After": "30" }
  });
  assert.match(panel.innerHTML, /Достигнут лимит запросов/);
  assert.match(panel.innerHTML, /через 30 сек/);
});
