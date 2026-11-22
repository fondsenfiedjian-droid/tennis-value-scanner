#!/usr/bin/env node
// Bounded BASIC endpoint verification. Five read-only requests maximum:
// /usage, /history/coverage, one completed-match page + one tape, one archive page.
// Only aggregate metadata and field names are written; never rows, names, API key, or raw payloads.
const BASE = "https://api.livetennisapi.com/api/public/v1";
const key = process.env.LIVE_TENNIS_API_KEY;
if (!key) {
  console.error("BLOCKED: LIVE_TENNIS_API_KEY is missing; no API request made.");
  process.exit(2);
}
const headers = { "X-API-Key": key, "Accept": "application/json", "User-Agent": "TennisValueScanner-Aggregator1-Research/1.1" };
const report = {
  generated_at: new Date().toISOString(),
  source: "Live Tennis API",
  mode: "bounded BASIC access verification; aggregate-only",
  request_budget: 5,
  requests_made: 0,
  account: null,
  endpoints: {}
};
async function get(path) {
  report.requests_made++;
  const response = await fetch(BASE + path, { headers, signal: AbortSignal.timeout(20000) });
  const raw = await response.text();
  let json;
  try { json = JSON.parse(raw); } catch { return { ok:false, status:response.status, error:"non_json" }; }
  return { ok:response.ok, status:response.status, json };
}
function keys(value) { return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : []; }
function rows(json) { return Array.isArray(json?.data) ? json.data : Array.isArray(json?.matches) ? json.matches : []; }
try {
  const usage = await get("/usage");
  if (!usage.ok) throw new Error("GET /usage HTTP " + usage.status);
  const u = usage.json.data || usage.json.usage || usage.json;
  const limits = u.limits || {}, today = u.today || {};
  report.account = {
    tier: u.tier || u.base_tier || null,
    base_tier: u.base_tier || null,
    subscription_state: u.subscription_state || null,
    per_minute_limit: limits.per_minute ?? u.limit_per_minute ?? u.per_minute_limit ?? null,
    daily_limit: limits.per_day ?? u.limit_per_day ?? u.daily_limit ?? null,
    requests_today: today.calls ?? u.requests_today ?? null,
    requests_remaining_today: today.remaining_day ?? u.remaining_day ?? null
  };

  const coverage = await get("/history/coverage");
  report.endpoints.history_coverage = coverage.ok
    ? { http_status:coverage.status, as_of:coverage.json.as_of || coverage.json.data?.as_of || null,
        bucket_count:Object.keys(coverage.json.buckets || coverage.json.data?.buckets || {}).length,
        totals_fields:keys(coverage.json.totals || coverage.json.data?.totals) }
    : { http_status:coverage.status, error:coverage.json?.error || coverage.error || "request_failed" };

  const recent = await get("/history/matches?limit=1");
  const recentRows = rows(recent.json);
  const recentItem = recentRows[0];
  report.endpoints.completed_matches = recent.ok
    ? { http_status:recent.status, returned:recentRows.length,
        meta:recent.json.meta ? { count:recent.json.meta.count ?? null, has_more:recent.json.meta.has_more ?? null } : null,
        sample_field_names:keys(recentItem), tape_summary_fields:keys(recentItem?.tape),
        tape_coverage:recentItem?.tape?.coverage ?? null, tape_point_source:recentItem?.tape?.point_source ?? null }
    : { http_status:recent.status, error:recent.json?.error || recent.error || "request_failed" };

  if (recent.ok && recentItem?.id != null) {
    const tape = await get("/history/matches/" + encodeURIComponent(recentItem.id));
    const tapeRows = Array.isArray(tape.json?.tape) ? tape.json.tape : Array.isArray(tape.json?.data?.tape) ? tape.json.data.tape : [];
    const meta = tape.json?.meta || tape.json?.data?.meta || {};
    const modelRows = tapeRows.filter(r => r.win_probability_p1 != null).length;
    report.endpoints.point_by_point = tape.ok
      ? { http_status:tape.status, rows:tapeRows.length, tape_field_names:keys(tapeRows[0]),
          meta_field_names:keys(meta), coverage:meta.coverage ?? null,
          point_source:meta.point_source ?? null, rows_with_timestamps:tapeRows.filter(r=>r.timestamp!=null).length,
          rows_with_model_probability:modelRows }
      : { http_status:tape.status, error:tape.json?.error || tape.error || "request_failed" };
  } else {
    report.endpoints.point_by_point = { skipped:true, reason:"No completed-match id returned by one-row listing" };
  }

  const archive = await get("/history/archive/matches?tour=atp&limit=1");
  const archiveRows = rows(archive.json);
  const archiveItem = archiveRows[0];
  report.endpoints.results_archive = archive.ok
    ? { http_status:archive.status, returned:archiveRows.length,
        meta:archive.json.meta ? { count:archive.json.meta.count ?? null, has_more:archive.json.meta.has_more ?? null } : null,
        sample_field_names:keys(archiveItem) }
    : { http_status:archive.status, error:archive.json?.error || archive.error || "request_failed" };

  if (archive.ok && archiveItem?.id != null) {
    const detail = await get("/history/archive/matches/" + encodeURIComponent(archiveItem.id));
    const record = detail.json?.data || detail.json;
    report.endpoints.archive_match_detail = detail.ok
      ? { http_status:detail.status, field_names:keys(record), stats_present:record?.stats != null,
          stats_field_names:keys(record?.stats) }
      : { http_status:detail.status, error:detail.json?.error || detail.error || "request_failed" };
  } else {
    report.endpoints.archive_match_detail = { skipped:true, reason:"No archive id returned by one-row listing" };
  }

  report.result = Object.values(report.endpoints).every(x => x.http_status === 200 || x.skipped)
    ? "bounded_checks_completed" : "one_or_more_endpoint_checks_failed";
  await (await import("node:fs/promises")).writeFile("livetennis-basic-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== "bounded_checks_completed") process.exitCode = 1;
} catch (error) {
  report.fatal_error = error.message;
  await (await import("node:fs/promises")).writeFile("livetennis-basic-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
