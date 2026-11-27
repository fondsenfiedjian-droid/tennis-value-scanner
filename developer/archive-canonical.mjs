import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

const key = (...parts) => JSON.stringify(parts);
const id = (kind, ...parts) => kind + "_" + createHash("sha256").update(key(...parts)).digest("hex").slice(0, 32);
const clean = value => String(value ?? "").trim();
const token = value => clean(value).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const cyrillic = Object.fromEntries(Array.from("абвгдежзийклмнопрстуфхцчшщъыьэюя")
  .map((letter, index) => [letter, "a b v g d e zh z i i k l m n o p r s t u f kh ts ch sh shch _ y _ e iu ia".split(" ")[index]]));
const nameKey = value => token(value).replace(/[а-я]/g, letter => cyrillic[letter] === "_" ? "" : cyrillic[letter]);
export function calendarDate(value) {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(clean(value));
  if (!match) return null;
  const iso = match.slice(1).join("-");
  const date = new Date(iso);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function excelDate(serial, epoch) {
  if (!Number.isFinite(serial) || serial < 0 || !["1900", "1904"].includes(epoch)) return null;
  const days = Math.floor(serial);
  if (epoch === "1900" && (days === 0 || days === 60)) return null;
  const base = epoch === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, days < 60 ? 31 : 30);
  const value = new Date(base + days * 86400000);
  return Number.isFinite(+value) ? calendarDate(value.toISOString().slice(0, 10)) : null;
}

const rounds = {
  final: "f", semifinal: "sf", "semi final": "sf", quarterfinal: "qf", "quarter final": "qf",
  "round of 16": "r16", "round of 32": "r32", "round of 64": "r64", "round of 128": "r128"
};
const statusMap = {
  finished: "completed", complete: "completed", completed: "completed", retired: "retirement",
  retirement: "retirement", walkover: "walkover", forfait: "walkover", default: "default",
  cancelled: "cancelled", canceled: "cancelled", suspended: "suspended", abandoned: "abandoned",
  withdrawn: "withdrawn", interrupted: "interrupted", scheduled: "scheduled", live: "live"
};
const preMatchFields = new Set(["odds", "openOdds", "closeOdds", "matchWinnerOdds", "firstSetWinnerOdds",
  "marketProbabilities", "fairCloseOdds", "bestCloseOdds", "rankings", "surface", "indoor"]);

function scoreFromSideOne(value, reverse) {
  const sets = clean(value).replace(/\s+(?:RET|W\/?O|DEF)\.?$/i, "");
  if (!/^\d+[-:]\d+(?:\(\d+\))?(?:\s+\d+[-:]\d+(?:\(\d+\))?)*$/.test(sets)) return null;
  return sets.split(/\s+/).map(set => {
    const [, a, b, tie = ""] = /^(\d+)[-:](\d+)(\(\d+\))?$/.exec(set);
    return (reverse ? [b, a] : [a, b]).join("-") + tie;
  }).join(" ");
}

function observationCoordinate(locator) {
  const file = locator?.sourceFile ?? locator?.source_file ?? locator?.source;
  const row = locator?.sourceRow ?? locator?.source_row;
  if (clean(file) && Number.isSafeInteger(Number(row)) && Number(row) > 0) {
    return key("source", clean(file), Number(row));
  }
  if (locator?.sha256Revision && locator.file && Number.isSafeInteger(locator.row) && locator.row > 0) {
    return key("input", locator.sha256Revision, locator.file, locator.table ?? null, locator.member ?? null, locator.row);
  }
  return null;
}

function regularWinningScore(scoreValue, winnerValue, scope) {
  if (!scoreValue || !winnerValue) return 0;
  const winner = JSON.parse(winnerValue);
  if (![1,2].includes(winner)) return 0;
  const sets = JSON.parse(scoreValue).split(/\s+/);
  let won = 0, lost = 0, lastWon = false;
  for (const set of sets) {
    const parts = /^(\d+)-(\d+)(?:\(\d+\))?$/.exec(set);
    if (!parts) return 0;
    const first = Number(parts[1]), second = Number(parts[2]);
    const high = Math.max(first,second), low = Math.min(first,second);
    if (!(high === 6 && low <= 4 || high === 7 && [5,6].includes(low))) return 0;
    if (set.includes("(") && !(high === 7 && low === 6)) return 0;
    lastWon = winner === 1 ? first > second : second > first;
    if (lastWon) won++;
    else lost++;
  }
  return Number(lastWon && (won === 2 || (scope === "ATP" && won === 3)) && lost < won);
}

const schema = `
CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS external_id (
  kind TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL, external TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entity(id), evidence TEXT NOT NULL,
  PRIMARY KEY(kind, source, scope, external)
) STRICT;
CREATE TABLE IF NOT EXISTS entity_claim (
  entity_id TEXT NOT NULL REFERENCES entity(id), origin TEXT NOT NULL,
  name TEXT, name_key TEXT, birth TEXT, metadata TEXT,
  PRIMARY KEY(entity_id, origin)
) STRICT;
CREATE INDEX IF NOT EXISTS entity_birth ON entity_claim(birth, name_key, entity_id);
CREATE TABLE IF NOT EXISTS blocked_external (
  kind TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL, external TEXT NOT NULL,
  origin TEXT NOT NULL, reason TEXT NOT NULL,
  PRIMARY KEY(kind, source, scope, external)
) STRICT;
CREATE TABLE IF NOT EXISTS tournament_edition (
  entity_id TEXT NOT NULL REFERENCES entity(id), source TEXT NOT NULL, signature TEXT NOT NULL,
  PRIMARY KEY(signature, entity_id, source)
) STRICT;
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, participants TEXT NOT NULL, tournament_id TEXT NOT NULL REFERENCES entity(id),
  season INTEGER NOT NULL, scope TEXT NOT NULL, discipline TEXT NOT NULL, draw TEXT NOT NULL,
  round TEXT NOT NULL, match_date TEXT, slot TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS match_candidates
  ON matches(participants, tournament_id, season, scope, discipline, draw, round);
CREATE TABLE IF NOT EXISTS observations (
  origin TEXT PRIMARY KEY, source TEXT NOT NULL, source_key TEXT, digest TEXT NOT NULL,
  match_id TEXT REFERENCES matches(id), locator TEXT NOT NULL, reason TEXT, unlinked_payload TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS observation_match ON observations(match_id);
CREATE INDEX IF NOT EXISTS observation_source ON observations(source_key);
CREATE INDEX IF NOT EXISTS observation_digest ON observations(digest);
CREATE INDEX IF NOT EXISTS observation_match_source ON observations(match_id, source, source_key);
CREATE TABLE IF NOT EXISTS claims (
  origin TEXT NOT NULL REFERENCES observations(origin), field TEXT NOT NULL, value TEXT NOT NULL,
  known_at TEXT, PRIMARY KEY(origin, field)
) STRICT;
CREATE TABLE IF NOT EXISTS decisions (
  sequence INTEGER PRIMARY KEY, origin TEXT NOT NULL REFERENCES observations(origin),
  match_id TEXT NOT NULL REFERENCES matches(id), action TEXT NOT NULL, reason TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS checkpoints (
  input TEXT PRIMARY KEY, revision TEXT NOT NULL, position INTEGER NOT NULL, complete INTEGER NOT NULL
) STRICT;
`;

export function openCanonicalArchive(path, { readOnly = false } = {}) {
  const db = new DatabaseSync(path, { readOnly });
  try {
    const appId = db.prepare("PRAGMA application_id").get().application_id;
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name);
    if (appId !== 0x54565341 && (appId !== 0 || (tables.length &&
        !["external_id","claims","checkpoints","observations"].every(name => tables.includes(name))))) {
      throw Error("Output database belongs to another application");
    }
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA cache_size=-16000; PRAGMA temp_store=FILE;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 0 && version !== 1) throw Error("Unsupported canonical archive version");
    if (readOnly) {
      if (appId !== 0x54565341 || version !== 1) throw Error("Expected an existing canonical archive");
    } else {
      db.exec("PRAGMA journal_mode=WAL; BEGIN IMMEDIATE");
      db.exec(schema);
      db.exec("PRAGMA application_id=0x54565341; PRAGMA user_version=1; COMMIT");
    }
  } catch (error) {
    db.close();
    throw error;
  }
  const statements = new Map();
  const query = sql => {
    if (!statements.has(sql)) statements.set(sql, db.prepare(sql));
    return statements.get(sql);
  };
  const transaction = callback => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const external = (kind, source, scope, reference) => query(
    "SELECT entity_id FROM external_id WHERE kind=? AND source=? AND scope=? AND external=?"
  ).get(kind, source, scope, reference)?.entity_id;

  function entity(kind, source, scope, reference, origin) {
    const code = clean(reference?.id);
    if (!code || query("SELECT 1 FROM blocked_external WHERE kind=? AND source=? AND scope=? AND external=?")
      .get(kind,source,scope,code)) return null;
    const name = clean(reference.name);
    const birth = calendarDate(reference.birth);
    const normalized = nameKey(name);
    let entityId = external(kind, source, scope, code);
    if (entityId && birth && query(
      "SELECT 1 FROM entity_claim WHERE entity_id=? AND birth IS NOT NULL AND birth<>? LIMIT 1"
    ).get(entityId, birth)) {
      query("INSERT INTO blocked_external VALUES(?,?,?,?,?,?)")
        .run(kind, source, scope, code, origin, "conflicting_birth_date");
      return null;
    }
    let evidence = "provider_id";
    if (!entityId && kind === "player" && birth && normalized) {
      const candidates = query(`
        SELECT DISTINCT e.id FROM entity e JOIN entity_claim c ON c.entity_id=e.id
        WHERE e.kind='player' AND e.scope=? AND c.birth=? AND c.name_key=?
        AND NOT EXISTS (SELECT 1 FROM external_id x WHERE x.entity_id=e.id AND x.source=?)
        LIMIT 2
      `).all(scope, birth, normalized, source);
      if (candidates.length > 1) return null;
      if (candidates.length === 1) {
        entityId = candidates[0].id;
        evidence = "name_birth_scope";
      }
    }
    const metadata = reference.metadata ?? {};
    const editionParts = [metadata.season, name, metadata.city, metadata.category, metadata.surface].map(token);
    const edition = kind === "tournament" && editionParts.every(part => part && part !== "unknown")
      ? key(scope, ...editionParts) : null;
    if (edition && !entityId) {
      const candidates = query(`
        SELECT DISTINCT entity_id FROM tournament_edition
        WHERE signature=? AND source<>? AND entity_id NOT IN (
          SELECT entity_id FROM tournament_edition WHERE signature=? AND source=?
        ) LIMIT 2
      `).all(edition, source, edition, source);
      if (candidates.length > 1) return null;
      if (candidates.length === 1) {
        entityId = candidates[0].entity_id;
        evidence = "exact_edition_name_city_category_surface";
      }
    }
    entityId ??= id(kind, source, scope, code);
    query("INSERT OR IGNORE INTO entity VALUES(?,?,?)").run(entityId, kind, scope);
    query("INSERT OR IGNORE INTO external_id VALUES(?,?,?,?,?,?)").run(kind, source, scope, code, entityId, evidence);
    if (edition) query("INSERT OR IGNORE INTO tournament_edition VALUES(?,?,?)").run(entityId,source,edition);
    if (name || birth || reference.metadata) {
      query("INSERT OR IGNORE INTO entity_claim VALUES(?,?,?,?,?,?)")
        .run(entityId, origin, name || null, normalized || null, birth, reference.metadata ? key(reference.metadata) : null);
    }
    return entityId;
  }

  function storeLink({ kind, source, scope, externalId, targetSource, targetId, evidence }) {
    if (!["player", "tournament"].includes(kind) ||
        ![source, scope, externalId, targetSource, targetId, evidence].every(value => typeof value === "string" && value.trim())) {
      throw Error("A confirmed identity link requires two scoped identifiers and documented evidence");
    }
    const existing = external(kind, source, scope, externalId);
    const target = external(kind, targetSource, scope, targetId) ?? id(kind, targetSource, scope, targetId);
    if (existing && existing !== target) throw Error("Link would rewrite an existing canonical identity");
    query("INSERT OR IGNORE INTO entity VALUES(?,?,?)").run(target, kind, scope);
    const insert = query("INSERT OR IGNORE INTO external_id VALUES(?,?,?,?,?,?)");
    insert.run(kind, targetSource, scope, targetId, target, evidence);
    insert.run(kind, source, scope, externalId, target, evidence);
    return target;
  }

  const confirmLink = link => transaction(() => storeLink(link));
  const confirmLinks = links => transaction(() => {
    for (const link of links) storeLink(link);
  });

  function ingest(record, origin, locator) {
    const { source, scope } = record;
    const previous = query("SELECT digest FROM observations WHERE origin=?").get(origin);
    const digest = id("record", record);
    if (previous) {
      if (previous.digest !== digest) throw Error("Changed source row at " + origin);
      return;
    }
    const coordinate = observationCoordinate(locator);
    if (coordinate && query("SELECT locator FROM observations WHERE digest=?").all(digest)
      .some(row => observationCoordinate(JSON.parse(row.locator)) === coordinate)) return;
    const sourceKey = clean(record.externalId) ? key(source, scope, clean(record.externalId)) : null;
    const insert = (matchId, reason, payload) => query("INSERT INTO observations VALUES(?,?,?,?,?,?,?,?)")
      .run(origin, source || "unknown", sourceKey, digest, matchId, JSON.stringify(locator), reason, payload);
    function isolate(reason) {
      insert(null, reason, JSON.stringify(record));
    }
    if (record.isolateReason) return isolate(record.isolateReason);
    if (!source || !scope) return isolate("unknown_source_or_scope");
    if (record.kind === "player_profile" || record.kind === "tournament_profile") {
      const kind = record.kind === "player_profile" ? "player" : "tournament";
      const resolved = entity(kind, source, scope, record.profile, origin);
      return isolate(resolved ? "indexed_profile" : "unresolved_profile");
    }
    if (record.kind === "supplement") {
      const related = sourceKey ? query(
        "SELECT DISTINCT match_id FROM observations WHERE source_key=? AND match_id IS NOT NULL LIMIT 2"
      ).all(sourceKey) : [];
      if (related.length !== 1) return isolate("unresolved_supplement");
      const matchId = related[0].match_id;
      insert(matchId, null, null);
      for (const [field, value] of Object.entries(record.fields ?? {})) {
        if (!["winner", "score", "status"].includes(field) && value != null) {
          query("INSERT INTO claims VALUES(?,?,?,NULL)").run(origin, field, JSON.stringify(value));
        }
      }
      query("INSERT INTO decisions(origin,match_id,action,reason) VALUES(?,?,'link',?)")
        .run(origin, matchId, "supplement_scoped_provider_match_id");
      return;
    }
    if (sourceKey && query("SELECT 1 FROM observations WHERE source_key=? AND reason='manual_unlink' LIMIT 1").get(sourceKey)) {
      return isolate("previously_unlinked_provider_id");
    }
    const discipline = token(record.discipline);
    const sideSize = discipline === "doubles" ? 2 : discipline === "singles" ? 1 : 0;
    if (!sideSize || record.sides?.length !== 2 || !record.sides.every(side => Array.isArray(side) && side.length === sideSize)) {
      return isolate("unknown_discipline_or_sides");
    }
    const sides = record.sides.map(side => side.map(player => entity("player", source, scope, player, origin)).sort());
    if (sides.flat().some(value => !value) || new Set(sides.flat()).size !== sideSize * 2) return isolate("unresolved_players");
    const pair = sides.map(side => JSON.stringify(side));
    const reverse = pair[0] > pair[1];
    const participants = JSON.stringify(pair.sort());
    const season = Number(record.season);
    const tournament = entity("tournament", source, scope, {
      ...record.tournament, metadata: { ...record.tournament?.metadata, season }
    }, origin);
    const roundToken = token(record.round);
    const round = rounds[roundToken] ?? roundToken;
    const draw = token(record.draw);
    const matchDate = calendarDate(record.matchDate);
    const tournamentDate = calendarDate(record.tournamentDate);
    const slot = clean(record.slot) || null;
    if (!tournament || !Number.isInteger(season) || season < 1800 || season > 2200 ||
        !round || !["main", "qualifying"].includes(draw) || (!matchDate && !slot && !sourceKey)) {
      return isolate("incomplete_match_identity");
    }
    if ((record.matchDate && !matchDate) || (record.tournamentDate && !tournamentDate) ||
        (matchDate && tournamentDate && matchDate < tournamentDate && draw === "main") ||
        (matchDate && Math.abs(Number(matchDate.slice(0, 4)) - season) > 1)) return isolate("invalid_chronology");
    const identity = [participants, tournament, season, scope, discipline, draw, round];
    const candidates = query(`
      SELECT * FROM matches WHERE participants=? AND tournament_id=? AND season=?
      AND scope=? AND discipline=? AND draw=? AND round=? LIMIT 3
    `).all(...identity);
    const sameSource = sourceKey ? query(
      "SELECT DISTINCT match_id FROM observations WHERE source_key=? AND match_id IS NOT NULL LIMIT 2"
    ).all(sourceKey).map(row => row.match_id) : [];
    const compatible = candidates.filter(candidate =>
      (!matchDate || !candidate.match_date || candidate.match_date === matchDate) &&
      (!slot || !candidate.slot || candidate.slot === slot) &&
      (sameSource.includes(candidate.id) || (matchDate && candidate.match_date === matchDate) ||
        (slot && slot === candidate.slot)));
    if (compatible.length > 1 || candidates.length >= 3 || (sameSource.length &&
        (sameSource.length !== 1 || compatible[0]?.id !== sameSource[0]))) return isolate("ambiguous_or_reused_match_id");
    if (!compatible.length && candidates.some(candidate =>
      !slot || !candidate.slot || slot === candidate.slot || !matchDate || !candidate.match_date || matchDate === candidate.match_date)) {
      return isolate("unresolved_date_or_slot");
    }
    const current = compatible[0];
    const matchId = current?.id ?? id("match", ...identity, matchDate, slot, matchDate || slot ? null : sourceKey);
    const winner = [1, 2].includes(record.winnerSide) ? (reverse ? 3 - record.winnerSide : record.winnerSide) : null;
    const score = record.scoreOrientation === "side1" || (record.scoreOrientation === "winner" && winner)
      ? scoreFromSideOne(record.score, record.scoreOrientation === "winner" ? winner === 2 : reverse) : null;
    const status = statusMap[token(record.status)] ?? null;
    const result = { winner, score, status };
    if (current) {
      if (sourceKey && query(`SELECT 1 FROM observations
        WHERE match_id=? AND source=? AND source_key<>? LIMIT 1`).get(matchId, source, sourceKey)) {
        return isolate("different_ids_within_provider");
      }
      const resultClaims = query(`
        SELECT DISTINCT c.field, c.value FROM claims c JOIN observations o USING(origin)
        WHERE o.match_id=? AND c.field IN ('winner','score','status')
      `).all(matchId);
      const terminal = new Set(["completed", "retirement", "walkover", "default", "withdrawn", "abandoned", "cancelled"]);
      if (resultClaims.some(({ field, value }) => result[field] != null && JSON.stringify(result[field]) !== value &&
          (field !== "status" || (terminal.has(JSON.parse(value)) && terminal.has(status))))) {
        return isolate("contradictory_result");
      }
    } else {
      query("INSERT INTO matches VALUES(?,?,?,?,?,?,?,?,?,?)").run(matchId, ...identity, matchDate, slot);
    }
    // Retain anchor evidence on the match so a row missing one identifier cannot bridge incompatible rows.
    if (current) query("UPDATE matches SET match_date=coalesce(match_date,?), slot=coalesce(slot,?) WHERE id=?")
      .run(matchDate, slot, matchId);
    insert(matchId, null, null);
    const values = { ...record.fields, ...result, tournamentDate, matchDate, slot };
    for (const [field, value] of Object.entries(values)) {
      if (value == null || value === "" || (Array.isArray(value) && value.every(v => v == null))) continue;
      const oriented = reverse && record.sideFields?.includes(field) && Array.isArray(value) && value.length === 2
        ? [value[1], value[0]] : value;
      const timestamp = record.knownAt?.[field];
      const knownAt = preMatchFields.has(field) && typeof timestamp === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp) &&
        calendarDate(timestamp.slice(0, 10)) && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
      query("INSERT INTO claims VALUES(?,?,?,?)").run(origin, field, JSON.stringify(oriented), knownAt);
    }
    query("INSERT INTO decisions(origin,match_id,action,reason) VALUES(?,?,?,?)")
      .run(origin, matchId, current ? "link" : "create", current ? "compatible_identity_and_result" : "new_identity");
  }

  function ingestBatch(input, revision, rows, { complete = false, expectedPosition } = {}) {
    return transaction(() => {
      const checkpoint = query("SELECT * FROM checkpoints WHERE input=?").get(input);
      if (checkpoint && checkpoint.revision !== revision) throw Error("Input changed since checkpoint: " + input);
      let position = checkpoint?.position ?? 0;
      if (expectedPosition !== undefined && position !== expectedPosition) throw Error("Input checkpoint moved: " + input);
      for (const row of rows) {
        if (!Number.isSafeInteger(row.position) || row.position <= position) throw Error("Invalid input cursor");
        ingest(row.record, key(input, row.position), row.locator);
        position = row.position;
      }
      query(`INSERT INTO checkpoints VALUES(?,?,?,?)
        ON CONFLICT(input) DO UPDATE SET position=excluded.position,complete=excluded.complete`)
        .run(input, revision, position, Number(complete));
      return position;
    });
  }

  function attachReviewed(groups, bindings, { apply = false } = {}) {
    const evidence = new Map();
    for (const link of bindings) {
      const k = key(link.kind,link.source,link.scope,link.externalId);
      const target = key(link.targetSource,link.targetId);
      if (evidence.has(k) && evidence.get(k) !== target) throw Error("Conflicting reviewed identity evidence");
      evidence.set(k,target);
    }
    const assess = pairs => {
      if (pairs.length !== 2) return "invalid_group";
      const [a,b] = pairs.map(({record}) => record);
      const playerIds = r => r.sides?.map(side => side.length === 1 ? clean(side[0]?.id) : null);
      const proof = (r,kind,ref) => evidence.get(key(kind,r.source,r.scope,ref));
      const ids = pairs.map(({record}) => playerIds(record));
      if (a.source === b.source || !a.scope || a.scope !== b.scope || !a.slot || a.slot !== b.slot ||
          a.discipline !== "singles" || b.discipline !== "singles" || a.season !== b.season || a.draw !== b.draw ||
          token(a.round) !== token(b.round) || !calendarDate(a.tournamentDate) || a.tournamentDate !== b.tournamentDate ||
          a.matchDate || b.matchDate || ![a,b].every(r => r.scoreOrientation === "winner" && [1,2].includes(r.winnerSide)) ||
          ids.some(v => v?.length !== 2 || !v.every(Boolean))) return "invalid_group";
      const event = proof(a,"tournament",clean(a.tournament?.id));
      const players = [a,b].map((r,i) => ids[i].map(ref => proof(r,"player",ref)));
      const score = scoreFromSideOne(a.score,false);
      if (!event || event !== proof(b,"tournament",clean(b.tournament?.id)) ||
          players.some(v => !v.every(Boolean) || v[0] === v[1]) ||
          key(...[...players[0]].sort()) !== key(...[...players[1]].sort()) ||
          players[0][a.winnerSide-1] !== players[1][b.winnerSide-1] ||
          !score || score !== scoreFromSideOne(b.score,false)) return "review_evidence_mismatch";
      const observations = pairs.map(({record,locator}) => {
        const code = key(record.source,record.scope,clean(record.externalId));
        const coordinate = observationCoordinate(locator);
        if (!coordinate || !clean(record.externalId)) return null;
        const sourceRows = query("SELECT * FROM observations WHERE source_key=?").all(code);
        const found = sourceRows.filter(row => observationCoordinate(JSON.parse(row.locator)) === coordinate);
        return found.length === 1 && sourceRows.length === 1 ? found[0] : null;
      });
      if (observations.some(row => !row)) return "source_observation_unresolved";
      if (observations.every(row => row.match_id)) {
        return observations[0].match_id === observations[1].match_id ? "already_attached" : "two_existing_matches";
      }
      const n = observations.findIndex(row => row.match_id);
      if (n < 0) return "no_existing_match";
      const [anchor,target] = [observations[n],observations[1-n]];
      const r = pairs[n].record;
      if (!["unknown_discipline_or_sides","incomplete_match_identity"].includes(target.reason)) return "isolated_observation_requires_review";
      const pending = JSON.parse(target.unlinked_payload ?? "null");
      const pendingIds = pending && playerIds(pending);
      if (!pendingIds || key(...pendingIds) !== key(...ids[1-n]) ||
          (pending.winnerSide != null && pending.winnerSide !== pairs[1-n].record.winnerSide)) {
        return "isolated_observation_evidence_conflict";
      }
      const match = query("SELECT * FROM matches WHERE id=?").get(anchor.match_id);
      if (match.scope !== r.scope || match.discipline !== r.discipline || match.season !== Number(r.season) ||
          match.draw !== r.draw || match.round !== (rounds[token(r.round)] ?? token(r.round))) return "existing_match_identity_conflict";
      let nativeEvent;
      try { nativeEvent = JSON.parse(r.tournament.id); } catch { return "existing_tournament_identity_unresolved"; }
      if (!Array.isArray(nativeEvent) || nativeEvent.length !== 2 || nativeEvent[1] !== r.tournamentDate ||
          external("tournament",r.source,r.scope,nativeEvent[0]) !== match.tournament_id) {
        return "existing_tournament_identity_unresolved";
      }
      const known = ids[n].map(ref => external("player",r.source,r.scope,ref));
      const ordered = known.map(ref => key(ref));
      if (known.some(ref => !ref) || key(...[...ordered].sort()) !== match.participants) return "existing_players_conflict";
      const winner = ordered[r.winnerSide-1] === [...ordered].sort()[0] ? 1 : 2;
      const required = {winner, score:scoreFromSideOne(r.score,winner===2), tournamentDate:r.tournamentDate};
      for (const [field,value] of Object.entries(required)) {
        const claims = query(`SELECT DISTINCT c.value FROM claims c JOIN observations o USING(origin)
          WHERE o.match_id=? AND c.field=?`).all(match.id,field);
        if (claims.length !== 1 || claims[0].value !== JSON.stringify(value)) return "existing_result_conflict";
      }
      if (apply) {
        query("UPDATE observations SET match_id=?, reason=NULL WHERE origin=?").run(match.id,target.origin);
        for (const [field,value] of Object.entries(required)) {
          query("INSERT INTO claims VALUES(?,?,?,NULL)").run(target.origin,field,JSON.stringify(value));
        }
        const surface = pairs[1-n].record.fields?.surface;
        const existingSurface = query("SELECT value FROM claims WHERE origin=? AND field='surface'").get(anchor.origin);
        if (surface && surface === r.fields?.surface && existingSurface?.value === JSON.stringify(surface)) {
          query("INSERT INTO claims VALUES(?,?,?,NULL)").run(target.origin,"surface",JSON.stringify(surface));
        }
        query("INSERT INTO decisions(origin,match_id,action,reason) VALUES(?,?,'link',?)")
          .run(target.origin,match.id,"reviewed_cross_provider_group:"+r.slot);
      }
      return apply ? "attached" : "ready";
    };
    const run = () => {
      const decisions = {};
      for (const group of groups) {
        const result = assess(group);
        decisions[result] = (decisions[result] ?? 0) + 1;
      }
      return { mode: apply ? "apply" : "preview", groups: groups.length, decisions };
    };
    return apply ? transaction(run) : run();
  }

  function unlink(origin, reason) {
    if (!clean(reason)) throw Error("A review reason is required");
    return transaction(() => {
      const row = query("SELECT match_id FROM observations WHERE origin=?").get(origin);
      if (!row?.match_id) throw Error("No active link");
      const action = query("SELECT action FROM decisions WHERE origin=? ORDER BY sequence DESC LIMIT 1").get(origin);
      if (action?.action !== "link") throw Error("The founding observation cannot be detached");
      query("UPDATE observations SET match_id=NULL, reason='manual_unlink' WHERE origin=?").run(origin);
      const anchor = field => query(`SELECT c.value FROM claims c JOIN observations o USING(origin)
        WHERE o.match_id=? AND c.field=? ORDER BY c.origin LIMIT 1`).get(row.match_id,field)?.value;
      query("UPDATE matches SET match_date=?,slot=? WHERE id=?")
        .run(JSON.parse(anchor("matchDate") ?? "null"),JSON.parse(anchor("slot") ?? "null"),row.match_id);
      query("INSERT INTO decisions(origin,match_id,action,reason) VALUES(?,?,'unlink',?)").run(origin, row.match_id, reason);
    });
  }

  function fields(matchId, asOf) {
    if (asOf !== undefined && !(typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(asOf) &&
        calendarDate(asOf.slice(0, 10)) && Number.isFinite(Date.parse(asOf)))) throw Error("Expected an explicit UTC timestamp");
    const cutoff = asOf === undefined ? null : new Date(asOf).toISOString();
    const rows = query(`
      SELECT c.*, o.source, o.locator FROM claims c JOIN observations o USING(origin)
      WHERE o.match_id=? AND (? IS NULL OR c.known_at < ?)
      ORDER BY c.field, o.source, c.origin
    `).all(matchId, cutoff, cutoff);
    const groups = Map.groupBy(rows, row => row.field);
    return Object.fromEntries([...groups].map(([field, claims]) => {
      const byValue = Map.groupBy(claims, claim => claim.value);
      const alternatives = [...byValue].map(([value, evidence]) => ({
        value: JSON.parse(value), sources: [...new Set(evidence.map(claim => claim.source))], evidence
      })).sort((a, b) => b.sources.length - a.sources.length);
      // Unverified independence of feeds makes raw vote counts unsuitable for overriding a conflict.
      return [field, { value: alternatives.length === 1 ? alternatives[0].value : null,
        conflict: alternatives.length > 1, alternatives }];
    }));
  }
  function validateSeasonRange(from,to) {
    if (![from,to].every(year => Number.isInteger(year) && year >= 1800 && year <= 2200) || from > to) {
      throw Error("Expected a valid inclusive season range");
    }
  }

  db.function("regular_winning_score", {deterministic:true}, regularWinningScore);
  const trainingClassification = `
      WITH result AS (
        SELECT m.id, m.season, m.scope, m.match_date,
          COUNT(DISTINCT CASE WHEN c.field='winner' THEN c.value END) AS winners,
          MIN(CASE WHEN c.field='winner' THEN c.value END) AS winner,
          COUNT(DISTINCT CASE WHEN c.field='score' THEN c.value END) AS scores,
          MIN(CASE WHEN c.field='score' THEN c.value END) AS score,
          COUNT(DISTINCT CASE WHEN c.field='tournamentDate' THEN c.value END) AS tournament_dates,
          MAX(CASE WHEN c.field='status' AND c.value='"completed"' THEN 1 ELSE 0 END) AS completed,
          MAX(CASE WHEN c.field='status' AND c.value IN
            ('"retirement"','"walkover"','"default"','"withdrawn"','"abandoned"','"cancelled"','"suspended"','"interrupted"')
            THEN 1 ELSE 0 END) AS nonstandard
        FROM matches m
        LEFT JOIN observations o ON o.match_id=m.id
        LEFT JOIN claims c ON c.origin=o.origin
        WHERE m.season BETWEEN ? AND ? AND m.discipline='singles'
        GROUP BY m.id
      ),
      classified AS (
        SELECT *, CASE
          WHEN winners<>1 OR winner NOT IN ('1','2') OR scores<>1 THEN 'missing_or_conflicting_result'
          WHEN nonstandard=1 THEN 'nonstandard_outcome'
          WHEN completed=1 THEN 'completed_with_score'
          WHEN regular_winning_score(score,winner,scope)=1 THEN 'completion_compatible_score'
          ELSE 'completion_unverified'
        END AS result_status
        FROM result
      )
    `;

  function trainingCoverage(from = 2021, to = 2026) {
    validateSeasonRange(from,to);
    const coverage = query(`${trainingClassification}
      SELECT season,scope,result_status,count(*) AS matches,
        sum(match_date IS NOT NULL) AS with_match_date,
        sum(match_date IS NULL AND tournament_dates=1) AS with_tournament_date_only,
        sum(match_date IS NULL AND tournament_dates<>1) AS date_unresolved
      FROM classified GROUP BY season,scope,result_status ORDER BY season,scope,result_status
    `).all(from,to);
    return { reportType:"kortograf-training-coverage", from, to, coverage };
  }

  function withPreparedIndex(indexFile, read) {
    // The audit reads from a separate input index without modifying either database.
    const wasReadOnly = db.prepare("PRAGMA query_only").get().query_only === 1;
    db.exec("PRAGMA query_only=ON");
    let attached = false;
    try {
      db.prepare("ATTACH DATABASE ? AS prepared_overlap").run(indexFile);
      attached = true;
      return read();
    } finally {
      try { if (attached) db.exec("DETACH DATABASE prepared_overlap"); }
      finally { if (!wasReadOnly) db.exec("PRAGMA query_only=OFF"); }
    }
  }

  function trainingOverlap(indexFile, from = 2021, to = 2026) {
    validateSeasonRange(from,to);
    return withPreparedIndex(indexFile, () => {
      const coverage = query(`${trainingClassification},
        candidates AS MATERIALIZED (
          SELECT id, season, scope FROM classified
          WHERE result_status IN ('completed_with_score','completion_compatible_score')
        ),
        coordinates AS MATERIALIZED (
          SELECT DISTINCT c.id, c.season, c.scope, o.source,
            json_extract(o.locator,'$.sourceFile') AS source_file,
            json_extract(o.locator,'$.sourceRow') AS source_row,
            json_extract(o.locator,'$.archive') AS archive_file,
            json_extract(o.locator,'$.archiveRow') AS archive_row
          FROM candidates c JOIN observations o ON o.match_id=c.id
        ),
        linked AS MATERIALIZED (
          SELECT DISTINCT c.id,c.season,c.scope,s.group_id
          FROM prepared_overlap.strict_overlap_members s
          JOIN coordinates c ON c.source=lower(trim(s.provider)) AND c.source_file=s.source
            AND c.source_row=s.source_row AND c.archive_file=s.archive AND c.archive_row=s.archive_row
        ),
        grouped AS MATERIALIZED (
          SELECT season,scope,group_id,count(*) AS matches
          FROM linked GROUP BY season,scope,group_id
        ),
        totals AS (
          SELECT season,scope,count(*) AS score_candidates FROM candidates GROUP BY season,scope
        ),
        group_counts AS (
          SELECT season,scope,count(*) AS matched_strict_groups,
            sum(matches>1) AS strict_groups_with_multiple_candidates
          FROM grouped GROUP BY season,scope
        ),
        suspect AS (
          SELECT l.season,l.scope,count(DISTINCT l.id) AS candidates_in_multiple_match_groups
          FROM linked l JOIN grouped g USING(season,scope,group_id)
          WHERE g.matches>1 GROUP BY l.season,l.scope
        )
        SELECT t.*, coalesce(g.matched_strict_groups,0) AS matched_strict_groups,
          coalesce(g.strict_groups_with_multiple_candidates,0) AS strict_groups_with_multiple_candidates,
          coalesce(s.candidates_in_multiple_match_groups,0) AS candidates_in_multiple_match_groups
        FROM totals t LEFT JOIN group_counts g USING(season,scope) LEFT JOIN suspect s USING(season,scope)
        ORDER BY t.season,t.scope
      `).all(from,to);
      return { reportType:"kortograf-training-overlap",from,to,coverage };
    });
  }

  function trainingMatchDates(indexFile, from, to, source) {
    validateSeasonRange(from,to);
    const aces = source === "acesapi";
    const kind = aces ? "source_match_date" : "match_start_utc";
    const label = aces ? "aces" : "tennisdata";
    return withPreparedIndex(indexFile, () => {
      const sourceRows = query(`
        SELECT substr(date,1,4) AS year,circuit,count(*) AS rows_with_match_date
        FROM prepared_overlap.match_index
        WHERE lower(trim(provider))=? AND date_kind=?
          AND date BETWEEN ? AND ?
        GROUP BY year,circuit ORDER BY year,circuit
      `).all(source,kind,`${from}-01-01`,`${to}-12-31`);
      const coverage = query(`${trainingClassification},
        candidates AS MATERIALIZED (
          SELECT id,season,scope FROM classified
          WHERE result_status IN ('completed_with_score','completion_compatible_score')
            AND match_date IS NULL
        ),
        coordinates AS MATERIALIZED (
          SELECT c.*,o.source AS provider,
            json_extract(o.locator,'$.sourceFile') AS source_file,
            json_extract(o.locator,'$.sourceRow') AS source_row,
            json_extract(o.locator,'$.archive') AS archive_file,
            json_extract(o.locator,'$.archiveRow') AS archive_row
          FROM candidates c JOIN observations o ON o.match_id=c.id
        ),
        dated AS MATERIALIZED (
          SELECT id,circuit,date,pair_key,tournament,round,surface,score,winner_name,
            source,source_row,archive,archive_row
          FROM prepared_overlap.match_index
          WHERE lower(trim(provider))=? AND date_kind=?
            AND date BETWEEN date(?,'-7 days') AND date(?,'+21 days')
        ),
        exact_references AS MATERIALIZED (
          SELECT a.id AS source_id,a.date,r.circuit,lower(trim(r.provider)) AS provider,
            r.source,r.source_row,r.archive,r.archive_row
          FROM dated a CROSS JOIN prepared_overlap.match_index r INDEXED BY match_pair_date
          WHERE r.circuit=a.circuit AND r.pair_key=a.pair_key
            AND r.date BETWEEN date(a.date,'-21 days') AND date(a.date,'+7 days')
            AND r.date_kind='tournament_start' AND nullif(trim(a.pair_key),'') IS NOT NULL
            AND nullif(trim(a.tournament),'') IS NOT NULL AND lower(trim(a.tournament))=lower(trim(r.tournament))
            AND nullif(trim(a.round),'') IS NOT NULL AND lower(trim(a.round))=lower(trim(r.round))
            AND lower(trim(a.surface)) IN ('hard','clay','grass','carpet') AND lower(trim(a.surface))=lower(trim(r.surface))
            AND nullif(trim(a.score),'') IS NOT NULL AND trim(a.score)=trim(r.score)
            AND nullif(trim(a.winner_name),'') IS NOT NULL AND lower(trim(a.winner_name))=lower(trim(r.winner_name))
        ),
        evidence AS MATERIALIZED (
          SELECT DISTINCT c.id,a.id AS source_id,a.date,1 AS linked
          FROM dated a CROSS JOIN coordinates c
          WHERE c.provider=? AND c.scope=a.circuit AND c.source_file=a.source
            AND c.source_row=a.source_row AND c.archive_file=a.archive AND c.archive_row=a.archive_row
          UNION ALL
          SELECT DISTINCT c.id,r.source_id,r.date,0 AS linked
          FROM exact_references r CROSS JOIN coordinates c
          WHERE c.provider=r.provider AND c.scope=r.circuit AND c.source_file=r.source
            AND c.source_row=r.source_row AND c.archive_file=r.archive AND c.archive_row=r.archive_row
        ),
        reused AS (
          SELECT source_id FROM evidence GROUP BY source_id HAVING count(DISTINCT id)>1
        ),
        hit_counts AS (
          SELECT e.id,count(DISTINCT e.source_id) AS sources,count(DISTINCT e.date) AS dates,
            max(e.linked) AS linked,max(r.source_id IS NOT NULL) AS reused
          FROM evidence e LEFT JOIN reused r USING(source_id) GROUP BY e.id
        )
        SELECT c.season,c.scope,count(*) AS candidates_without_match_date,
          sum(CASE WHEN h.sources=1 AND h.dates=1 AND h.reused=0 AND h.linked=1 THEN 1 ELSE 0 END) AS existing_${label}_link_with_date,
          sum(CASE WHEN h.sources=1 AND h.dates=1 AND h.reused=0 AND h.linked=0 THEN 1 ELSE 0 END) AS strict_candidates_requiring_id_review,
          sum(CASE WHEN h.sources>1 OR h.dates>1 OR h.reused=1 THEN 1 ELSE 0 END) AS ambiguous_${label}_matches,
          sum(h.id IS NULL) AS without_${label}_candidate
        FROM candidates c LEFT JOIN hit_counts h USING(id)
        GROUP BY c.season,c.scope ORDER BY c.season,c.scope
      `).all(from,to,source,kind,`${from}-01-01`,`${to}-12-31`,source);
      return {reportType:`kortograf-${label}-date-audit`,from,to,sourceRows,coverage};
    });
  }

  function trainingTennisDataDateFunnelQuery(indexFile, from = 2026, to = from) {
    validateSeasonRange(from,to);
    return withPreparedIndex(indexFile, () => {
      const funnel = query(`${trainingClassification},
        dated AS MATERIALIZED (
          SELECT id,circuit,date,pair_key,tournament,round,surface,score,winner_name
          FROM prepared_overlap.match_index
          WHERE lower(trim(provider))='tennisdataapp' AND date_kind='match_start_utc'
            AND date BETWEEN ? AND ?
        ),
        pair_date AS MATERIALIZED (
          SELECT a.id AS source_id,a.circuit,r.id AS reference_id,
            a.tournament AS source_tournament,r.tournament AS reference_tournament,
            a.round AS source_round,r.round AS reference_round,
            a.surface AS source_surface,r.surface AS reference_surface,
            a.score AS source_score,r.score AS reference_score,
            a.winner_name AS source_winner,r.winner_name AS reference_winner,
            r.source,r.source_row,r.archive,r.archive_row,r.provider
          FROM dated a CROSS JOIN prepared_overlap.match_index r INDEXED BY match_pair_date
          WHERE r.circuit=a.circuit AND r.pair_key=a.pair_key
            AND r.date BETWEEN date(a.date,'-21 days') AND date(a.date,'+7 days')
            AND r.date_kind='tournament_start' AND nullif(trim(a.pair_key),'') IS NOT NULL
        ),
        tournament AS MATERIALIZED (
          SELECT * FROM pair_date WHERE nullif(trim(source_tournament),'') IS NOT NULL
            AND lower(trim(source_tournament))=lower(trim(reference_tournament))
        ),
        tournament_round AS MATERIALIZED (
          SELECT * FROM tournament
          WHERE nullif(trim(source_round),'') IS NOT NULL AND lower(trim(source_round))=lower(trim(reference_round))
        ),
        tournament_round_surface AS MATERIALIZED (
          SELECT * FROM tournament_round
          WHERE lower(trim(source_surface)) IN ('hard','clay','grass','carpet')
            AND lower(trim(reference_surface))=lower(trim(source_surface))
        ),
        tournament_round_surface_score AS MATERIALIZED (
          SELECT * FROM tournament_round_surface
          WHERE nullif(trim(source_score),'') IS NOT NULL AND trim(reference_score)=trim(source_score)
        ),
        exact_match AS MATERIALIZED (
          SELECT * FROM tournament_round_surface_score
          WHERE nullif(trim(source_winner),'') IS NOT NULL
            AND lower(trim(reference_winner))=lower(trim(source_winner))
        ),
        candidate_coordinates AS MATERIALIZED (
          SELECT c.id,c.scope,o.source,
            json_extract(o.locator,'$.sourceFile') AS source_file,
            json_extract(o.locator,'$.sourceRow') AS source_row,
            json_extract(o.locator,'$.archive') AS archive_file,
            json_extract(o.locator,'$.archiveRow') AS archive_row
          FROM classified c JOIN observations o ON o.match_id=c.id
          WHERE c.season BETWEEN ? AND ? AND c.result_status IN
            ('completed_with_score','completion_compatible_score') AND c.match_date IS NULL
        ),
        linked_candidates AS (
          SELECT DISTINCT e.source_id,c.id,c.scope FROM exact_match e
          JOIN candidate_coordinates c ON c.scope=e.circuit AND c.source=lower(trim(e.provider))
            AND c.source_file=e.source AND c.source_row=e.source_row
            AND c.archive_file=e.archive AND c.archive_row=e.archive_row
        ),
        stages AS (
          SELECT circuit,'dated_source_rows' AS stage,count(DISTINCT id) AS source_rows FROM dated GROUP BY circuit
          UNION ALL SELECT circuit,'with_pair_key',count(DISTINCT id) FROM dated
            WHERE nullif(trim(pair_key),'') IS NOT NULL GROUP BY circuit
          UNION ALL SELECT circuit,'pair_and_date_window',count(DISTINCT source_id) FROM pair_date GROUP BY circuit
          UNION ALL SELECT circuit,'same_tournament',count(DISTINCT source_id) FROM tournament GROUP BY circuit
          UNION ALL SELECT circuit,'same_round',count(DISTINCT source_id) FROM tournament_round GROUP BY circuit
          UNION ALL SELECT circuit,'same_surface',count(DISTINCT source_id) FROM tournament_round_surface GROUP BY circuit
          UNION ALL SELECT circuit,'same_score',count(DISTINCT source_id) FROM tournament_round_surface_score GROUP BY circuit
          UNION ALL SELECT circuit,'same_winner',count(DISTINCT source_id) FROM exact_match GROUP BY circuit
          UNION ALL SELECT scope,'links_to_training_candidates',count(DISTINCT source_id)
            FROM linked_candidates GROUP BY scope
        )
        SELECT circuit AS scope,stage,source_rows FROM stages ORDER BY scope,
          CASE stage WHEN 'dated_source_rows' THEN 1 WHEN 'with_pair_key' THEN 2
            WHEN 'pair_and_date_window' THEN 3 WHEN 'same_tournament' THEN 4 WHEN 'same_round' THEN 5
            WHEN 'same_surface' THEN 6 WHEN 'same_score' THEN 7 WHEN 'same_winner' THEN 8 ELSE 9 END
      `).all(from,to,`${from}-01-01`,`${to}-12-31`,from,to);
      const sourceRows = query(`
        SELECT id,circuit,date,name1,name2,tournament,round,surface,score,winner_name
        FROM prepared_overlap.match_index
        WHERE lower(trim(provider))='tennisdataapp' AND date_kind='match_start_utc'
          AND date BETWEEN ? AND ?
      `).all(`${from}-01-01`,`${to}-12-31`);
      const references = query(`
        SELECT circuit,date,name1,name2,tournament,round,surface,score,winner_name,
          lower(trim(provider)) AS provider,source,source_row,archive,archive_row
        FROM prepared_overlap.match_index
        WHERE date_kind='tournament_start' AND date BETWEEN ? AND ?
          AND circuit IN ('ATP','WTA')
      `).all(`${from-1}-01-01`,`${to+1}-12-31`);
      const referenceNames = new Map(['ATP','WTA'].map(scope=>[scope,new Set()]));
      const referenceSamples = new Map(['ATP','WTA'].map(scope=>[scope,[]]));
      for (const reference of references) {
        const names=referenceNames.get(reference.circuit);
        if (!names) continue;
        for (const name of [reference.name1,reference.name2]) {
          if (name?.trim()) names.add(name.trim().toLowerCase());
        }
        const samples=referenceSamples.get(reference.circuit);
        if (samples.length<3 && reference.name1?.trim() && reference.name2?.trim()) {
          samples.push({date:reference.date,name1:reference.name1,name2:reference.name2,
            tournament:reference.tournament,round:reference.round,surface:reference.surface,
            score:reference.score,provider:reference.provider});
        }
      }
      const pairKey = (circuit,a,b) => {
        const names = [String(a ?? '').trim().toLowerCase(),String(b ?? '').trim().toLowerCase()].sort();
        return names[0] && names[1] ? `${circuit}\u0000${names[0]}\u0000${names[1]}` : null;
      };
      const byPlayers = new Map();
      for (const reference of references) {
        const key = pairKey(reference.circuit,reference.name1,reference.name2);
        if (!key) continue;
        const matches = byPlayers.get(key) ?? [];
        matches.push(reference);
        byPlayers.set(key,matches);
      }
      const candidateCoordinates = new Set(query(`${trainingClassification}
        SELECT DISTINCT c.scope,lower(trim(o.source)),
          json_extract(o.locator,'$.sourceFile'),json_extract(o.locator,'$.sourceRow'),
          json_extract(o.locator,'$.archive'),json_extract(o.locator,'$.archiveRow')
        FROM classified c JOIN observations o ON o.match_id=c.id
        WHERE c.season BETWEEN ? AND ? AND c.result_status IN
          ('completed_with_score','completion_compatible_score') AND c.match_date IS NULL
      `).all(from,to).map(row => JSON.stringify(Object.values(row))));
      const nameCounts = new Map();
      const playerNameCounts = new Map(['ATP','WTA'].map(scope=>[scope,
        {sourceRows:0,rowsWithBothNames:0,rowsWithAnyNameKnown:0,rowsWithBothNamesKnown:0}]));
      const sourceSamples = new Map(['ATP','WTA'].map(scope=>[scope,[]]));
      const stages = ['same_name_pair_within_year','same_name_pair_in_date_window','same_tournament',
        'same_round','same_surface','same_score','same_winner','links_to_training_candidates'];
      for (const scope of ['ATP','WTA']) {
        nameCounts.set(scope,Object.fromEntries(stages.map(stage => [stage,0])));
      }
      for (const sourceRow of sourceRows) {
        const counts = nameCounts.get(sourceRow.circuit);
        if (!counts) continue;
        const playerCounts=playerNameCounts.get(sourceRow.circuit);
        const playerNames=[sourceRow.name1,sourceRow.name2].filter(name=>name?.trim()).map(name=>name.trim().toLowerCase());
        playerCounts.sourceRows++;
        if (playerNames.length===2) playerCounts.rowsWithBothNames++;
        const knownNames=referenceNames.get(sourceRow.circuit);
        const knownSides=playerNames.filter(name=>knownNames.has(name)).length;
        if (knownSides>0) playerCounts.rowsWithAnyNameKnown++;
        if (playerNames.length===2 && knownSides===2) playerCounts.rowsWithBothNamesKnown++;
        const samples=sourceSamples.get(sourceRow.circuit);
        if (samples.length<3 && sourceRow.name1?.trim() && sourceRow.name2?.trim()) {
          samples.push({date:sourceRow.date,name1:sourceRow.name1,name2:sourceRow.name2,
            tournament:sourceRow.tournament,round:sourceRow.round,surface:sourceRow.surface,
            score:sourceRow.score});
        }
        const matches = byPlayers.get(pairKey(sourceRow.circuit,sourceRow.name1,sourceRow.name2)) ?? [];
        const withinYear = matches.filter(reference => {
          const gap = (Date.parse(reference.date)-Date.parse(sourceRow.date))/86400000;
          return gap >= -366 && gap <= 366;
        });
        if (withinYear.length) counts.same_name_pair_within_year++;
        const datedMatches = withinYear.filter(reference => {
          const gap = (Date.parse(reference.date)-Date.parse(sourceRow.date))/86400000;
          return gap >= -21 && gap <= 7;
        });
        if (datedMatches.length) counts.same_name_pair_in_date_window++;
        const tournamentMatches = datedMatches.filter(reference =>
          sourceRow.tournament?.trim() && sourceRow.tournament.trim().toLowerCase()===reference.tournament?.trim().toLowerCase());
        if (tournamentMatches.length) counts.same_tournament++;
        const roundMatches = tournamentMatches.filter(reference =>
          sourceRow.round?.trim() && sourceRow.round.trim().toLowerCase()===reference.round?.trim().toLowerCase());
        if (roundMatches.length) counts.same_round++;
        const surfaceMatches = roundMatches.filter(reference =>
          ['hard','clay','grass','carpet'].includes(sourceRow.surface?.trim().toLowerCase()) &&
          sourceRow.surface.trim().toLowerCase()===reference.surface?.trim().toLowerCase());
        if (surfaceMatches.length) counts.same_surface++;
        const scoreMatches = surfaceMatches.filter(reference =>
          sourceRow.score?.trim() && sourceRow.score.trim()===reference.score?.trim());
        if (scoreMatches.length) counts.same_score++;
        const winnerMatches = scoreMatches.filter(reference =>
          sourceRow.winner_name?.trim() && sourceRow.winner_name.trim().toLowerCase()===reference.winner_name?.trim().toLowerCase());
        if (winnerMatches.length) counts.same_winner++;
        const linksCandidate = winnerMatches.some(reference => candidateCoordinates.has(JSON.stringify([
          sourceRow.circuit,reference.provider,reference.source,reference.source_row,reference.archive,reference.archive_row
        ])));
        if (linksCandidate) counts.links_to_training_candidates++;
      }
      const nameBasedFunnel = Array.from(nameCounts,([scope,counts]) => [
        ...[{stage:'dated_source_rows',source_rows:sourceRows.filter(row=>row.circuit===scope).length}],
        ...stages.map(stage=>({stage,source_rows:counts[stage]}))
      ].map(row=>({scope,...row}))).flat();
      const nameDiagnostics=Array.from(playerNameCounts,([scope,counts])=>({scope,...counts,
        distinctReferencePlayerNames:referenceNames.get(scope).size,
        sourceSamples:sourceSamples.get(scope),referenceSamples:referenceSamples.get(scope)}));
      return {reportType:"kortograf-tennisdata-date-funnel",from,to,funnel,nameBasedFunnel,nameDiagnostics};
    });
  }

  const trainingAcesDates = (indexFile,from = 2021,to = 2026) => trainingMatchDates(indexFile,from,to,"acesapi");
  const trainingTennisDataDates = (indexFile,from = 2026,to = from) =>
    trainingMatchDates(indexFile,from,to,"tennisdataapp");
  const trainingTennisDataDateFunnel = (indexFile,from = 2026,to = from) =>
    trainingTennisDataDateFunnelQuery(indexFile,from,to);

  function report() {
    const count = sql => query(sql).get().n;
    return {
      scopeNote: "Counts reflect resolved links in this import; unidentified cross-source duplicates may remain",
      canonicalMatches: count("SELECT count(*) n FROM matches"),
      linkedObservations: count("SELECT count(*) n FROM observations WHERE match_id IS NOT NULL"),
      mergedObservations: count("SELECT count(*)-(SELECT count(*) FROM matches) n FROM observations WHERE match_id IS NOT NULL"),
      isolatedObservations: count("SELECT count(*) n FROM observations WHERE match_id IS NULL AND reason<>'indexed_profile'"),
      blockedProviderIds: count("SELECT count(*) n FROM blocked_external"),
      indexedProfiles: count("SELECT count(*) n FROM observations WHERE reason='indexed_profile'"),
      providerFileOverlap: query(`SELECT source,count(*) shared_provider_ids FROM (
        SELECT source,source_key FROM observations
        WHERE source IN ('huggingfaceodds','opentennisdata') AND source_key IS NOT NULL
        GROUP BY source,source_key
        HAVING count(DISTINCT coalesce(json_extract(locator,'$.sourceFile'),json_extract(locator,'$.file')))>1
      ) GROUP BY source`).all(),
      missingMatchDate: count("SELECT count(*) n FROM matches WHERE match_date IS NULL"),
      players: count("SELECT count(*) n FROM entity WHERE kind='player'"),
      tournaments: count("SELECT count(*) n FROM entity WHERE kind='tournament'"),
      isolationReasons: query("SELECT reason,count(*) n FROM observations WHERE reason IS NOT NULL GROUP BY reason").all(),
      sourceCoverage: query("SELECT source,count(*) total,count(match_id) linked FROM observations GROUP BY source").all(),
      unknownOutcome: count(`SELECT count(*) n FROM matches m WHERE NOT EXISTS (
        SELECT 1 FROM observations o JOIN claims c USING(origin) WHERE o.match_id=m.id AND c.field='status'
      )`),
      fieldCoverage: query(`SELECT field,count(DISTINCT match_id) matches,
        count(known_at) time_stamped_claims FROM claims JOIN observations USING(origin)
        WHERE match_id IS NOT NULL GROUP BY field`).all(),
      fieldConflicts: query(`SELECT field,count(*) matches FROM (
        SELECT field,match_id FROM claims JOIN observations USING(origin) WHERE match_id IS NOT NULL
        GROUP BY field,match_id HAVING count(DISTINCT value)>1
      ) GROUP BY field`).all(),
      integrity: query("PRAGMA quick_check").all().map(row => row.quick_check),
      foreignKeyErrors: query("SELECT count(*) n FROM pragma_foreign_key_check").get().n
    };
  }
  return {
    ingestBatch, confirmLink, confirmLinks, attachReviewed, fields, unlink, report, trainingCoverage, trainingOverlap, trainingAcesDates, trainingTennisDataDates,
    trainingTennisDataDateFunnel,
    checkpoint: input => query("SELECT * FROM checkpoints WHERE input=?").get(input),
    close: () => db.close()
  };
}
