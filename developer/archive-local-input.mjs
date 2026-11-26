import { openAsBlob, createReadStream, readdirSync, statSync, realpathSync } from "node:fs";
import { join, relative, resolve, extname, basename } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { archiveSchema, csvRecords, normalizeArchiveRecord } from "./archive-csv.mjs";
import { readZipEntry, zipDirectory } from "./archive-zip.mjs";
import { acesRecords } from "./archive-acesapi.mjs";
import { calendarDate, excelDate } from "./archive-canonical.mjs";

const get = (row, ...keys) => keys.map(k => row[k]).find(value => value != null && value !== "");
const slug = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const providers = new Set("atp wta sackmann sackmannextended tennismylife valuebetennis tennisdataapp tennisdatauk acesapi opentennisdata livetennisapi huggingfaceodds tennisvisuals matchchartingproject grandslampointbypoint citoapi kickserve".split(" "));
const q = value => '"' + value.replaceAll('"', '""') + '"';
const scopeOf = value => ({
  atp: "ATP", wta: "WTA", m: "ATP", f: "WTA", men: "ATP", women: "WTA", male: "ATP", female: "WTA",
  boys: "junior-men", girls: "junior-women", juniormen: "junior-men", juniorwomen: "junior-women"
})[slug(value)];

export function adaptLocalRow(input, path, mapping = {}) {
  const r = Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]));
  // Accept the Developer normalized shape as well as the local preparer's raw envelope.
  const rawText = get(r, "raw", "source_record", "sourcerecord", "raw_json", "record_json", "payload_json", "data_json", "normalized_json");
  const raw = typeof rawText === "string" && rawText.startsWith("{") ? JSON.parse(rawText) : rawText;
  if (raw && typeof raw === "object") {
    Object.assign(r, Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v])));
  }
  for (const [target, from] of Object.entries(mapping.columns ?? {})) r[target] = r[from.toLowerCase()];
  const envelope = raw && typeof raw === "object" ? { ...input, ...raw } : input;
  const sourcePath = String(get(r, "source_file", "source_path", "member", "source") ?? path);
  const pathParts = sourcePath.split(/[\\/]/);
  const sourceCandidate = slug(mapping.source ?? get(r, "provider", "source_name", "provider_name") ??
    pathParts.find(part => providers.has(slug(part))) ?? pathParts[0]);
  const source = providers.has(sourceCandidate) || mapping.source ? sourceCandidate : null;
  const scope = mapping.scope ?? ["scope", "tour_type_human", "gender", "genre", "circuit", "tour"].map(k => scopeOf(r[k])).find(Boolean) ??
    (/\bwta\b/i.test(sourcePath.replaceAll("_", " ")) ? "WTA" : /\batp\b/i.test(sourcePath.replaceAll("_", " ")) ? "ATP" : undefined);
  if (mapping.kind === "player_profile" || mapping.kind === "tournament_profile") {
    return { source, scope, kind: mapping.kind, profile: { id: get(r, "player_id", "tournament_id", "id"),
      name: get(r, "name", "player_name", "tournament") ?? [r.name_first, r.name_last].filter(Boolean).join(" "),
      birth: get(r, "birth", "birthdate", "birth_date", "dob"), metadata: r } };
  }
  if (mapping.kind === "supplement") {
    const code = get(r, "match_id", "matchid", "source_match_id");
    const number = get(r, "point_number", "pointnumber", "pt");
    const field = number == null ? "sourceSupplement" : "point:" + number;
    return { source, scope, kind: mapping.kind, externalId: code, fields: envelope.fields ?? { [field]: r } };
  }
  const winnerFirst = get(r, "winner_id") != null && get(r, "loser_id") != null;
  const a = get(r, "player1id", "player1_id", "player_a_id", "joueur1_id", "home_id", "player1", "winner_id");
  const b = get(r, "player2id", "player2_id", "player_b_id", "joueur2_id", "away_id", "player2", "loser_id");
  const player = (id, name, birth) => ({ id, name, birth });
  const sides = envelope.sides ?? [[player(a, get(r, "player1name", "player1_name", "joueur1", "home_name", "winner_name"), get(r,"player1_birth","winner_birth"))],
    [player(b, get(r, "player2name", "player2_name", "joueur2", "away_name", "loser_name"), get(r,"player2_birth","loser_birth"))]];
  const kind = slug(get(r, "datekind", "date_kind", "date_scope"));
  const date = get(r, "matchdate", "match_date", "start_time_utc", "starttimeutc") ??
    (!["tournamentdate", "tournamentstart"].includes(kind) ? r.date : undefined);
  const tournamentDate = get(r, "tournamentdate", "tournament_date", "tourney_date") ??
    (["tournamentdate", "tournamentstart"].includes(kind) ? r.date : undefined);
  const decode = value => value == null ? null : mapping.excelEpoch && /^\d+(?:\.\d+)?$/.test(String(value)) && !calendarDate(value)
    ? excelDate(Number(value), mapping.excelEpoch) ?? String(value)
    : String(value).split(/[T ]/)[0];
  const timestamp = String(r.date_timestamp ?? "");
  const matchDate = decode(date ?? (/^\d{10}$/.test(timestamp) ? new Date(Number(timestamp)*1000).toISOString() : null));
  const eventDate = decode(tournamentDate);
  const round = get(r, "round", "tour");
  const stage = slug(get(r, "draw", "draw_type", "stage"));
  const inferredDraw = /^q[1234]$/i.test(round) || /^qual/i.test(round) ? "qualifying" :
    /^(F|SF|QF|R(?:16|32|64|128)|RR|final|semi.?final|quarter.?final|round of (?:16|32|64|128))$/i.test(round) ? "main" : undefined;
  const winnerId = get(r, "winnerid", "vainqueur_id", "winner_id");
  const winnerSide = Number(get(r, "winnerside", "winner_side", "winner_code")) ||
    (winnerId != null && String(winnerId) === String(a) ? 1 : winnerId != null && String(winnerId) === String(b) ? 2 : winnerFirst ? 1 : null);
  const tournament = envelope.tournament && typeof envelope.tournament === "object" ? envelope.tournament : {
    id: get(r, "tournamentid", "tournament_id", "tourney_id", "tournoi_id"),
    name: get(r, "tournament", "tourney_name", "tournoi"),
    metadata: { category: get(r, "category", "categorie", "tourney_level"), city: get(r, "city", "location"),
      surface: r.surface }
  };
  const score = get(r, "score", "result");
  const observedStatus = get(r, "outcome", "scoreclass", "score_class", "rawstatus", "status");
  const explicitStatus = observedStatus === "score_present" || observedStatus === "unknown"
    ? get(r, "rawstatus", "status") : observedStatus;
  const status = explicitStatus ?? (/\bret(?:ired)?\.?$/i.test(score) ? "retirement" :
    /\b(?:w\/?o|walkover|forfait)\.?$/i.test(score) ? "walkover" : undefined);
  const fields = { ...(envelope.fields && typeof envelope.fields === "object" ? envelope.fields : {}) };
  for (const field of ["surface","indoor","category","odds","openOdds","closeOdds","matchWinnerOdds","firstSetWinnerOdds",
    "fairCloseOdds","bestCloseOdds","marketProbabilities","rankings","points","serveStats","returnStats"]) {
    const value = r[field.toLowerCase()];
    if (value != null) fields[field] = value === "unknown" ? null : value;
  }
  if (winnerFirst) {
    for (const field of ["rank", "rank_points", "ace", "df", "svpt", "1stIn", "1stWon", "2ndWon", "SvGms", "bpSaved", "bpFaced"]) {
      const suffix = field.toLowerCase();
      const values = [get(r, "w_" + suffix, "winner_" + suffix), get(r, "l_" + suffix, "loser_" + suffix)];
      if (values.some(value => value != null)) fields[field] = values.map(value => value ?? null);
    }
  }
  return {
    source: source || null, scope,
    isolateReason: envelope.preparedReason,
    discipline: mapping.discipline ?? ({single:"singles",singles:"singles",double:"doubles",doubles:"doubles"})[slug(get(r,"discipline","match_type"))] ??
      (/\b(?:singles|double|doubles)\b/i.test(sourcePath.replaceAll("_"," ")) ?
        (/\bdoubles?\b/i.test(sourcePath.replaceAll("_"," ")) ? "doubles" : "singles") : undefined) ??
      (winnerFirst && ["sackmann","sackmannextended","tennismylife"].includes(source) &&
        !/double|junior/i.test(sourcePath) ? "singles" : undefined),
    sides, tournament, matchDate, tournamentDate: eventDate, round,
    season: r.season ?? calendarDate(eventDate ?? matchDate)?.slice(0, 4),
    draw: mapping.draw ?? ({ main:"main", maindraw:"main", qualifying:"qualifying", qualification:"qualifying", quali:"qualifying" })[stage] ?? inferredDraw,
    // A provider-local match number is not a bracket slot shared by providers.
    slot: get(r, "slot", "canonical_slot"),
    externalId: get(r, "externalid", "matchid", "match_id", "source_match_id") ??
      (get(r, "id") && raw ? r.id : r.tourney_id && r.match_num ? r.tourney_id + ":" + r.match_num : null),
    score, scoreOrientation: envelope.scoreOrientation ?? mapping.scoreOrientation ??
      (winnerFirst ? "winner" : get(r, "home_id") != null ? "side1" : null),
    winnerSide, status, fields, knownAt: envelope.knownAt,
    sideFields: envelope.sideFields ?? ["odds","openOdds","closeOdds","matchWinnerOdds","firstSetWinnerOdds","fairCloseOdds",
      "bestCloseOdds","rank","rank_points","ace","df","svpt","1stIn","1stWon","2ndWon","SvGms","bpSaved","bpFaced"]
  };
}

export function discoverSQLite(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /^(matches|players|match-index|supplemental)\.sqlite$/.test(entry.name)) files.push(file);
    }
  }
  walk(root);
  return files.sort();
}

export function sqliteSchema(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare("SELECT name FROM pragma_table_list WHERE schema='main' AND type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(({name}) => ({ name, columns: db.prepare("SELECT name FROM pragma_table_info(?)").all(name).map(c => c.name) }));
  } finally { db.close(); }
}

export function safeInput(root, file) {
  const absolute = realpathSync(resolve(root, file));
  const name = relative(root, absolute);
  if (!name || name === ".." || name.startsWith("../") || !statSync(absolute).isFile()) throw Error("Invalid input path: " + file);
  return { absolute, name };
}

export async function* localRows(file, entry, start) {
  const { absolute, name } = file;
  if (entry.preparedIndex) {
    yield* preparedRows(file, entry, start);
    return;
  }
  if (entry.table) {
    const db = new DatabaseSync(absolute, { readOnly: true });
    try {
      const columns = db.prepare("SELECT name FROM pragma_table_info(?)").all(entry.table).map(row => row.name);
      if (!columns.length) throw Error("Missing SQLite table: " + entry.table);
      if (columns.some(column => ["rowid","oid","_rowid_"].includes(column.toLowerCase()))) throw Error("SQLite cursor name shadowed");
      const rows = db.prepare("SELECT _rowid_ AS __archive_position, * FROM " + q(entry.table) +
        " WHERE _rowid_>? ORDER BY _rowid_").iterate(start);
      for (const { __archive_position: position, ...raw } of rows) yield { position, raw };
    } finally { db.close(); }
    return;
  }
  if (/\.ndjson(\.gz)?$/i.test(name)) {
    const stream = createReadStream(absolute);
    const gunzip = name.endsWith(".gz") ? createGunzip() : null;
    if (gunzip) stream.on("error", error => gunzip.destroy(error));
    const reader = createInterface({ input: gunzip ? stream.pipe(gunzip) : stream, crlfDelay: Infinity });
    let position = 0;
    try {
      for await (const line of reader) {
        position++;
        if (position > start && line.trim()) yield { position, raw: JSON.parse(line) };
      }
    } finally { reader.close(); stream.destroy(); gunzip?.destroy(); }
    return;
  }
  let blob = await openAsBlob(absolute);
  let member = name;
  if (/\.zip$/i.test(name)) {
    const files = (await zipDirectory(blob)).filter(file => file.name === entry.member);
    if (files.length !== 1) throw Error("Specify an unambiguous CSV or JSON ZIP member");
    member = files[0].name;
    blob = await readZipEntry(blob, files[0]);
  }
  const archive = { id: name, sourceHint: entry.source };
  if (/\.json$/i.test(member)) {
    if (blob.size > 16 * 1024 * 1024) throw Error("JSON page exceeds the local adapter limit");
    for await (const row of acesRecords(blob, archive, member, 0)) {
      if (row.row > start) yield { position: row.row, raw: { ...row, provider: "acesapi", dateKind: "source_match_date" } };
    }
    return;
  }
  if (!/\.csv(\.gz)?$/i.test(member)) throw Error("Unsupported local input: " + extname(name));
  const data = name.endsWith(".gz") ? { stream() {
    const input = createReadStream(absolute);
    const gunzip = createGunzip();
    input.on("error", error => gunzip.destroy(error));
    gunzip.on("close", () => input.destroy());
    return Readable.toWeb(input.pipe(gunzip));
  } } : blob;
  let schema;
  for await (const { fields, record } of csvRecords(data)) {
    if (!schema) { schema = archiveSchema(fields); continue; }
    if (record <= start) continue;
    const raw = normalizeArchiveRecord(fields, record, schema, archive, member, 0);
    raw.sourceRecord = { ...raw.sourceRecord };
    yield { position: record, raw };
  }
}

function preparedSinglesSource(provider, source) {
  const file = basename(source ?? "");
  if (provider === "tennismylife") {
    return /^\d{4}_(?:atp(?:_quali)?|wta|challenger)\.csv$/i.test(file) ||
      /^(?:atp|wta)_matches(?:_qual_chall)?_\d{4}\.csv$/i.test(file);
  }
  return ["atp", "wta", "sackmann", "sackmannextended"].includes(provider) &&
    /^(?:atp|wta)_matches(?:_(?:qual_chall|futures))?_\d{4}\.csv$/i.test(file);
}

export function auditPreparedInput(root, entry) {
  if (!entry?.preparedIndex) throw Error("Prepared matches and match-index databases are required");
  const matches = new DatabaseSync(safeInput(root,entry.file).absolute,{ readOnly: true });
  try {
    matches.exec("PRAGMA temp_store=FILE");
    const rows = matches.prepare(`
      SELECT provider, source, date_kind, COUNT(*) AS rows,
        sum(CASE WHEN match_id GLOB '[0-9][0-9][0-9][0-9]-*:[0-9]*' THEN 1 ELSE 0 END) AS composite
      FROM matches GROUP BY provider,source,date_kind ORDER BY provider,rows DESC
    `).iterate();
    const coverage = new Map();
    for (const row of rows) {
      const key = row.provider ?? "unknown";
      if (!coverage.has(key)) coverage.set(key, { provider: key, rows: 0, compositeIds: 0, recognizedSinglesRows: 0,
        dateKinds: {}, sourcePatterns: [] });
      const provider = coverage.get(key);
      provider.rows += row.rows;
      provider.compositeIds += row.composite;
      if (preparedSinglesSource(slug(key),row.source)) provider.recognizedSinglesRows += row.rows;
      const dateKind = row.date_kind ?? "unknown";
      provider.dateKinds[dateKind] = (provider.dateKinds[dateKind] ?? 0) + row.rows;
      const sourcePattern = String(row.source ?? "unknown").replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, "YYYY");
      if (provider.sourcePatterns.length < 5 && !provider.sourcePatterns.includes(sourcePattern)) provider.sourcePatterns.push(sourcePattern);
    }
    const index = new DatabaseSync(safeInput(root,entry.preparedIndex).absolute,{ readOnly: true });
    try {
      const strictRows = index.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='strict_overlap_groups'").get()
        ? index.prepare("SELECT date_kind, count(*) AS groups FROM strict_overlap_groups GROUP BY date_kind").all() : [];
      return { preparedMatchInputs: [...coverage.values()], strictOverlapCandidatesByDateKind: strictRows };
    } finally { index.close(); }
  } finally { matches.close(); }
}

// Prepared SQLite stores IDs and display/result metadata in separate databases.
async function* preparedRows(file, entry, start) {
  const matches = new DatabaseSync(file.absolute, { readOnly: true });
  try {
    const index = new DatabaseSync(file.preparedIndex, { readOnly: true });
    try {
      const lookup = index.prepare(`
        SELECT circuit, date, date_kind, name1, name2, winner_name, tournament, round, surface, score, status,
          archive, archive_row
        FROM match_index WHERE provider=? AND source=? AND source_row=? LIMIT 3
      `);
      // Require an indexed search before scanning the large input.
      const plan = index.prepare(`EXPLAIN QUERY PLAN
        SELECT id FROM match_index WHERE provider=? AND source=? AND source_row=?`).all("", "", 0);
      if (!plan.some(row => /SEARCH .*provider=\? AND source=\? AND source_row=\?/i.test(row.detail))) {
        throw Error("Prepared match index requires an index on (provider, source, source_row)");
      }
      const read = matches.prepare("SELECT _rowid_ AS position, * FROM matches WHERE _rowid_>? ORDER BY _rowid_");
      for (const { position, ...m } of read.iterate(start)) {
        const hits = m.provider != null && m.source != null && m.source_row != null
          ? lookup.all(m.provider, m.source, m.source_row) : [];
        const hit = hits.length < 3 && m.archive != null && m.archive_row != null
          ? hits.filter(r => r.archive === m.archive && r.archive_row === m.archive_row) : [];
        const r = hit.length === 1 ? hit[0] : null;
        const provider = slug(m.provider);
        // The Sackmann-style ATP/WTA singles files define tournament and match number in this format.
        const standard = preparedSinglesSource(provider, m.source);
        const composite = standard ? /^(\d{4}-[^:]+):\d+$/.exec(String(m.match_id ?? "")) : null;
        const winner = m.winner != null ? String(m.winner) : null;
        const winnerSide = winner && winner === String(m.player1) ? 1
          : winner && winner === String(m.player2) ? 2 : null;
        const reason = !r ? "prepared_index_unresolved" :
          (m.date && r.date && String(m.date) !== String(r.date)) ||
          (m.date_kind && r.date_kind && slug(m.date_kind) !== slug(r.date_kind)) ? "prepared_date_conflict" : null;
        const dateKind = slug(m.date_kind ?? r?.date_kind);
        const date = m.date ?? r?.date;
        yield { position, raw: {
          ...m, provider, source: m.source, scope: scopeOf(r?.circuit) ?? scopeOf(m.tour),
          player1_id: m.player1, player2_id: m.player2,
          player1_name: r?.name1, player2_name: r?.name2,
          tournament: r?.tournament,
          tournament_id: composite?.[1],
          season: composite?.[1].slice(0, 4),
          date: null, date_kind: dateKind,
          match_date: ["matchstart","matchstartutc","sourcematchdate","sourcetimestamputc","matchdate"].includes(dateKind) ? date : null,
          tournament_date: ["tournamentstart","tournamentdate"].includes(dateKind) ? date : null,
          round: r?.round,
          status: r?.status,
          score: r?.score,
          surface: r?.surface ?? m.surface,
          winner_side: winnerSide, scoreOrientation: standard ? "winner" : null,
          discipline: standard ? "singles" : null,
          fields: { tournamentName: r?.tournament ?? null },
          preparedReason: reason
        } };
      }
    } finally { index.close(); }
  } finally { matches.close(); }
}

export function inferEntries(root, files) {
  const entries = [];
  const pending = [];
  const catalog = files.flatMap(file => sqliteSchema(file).map(table => ({ ...table, file: relative(root,file) })));
  const has = (table, fields) => table && fields.every(field => table.columns.includes(field));
  const find = (file, table) => catalog.find(item => basename(item.file) === file && item.name === table);
  const matchTable = find("matches.sqlite", "matches");
  const indexTable = find("match-index.sqlite", "match_index");
  if (has(matchTable, ["provider","tour","match_id","player1","player2","winner","archive","archive_row","source","source_row"]) &&
      has(indexTable, ["provider","source","source_row","archive","archive_row","name1","name2","tournament","score"])) {
    const players = find("players.sqlite", "unified_player_index");
    if (has(players, ["provider","circuit","player_id","name","birthdate"])) {
      entries.push({ file: players.file, table: players.name, kind: "player_profile" });
    }
    entries.push({ file: matchTable.file, table: matchTable.name, preparedIndex: indexTable.file });
  }
  for (const { file: path, name, columns } of catalog) {
      if (entries.some(entry => (entry.file === path && entry.table === name) ||
          (entry.preparedIndex === path && name === "match_index"))) continue;
      const aliases = new Set(columns.map(column => column.toLowerCase()));
      const recognizable = ["raw_json", "record_json", "payload_json", "data_json", "normalized_json", "source_record", "raw"].some(c => aliases.has(c)) ||
        ["player1_id", "player1id", "winner_id", "home_id", "joueur1_id"].some(c => aliases.has(c));
      if (basename(path) === "matches.sqlite" && recognizable) entries.push({ file: path, table: name });
      else pending.push({ file: path, table: name, columns });
  }
  if (!entries.length) {
    for (const name of ["matches_candidates.ndjson", "matches_review.ndjson"]) {
      const file = join("Normalized", name);
      try { safeInput(root, file); entries.push({ file }); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  return { entries, pending };
}
