import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root = process.env.ACES_EXPORT_DIR;
const apiKey = process.env.ACESAPI_API_KEY;
const maxCalls = 220;
if (!root || !apiKey) throw new Error('Output path or repository secret missing');
await mkdir(root, {recursive: true, mode: 0o700});
const report = {source: 'AcesAPI', years: [2023, 2024], maxCredits: maxCalls * 2, calls: 0, groups: []};
for (const season of report.years) {
  for (const league of ['tennis', 'wta']) {
    report.groups.push({season, league, offset: 0, rows: 0, pages: 0, status: 'pending'});
  }
}
let stop = false;
while (!stop) {
  const active = report.groups.filter(group => group.status === 'pending');
  if (!active.length) break;
  for (const group of active) {
    if (report.calls === maxCalls) {
      stop = true;
      break;
    }
    if (report.calls) await delay(1100);
    report.calls++;
    const {season, league, offset} = group;
    try {
      const response = await fetch('https://mcp.acesapi.com/v1/get_matches', {
        method: 'POST',
        headers: {'x-api-key': apiKey, 'content-type': 'application/json'},
        body: JSON.stringify({season, league, status: 'final', limit: 100, offset}),
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        group.status = 'HTTP ' + response.status;
        stop = true;
        break;
      }
      const raw = await response.text();
      const page = JSON.parse(raw).data;
      if (!Array.isArray(page?.matches)) throw new Error('Invalid page');
      const next = page.next_offset;
      if (next != null && (!Number.isSafeInteger(next) || next <= offset)) throw new Error('Invalid pagination');
      await writeFile(join(root, `${league}-${season}-offset-${offset}.json`), raw, {flag:'wx', mode:0o600});
      group.rows += page.matches.length;
      group.pages++;
      group.offset = next ?? null;
      if (next == null) group.status = 'complete';
    } catch {
      group.status = 'request or validation failed';
      stop = true;
      break;
    }
  }
}
for (const group of report.groups) if (group.status === 'pending') group.status = 'partial';
report.estimatedCredits = report.calls * 2;
await writeFile(join(root, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
