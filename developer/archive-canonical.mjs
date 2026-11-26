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

export function openCanonicalArchive(path) {
  const db = new DatabaseSync(path);
  try {
    const appId = db.prepare("PRAGMA application_id").get().application_id;
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name);
    if (appId !== 0x54565341 && (appId !== 0 || (tables.length &&
        !["external_id","claims","checkpoints","observations"].every(name => tables.includes(name))))) {
      throw Error("Output database belongs to another application");
    }
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA cache_size=-16000; PRAGMA temp_store=FILE;");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 0 && version !== 1) throw Error("Unsupported canonical archive version");
    db.exec("BEGIN IMMEDIATE");
    db.exec(schema);
    db.exec("PRAGMA application_id=0x54565341; PRAGMA user_version=1; COMMIT");
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

  function confirmLink({ kind, source, scope, externalId, targetSource, targetId, evidence }) {
    if (!["player", "tournament"].includes(kind) ||
        ![source, scope, externalId, targetSource, targetId, evidence].every(value => typeof value === "string" && value.trim())) {
      throw Error("A confirmed identity link requires two scoped identifiers and documented evidence");
    }
    return transaction(() => {
      const existing = external(kind, source, scope, externalId);
      const target = external(kind, targetSource, scope, targetId) ?? id(kind, targetSource, scope, targetId);
      if (existing && existing !== target) throw Error("Link would rewrite an existing canonical identity");
      query("INSERT OR IGNORE INTO entity VALUES(?,?,?)").run(target, kind, scope);
      const insert = query("INSERT OR IGNORE INTO external_id VALUES(?,?,?,?,?,?)");
      insert.run(kind, targetSource, scope, targetId, target, evidence);
      insert.run(kind, source, scope, externalId, target, evidence);
      return target;
    });
  }

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
    ingestBatch, confirmLink, fields, unlink, report,
    checkpoint: input => query("SELECT * FROM checkpoints WHERE input=?").get(input),
    close: () => db.close()
  };
}
