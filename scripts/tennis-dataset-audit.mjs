#!/usr/bin/env node
/**
 * Read-only audit for newly downloaded tennis CSV / CSV.GZ datasets.
 * No dependencies; never modifies input files.
 *
 * Example:
 * node scripts/tennis-dataset-audit.mjs \
 *   ~/tennis-data/rankings/atp_rankings_00s.csv \
 *   ~/tennis-data/livetennis/raw/matches.csv.gz \
 *   ~/tennis-data/livetennis/raw/players.csv.gz
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(value); value = ''; }
    else value += ch;
  }
  out.push(value);
  return out;
}

function dateValue(value) {
  const s = String(value ?? '').trim();
  if (/^\d{8}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso.slice(1).join('') : null;
}

async function audit(file) {
  const stat = fs.statSync(file);
  const input = fs.createReadStream(file);
  const stream = file.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  let rows = 0;
  let malformedRows = 0;
  let missingIdRows = 0;
  let minDate = null;
  let maxDate = null;
  let idColumn = -1;
  let dateColumn = -1;
  let tourColumn = -1;
  let surfaceColumn = -1;
  const tours = new Map();
  const surfaces = new Map();
  let firstData = null;

  try {
    for await (const line of rl) {
      if (!header) {
        header = parseCsvLine(line.replace(/^\uFEFF/, '')).map(x => x.trim());
        const lower = header.map(x => x.toLowerCase());
        idColumn = lower.findIndex(x => ['player_id', 'player1_id', 'winner_id', 'id'].includes(x));
        dateColumn = lower.findIndex(x => ['ranking_date', 'tourney_date', 'date', 'scheduled_at'].includes(x));
        tourColumn = lower.findIndex(x => ['tour', 'tour_code', 'circuit'].includes(x));
        surfaceColumn = lower.findIndex(x => x === 'surface');
        continue;
      }
      if (!line.trim()) continue;
      const fields = parseCsvLine(line);
      rows++;
      if (fields.length !== header.length) malformedRows++;
      if (!firstData) firstData = fields.slice(0, Math.min(fields.length, 8));
      if (idColumn >= 0 && !String(fields[idColumn] ?? '').trim()) missingIdRows++;
      if (dateColumn >= 0) {
        const d = dateValue(fields[dateColumn]);
        if (d) { if (!minDate || d < minDate) minDate = d; if (!maxDate || d > maxDate) maxDate = d; }
      }
      if (tourColumn >= 0) {
        const v = String(fields[tourColumn] ?? '').trim() || '(blank)';
        tours.set(v, (tours.get(v) || 0) + 1);
      }
      if (surfaceColumn >= 0) {
        const v = String(fields[surfaceColumn] ?? '').trim() || '(blank)';
        surfaces.set(v, (surfaces.get(v) || 0) + 1);
      }
    }
  } catch (error) {
    throw new Error(`Failed reading ${file}: ${error.message}`);
  }
  if (!header) throw new Error(`Empty file: ${file}`);
  return {
    file: path.resolve(file),
    bytes: stat.size,
    compressed: file.endsWith('.gz'),
    rows,
    columns: header.length,
    header,
    dateRange: minDate ? { from: minDate, to: maxDate } : null,
    likelyIdColumn: idColumn >= 0 ? header[idColumn] : null,
    rowsMissingLikelyId: idColumn >= 0 ? missingIdRows : null,
    malformedRows,
    tours: Object.fromEntries(tours),
    surfaces: Object.fromEntries(surfaces),
    firstDataSample: firstData
  };
}

const files = process.argv.slice(2).filter(x => !x.startsWith('--'));
if (!files.length) {
  console.error('Usage: node scripts/tennis-dataset-audit.mjs <file.csv|file.csv.gz> [...]');
  process.exit(2);
}

const results = [];
let failed = false;
for (const file of files) {
  try { results.push(await audit(file)); }
  catch (error) { failed = true; results.push({ file, error: error.message }); }
}
console.log(JSON.stringify({
  schemaVersion: 1,
  readOnly: true,
  auditedAt: new Date().toISOString(),
  files: results
}, null, 2));
if (failed || results.some(x => x.malformedRows > 0)) process.exitCode = 1;
