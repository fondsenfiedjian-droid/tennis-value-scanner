#!/usr/bin/env node
// Bounded, aggregate-only verification of the user's existing Live Tennis API Basic access.
// Raw provider responses are kept in memory only and are never written to the repository or artifact.
const BASE = "https://api.livetennisapi.com/api/public/v1";
const key = process.env.LIVE_TENNIS_API_KEY;
if (!key) {
  console.log("SKIP: GitHub Actions secret LIVE_TENNIS_API_KEY is not configured. No API request was made.");
  process.exit(0);
}
const headers = { "X-API-Key": key, "Accept": "application/json", "User-Agent": "TennisValueScanner-Aggregator1-Research/1.0" };
async function get(path) {
  const response = await fetch(BASE + path, { headers, signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  let json;
  try { json = JSON.parse(body); } catch { throw new Error(path + " returned non-JSON HTTP " + response.status); }
  if (!response.ok) throw new Error(path + " HTTP " + response.status + ": " + (json.error || json.message || "request failed"));
  return json;
}
const pickRows = value => Array.isArray(value?.data) ? value.data : Array.isArray(value?.matches) ? value.matches : Array.isArray(value) ? value : [];
const present = (obj, keys) => keys.filter(k => obj && obj[k] !== null && obj[k] !== undefined);
const report = { generated_at: new Date().toISOString(), source: "Live Tennis API", mode: "bounded verification; aggregate metadata only", requests: 0 };
async function counted(path) { report.requests++; return get(path); }

try {
  const usage = await counted("/usage");
  const u = usage.data || usage.usage || usage;
  report.account = {
    tier: u.tier || u.base_tier || null,
    subscription_state: u.subscription_state || null,
    paid_until: u.paid_until || u.current_period_end || null,
    requests_today: u.requests_today ?? u.calls_today ?? null,
    requests_remaining_today: u.remaining_day ?? u.requests_remaining_today ?? null,
    daily_limit: u.limit_per_day ?? u.daily_limit ?? null,
    per_minute_limit: u.limit_per_minute ?? u.per_minute_limit ?? null
  };

  const coverage = await counted("/history/coverage");
  const c = coverage.data || coverage;
  report.coverage = {
    as_of: c.as_of || c.built_at || null,
    totals: c.totals ? {
      matches: c.totals.matches ?? c.totals.total_matches ?? null,
      with_tape: c.totals.with_tape ?? c.totals.tape_matches ?? null,
      points_complete: c.totals.points_complete ?? c.totals.point_complete ?? null
    } : null,
    buckets: c.buckets && typeof c.buckets === "object" ? Object.keys(c.buckets).length : null
  };

  const archive = await counted("/history/archive/matches?limit=1&offset=0");
  const archiveRows = pickRows(archive);
  const a = archiveRows[0] || {};
  report.archive_1968_2022 = {
    accessible: true,
    sample_rows_returned: archiveRows.length,
    sample_field_names: Object.keys(a).sort(),
    serve_stat_fields_present: present(a, ["aces","double_faults","first_serves_in","first_serve_points_won","second_serve_points_won","service_games","break_points_saved","break_points_faced"])
  };

  const recent = await counted("/history/matches?limit=1&offset=0");
  const recentRows = pickRows(recent);
  const m = recentRows[0] || {};
  const matchId = m.id ?? m.match_id ?? null;
  report.point_by_point_2023_onward = {
    listing_accessible: true,
    sample_rows_returned: recentRows.length,
    tape_coverage_in_listing: m.tape?.coverage || m.coverage || null,
    tape_points_in_listing: m.tape?.points ?? m.tape?.rows ?? null,
    tape_request: "not attempted"
  };
  if (matchId !== null) {
    const tape = await counted("/history/matches/" + encodeURIComponent(String(matchId)));
    const t = tape.data || tape;
    const tapeRows = Array.isArray(t.tape) ? t.tape : [];
    const meta = t.meta || {};
    report.point_by_point_2023_onward.tape_request = "success";
    report.point_by_point_2023_onward.tape_rows = tapeRows.length;
    report.point_by_point_2023_onward.tape_coverage = meta.coverage || null;
    report.point_by_point_2023_onward.point_source = meta.point_source || null;
    report.point_by_point_2023_onward.rows_with_timestamps = tapeRows.filter(x => x.timestamp).length;
    report.point_by_point_2023_onward.rows_with_model_probability = tapeRows.filter(x => x.win_probability_p1 !== null && x.win_probability_p1 !== undefined).length;
  }
  await (await import("node:fs/promises")).writeFile("livetennis-basic-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Live Tennis Basic verification failed:", error.message);
  process.exitCode = 1;
}
