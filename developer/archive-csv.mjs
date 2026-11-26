// The Developer archive uses the existing French and winner/loser CSV schemas.
const DELIMITERS = [",", ";", "\t"];

function delimiterFor(header) {
  const counts = DELIMITERS.map(() => 0);
  let quoted = false;
  for (const c of header) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && DELIMITERS.includes(c)) counts[DELIMITERS.indexOf(c)]++;
  }
  return DELIMITERS[counts.indexOf(Math.max(...counts))];
}

export async function* csvRecords(blob) {
  const reader = blob.stream().pipeThrough(new TextDecoderStream("utf-8", { fatal: true })).getReader();
  let header = "", delimiter, row = [], cell = "", state = "plain", skipLF = false, record = 0;
  const finish = () => {
    const fields = [...row, cell];
    row = [];
    cell = "";
    state = "plain";
    record++;
    return { fields, record };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const c of value) {
        if (!delimiter) {
          if (c !== "\n" && c !== "\r") {
            header += c;
            if (header.length > 65536) throw Error("Слишком длинный заголовок CSV.");
            continue;
          }
          delimiter = delimiterFor(header);
          const fields = [];
          let item = "", quoted = false;
          for (const char of header) {
            if (char === '"') quoted = !quoted;
            else if (char === delimiter && !quoted) { fields.push(item); item = ""; }
            else item += char;
          }
          if (quoted) throw Error("Незакрытая кавычка заголовка CSV.");
          fields.push(item);
          skipLF = c === "\r";
          yield { fields, record: ++record };
          continue;
        }
        if (skipLF) {
          skipLF = false;
          if (c === "\n") continue;
        }
        if (state === "quoted") {
          if (c === '"') state = "closed";
          else cell += c;
        } else if (state === "closed" && c === '"') {
          cell += '"';
          state = "quoted";
        } else if (c === delimiter) {
          row.push(cell);
          if (row.length > 2048) throw Error("Слишком много полей в записи " + (record + 1) + ".");
          cell = "";
          state = "plain";
        } else if (c === "\n" || c === "\r") {
          skipLF = c === "\r";
          const next = finish();
          if (next.fields.some(field => field.trim())) yield next;
        } else if (state === "closed" || (c === '"' && cell)) {
          throw Error("Неверные кавычки в записи " + (record + 1) + ".");
        } else if (c === '"') {
          state = "quoted";
        } else {
          cell += c;
        }
        if (cell.length > 262144) throw Error("Слишком длинное поле в записи " + (record + 1) + ".");
      }
    }
    if (!delimiter) throw Error("CSV должен содержать заголовок и строки данных.");
    if (state === "quoted") throw Error("Незакрытая кавычка в записи " + (record + 1) + ".");
    if (cell.trim() || row.length || state === "closed") yield finish();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function archiveSchema(fields) {
  const headers = fields.map(v => v.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw Error("Пустые или повторяющиеся заголовки CSV.");
  const ix = new Map(headers.map((name, i) => [name, i]));
  const french = ["joueur1", "joueur1_id", "joueur2", "joueur2_id", "vainqueur_id", "date"].every(k => ix.has(k));
  const standard = [["winner_name", "winner"], ["loser_name", "loser"], ["tourney_date", "date", "match_date"]]
    .every(aliases => aliases.some(k => ix.has(k)));
  const tennisData = ["home_name", "away_name", "home_id", "away_id", "winner_code", "date_timestamp", "match_id"].every(k => ix.has(k));
  if (!french && !standard && !tennisData) throw Error("Схема CSV не распознана.");
  return { ix, headers, french, tennisData, width: headers.length };
}

// Preserve the source status even when no score is available. A blank score
// alone does not establish how the match ended.
function classifyScore(score, status) {
  const evidence = score + " " + status;
  if (/\b(ret(?:ired|irement)?|abandon du joueur)\b/i.test(evidence)) return "retirement";
  if (/\b(w\s*\/?\s*o|walkover|forfait)\b/i.test(evidence)) return "walkover";
  if (/\b(def(?:ault(?:ed)?)?|disqualified)\b/i.test(evidence)) return "default";
  if (/\b(abandoned|cancelled|canceled|suspended)\b/i.test(evidence)) return "interrupted";
  return score ? "score_present" : "unknown";
}

function normalizeDate(value) {
  const parts = /^(\d{4})-?(\d{2})-?(\d{2})(?:[ T].*)?$/.exec(value);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const iso = [year, month, day].join("-");
  const date = new Date(iso);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

const surfaces = new Map(Object.entries({
  clay: "clay", "terre battue": "clay", hard: "hard", dur: "hard",
  "dur intérieur": "hard", "indoor hard": "hard",
  grass: "grass", gazon: "grass", carpet: "carpet", "moquette intérieur": "carpet"
}));
const decimalOdds = value => {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 1 && n <= 100 ? n : null;
};

export function normalizeArchiveRecord(fields, record, schema, archive, member, fileIndex) {
  const get = (...keys) => {
    const key = keys.find(k => schema.ix.has(k));
    return (fields[schema.ix.get(key)] ?? "").trim();
  };
  const french = schema.french;
  const td = schema.tennisData;
  const player1Name = french ? get("joueur1") : td ? get("home_name") : get("winner_name", "winner");
  const player2Name = french ? get("joueur2") : td ? get("away_name") : get("loser_name", "loser");
  const player1Id = french ? get("joueur1_id") : td ? get("home_id") : get("winner_id");
  const player2Id = french ? get("joueur2_id") : td ? get("away_id") : get("loser_id");
  const winnerId = french ? get("vainqueur_id") : td ? (get("winner_code") === "1" ? player1Id : get("winner_code") === "2" ? player2Id : "") : player1Id;
  const distinct = player1Name && player2Name && (!player1Id || !player2Id || player1Id !== player2Id) &&
    player1Name.toLowerCase() !== player2Name.toLowerCase();
  const winnerSide = distinct && (!(french || td) || (winnerId && winnerId === player1Id)) ? 1 :
    distinct && (french || td) && winnerId && winnerId === player2Id ? 2 : null;
  const rawDate = td ? get("date_timestamp") : get("date", "match_date", "tourney_date");
  const instant = td && /^\d{10}$/.test(rawDate) ? new Date(Number(rawDate) * 1000) : null;
  const date = td ? (instant && Number.isFinite(+instant) ? instant.toISOString().slice(0, 10) : null) : normalizeDate(rawDate);
  const tournament = get("tournoi", "tourney_name", "tournament");
  const tournamentId = get("tournoi_id", "tourney_id", "tournament_id");
  const category = get("categorie", "category", "tourney_level");
  const round = get("tour", "round");
  const rawSurface = get("surface");
  const surface = surfaces.get(rawSurface.toLowerCase()) ?? "unknown";
  const matchId = get("match_id");
  const score = td ? Array.from({length: 5}, (_, i) => [get(`home_set_${i+1}_score`), get(`away_set_${i+1}_score`)]).filter(pair => pair.every(v => /^\d+$/.test(v))).map(pair => pair.join("-")).join(" ") : get("score");
  const rawStatus = td ? [get("status"), get("status_extra")].filter(Boolean).join(" ") : get("statut", "status", "result_status");
  const scoreClass = classifyScore(score, rawStatus);
  const openOdds = [get("cote1_ouverture"), get("cote2_ouverture")];
  const closeOdds = [get("cote1_cloture"), get("cote2_cloture")];
  const issues = [];
  if (fields.length !== schema.width) issues.push("field_count");
  if (!distinct || ((french || td) && (!player1Id || !player2Id))) issues.push("invalid_players");
  if (!winnerSide) issues.push("winner_unknown");
  if (!date) issues.push("date_unknown");
  if (!category) issues.push("category_unknown");
  if (surface === "unknown") issues.push("surface_unknown");
  if (!score) issues.push("missing_score");
  if (scoreClass === "score_present" && !/^\d+[-:]\d+(?:\(\d+\))?(?:\s+\d+[-:]\d+(?:\(\d+\))?)*$/.test(score)) issues.push("score_format");
  if (openOdds.some(v => v && decimalOdds(v) === null) || closeOdds.some(v => v && decimalOdds(v) === null)) issues.push("odds_format");
  const source = archive.sourceHint && archive.sourceHint !== "unknown" ? archive.sourceHint : archive.id;
  const tourScope = /(?:^|[\\/_-])wta(?:[\\/_-]|$)/i.test(member) ? "WTA" : /(?:^|[\\/_-])atp(?:[\\/_-]|$)/i.test(member) ? "ATP" : get("genre", "gender") || "unknown";
  const identityScope = [td ? "tennisdataapp" : source, td ? "home_away" : french ? "fr" : "standard", td ? get("tour_type") : tourScope];
  const row = {
    id: archive.id + ":" + fileIndex + ":" + record, archiveId: archive.id, member, fileIndex, row: record,
    matchId, date, rawDate, tournament, tournamentId, category, round, surface, rawSurface,
    indoor: /intérieur|indoor/i.test(rawSurface) || null, gender: get("genre", "gender"),
    player1Id, player2Id, player1Name, player2Name, winnerId, winnerSide,
    winnerName: winnerSide === 1 ? player1Name : winnerSide === 2 ? player2Name : "",
    score, rawStatus, scoreClass, openOdds: openOdds.map(decimalOdds), closeOdds: closeOdds.map(decimalOdds),
    matchWinnerOdds: td ? [get("home_odds_match_winner"), get("away_odds_match_winner")].map(decimalOdds) : null,
    firstSetWinnerOdds: td ? [get("home_odds_first_set_winner"), get("away_odds_first_set_winner")].map(decimalOdds) : null,
    dateKind: td ? "source_timestamp_utc" : schema.ix.has("date") || schema.ix.has("match_date") ? "source_match_date" : "tournament_date",
    sourceRecord: Object.fromEntries(schema.headers.map((key, i) => [key, fields[i] ?? null])),
    sourceExtraFields: fields.slice(schema.width),
    issues, reviewStatus: "local_research_only"
  };
  if (fields.length === schema.width && matchId) row.sourceKey = [...identityScope, matchId];
  if (fields.length === schema.width && distinct && date && tournamentId && player1Id && player2Id) {
    row.naturalKey = [...identityScope, date, tournamentId, ...[player1Id, player2Id].sort()];
  }
  return row;
}
