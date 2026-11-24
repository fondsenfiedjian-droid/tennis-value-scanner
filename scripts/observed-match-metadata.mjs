export function extractObservedMatchMetadata(match = {}) {
  const p1 = match.players?.p1 ?? {};
  const p2 = match.players?.p2 ?? {};
  const first = (object, keys) => {
    for (const key of keys) {
      const value = object?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };
  return {
    player1: first(p1, ["name"]) ?? first(match, ["player1", "player_1", "player1_name", "player_1_name", "home_player", "playerA"]),
    player2: first(p2, ["name"]) ?? first(match, ["player2", "player_2", "player2_name", "player_2_name", "away_player", "playerB"]),
    player1_id: first(p1, ["id", "player_id", "playerId"]),
    player2_id: first(p2, ["id", "player_id", "playerId"]),
    date: first(match, ["scheduled_time", "date", "start_time", "match_date", "startDate", "datetime"]),
    surface: first(match, ["surface", "court_surface"]),
    tournament: first(match, ["tournament", "event_name", "competition"]),
    tournament_id: first(match, ["tournament_id", "tournamentId"]),
    round: first(match, ["round", "round_name"]),
    status: first(match, ["status", "event_status"]),
    winner: first(match, ["winner"])
  };
}
