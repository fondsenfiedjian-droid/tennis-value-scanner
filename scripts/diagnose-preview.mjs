import { chromium } from "playwright";

const base = process.env.PREVIEW_URL || "https://deploy-preview-180--fascinating-paprenjak-1aa9b3.netlify.app";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const report = { url: base, pageErrors: [], failedRequests: [], api: {}, ui: {} };
page.on("pageerror", error => report.pageErrors.push(error.message));
page.on("requestfailed", request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
page.on("response", async response => {
  const url = response.url();
  if (!url.includes("tennis-value-api")) return;
  const path = new URL(url).pathname;
  if (!["/health", "/matches", "/odds", "/odds-api/quotes", "/players/search", "/predict"].includes(path)) return;
  let body = null;
  try { body = await response.json(); } catch {}
  report.api[path] = {
    status: response.status(),
    count: body?.count ?? body?.items?.length ?? body?.matches?.length ?? body?.players?.length ?? null,
    error: body?.error || body?.providerMessage || null,
    configured: path === "/health" ? {
      liveTennisApi: body?.liveTennisApiConfigured,
      apify: body?.apifyTokenConfigured,
      oddsApi: body?.oddsApiConfigured
    } : undefined
  };
});
try {
  const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  report.ui.pageStatus = response?.status();
  report.ui.title = await page.title();
  report.ui.matchesText = await page.locator("#matchList").innerText({ timeout: 15000 }).catch(e => "UNAVAILABLE: " + e.message);
  report.ui.matchCards = await page.locator("#matchList .match-card").count();

  await page.locator("#navCompare").click({ timeout: 10000 });
  await page.waitForFunction(() => {
    const node = document.querySelector("#compareView");
    return node && getComputedStyle(node).display !== "none" && node.getBoundingClientRect().height > 0;
  }, { timeout: 10000 });
  report.ui.compareViewOpened = true;

  for (const [side, query, expected] of [["A", "Novak", "Novak Djokovic"], ["B", "Carlos Alcaraz", "Carlos Alcaraz"]]) {
    const input = page.locator("#compareName" + side);
    await input.fill(query);
    await page.waitForFunction(s => {
      const node = document.querySelector("#compareSuggestions" + s);
      return node && !node.hidden && node.textContent.trim().length > 0 && node.textContent !== "Поиск…";
    }, side, { timeout: 20000 });
    const suggestion = page.locator("#compareSuggestions" + side + " button").filter({ hasText: expected }).first();
    await suggestion.click({ timeout: 10000 });
  }
  await page.locator("#compareRun").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#compareStatus")?.textContent || "";
    return status.includes("успешно") || status.includes("не выполнено");
  }, { timeout: 30000 });
  report.ui.compareStatus = await page.locator("#compareStatus").innerText();
  report.ui.compareResultVisible = await page.locator("#compareResult").isVisible();
} catch (error) {
  report.ui.fatal = error.message;
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.ui.fatal || report.ui.compareViewOpened !== true || !report.ui.compareStatus?.includes("успешно")) process.exit(1);
