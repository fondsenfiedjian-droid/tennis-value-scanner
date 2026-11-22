#!/usr/bin/env node
// Quota-exempt, aggregate-only verification of the user's Live Tennis API subscription.
// This first pass calls /usage only; it does not consume historical-data trial calls.
// No API key or raw provider response is written to disk or the workflow artifact.
const BASE = "https://api.livetennisapi.com/api/public/v1";
const key = process.env.LIVE_TENNIS_API_KEY;
if (!key) {
  console.error("BLOCKED: GitHub Actions secret LIVE_TENNIS_API_KEY is not configured. No API request was made; add the key directly in repository Actions secrets, never in source code.");
  process.exit(2);
}
const headers = { "X-API-Key": key, "Accept": "application/json", "User-Agent": "TennisValueScanner-Aggregator1-Research/1.0" };
try {
  const response = await fetch(BASE + "/usage", { headers, signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  let json;
  try { json = JSON.parse(body); } catch { throw new Error("GET /usage returned non-JSON HTTP " + response.status); }
  if (!response.ok) throw new Error("GET /usage HTTP " + response.status + ": " + (json.error || json.message || "request failed"));
  const u = json.data || json.usage || json;
  const limits = u.limits || {};
  const today = u.today || {};
  const report = {
    generated_at: new Date().toISOString(),
    source: "Live Tennis API",
    mode: "quota-exempt subscription verification; /usage only",
    requests: 1,
    account: {
      tier: u.tier || u.base_tier || null,
      base_tier: u.base_tier || null,
      subscription_state: u.subscription_state || null,
      tier_expires_at: u.tier_expires_at || null,
      channel: u.channel || null,
      per_minute_limit: limits.per_minute ?? u.limit_per_minute ?? u.per_minute_limit ?? null,
      daily_limit: limits.per_day ?? u.limit_per_day ?? u.daily_limit ?? null,
      requests_today: today.calls ?? u.requests_today ?? u.calls_today ?? null,
      requests_remaining_today: today.remaining_day ?? u.remaining_day ?? u.requests_remaining_today ?? null
    },
    history_access: u.history || null
  };
  await (await import("node:fs/promises")).writeFile("livetennis-basic-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Live Tennis subscription verification failed:", error.message);
  process.exitCode = 1;
}
