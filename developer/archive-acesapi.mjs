// AcesAPI page adapter. Preserve source records and isolate IDs by tour.
export async function* acesRecords(blob, archive, member, fileIndex) {
  const page = JSON.parse(await blob.text()).data;
  if (!["ATP","WTA"].includes(page?.tour) || !Array.isArray(page.matches) ||
      !page.matches.length || page.matches.length > 500) throw Error("Invalid AcesAPI page");
  const tour = page.tour;
  const ids = new Set();
  for (const [i,m] of page.matches.entries()) {
    if (!m || typeof m !== "object" || typeof m.match_id !== "string" || !m.match_id ||
        ids.has(m.match_id) || !Number.isInteger(m.season)) throw Error("Invalid AcesAPI match identity");
    ids.add(m.match_id);
    const str = v => typeof v === "string" ? v.trim() : "";
    const player1Id = str(m.player1_id), player2Id = str(m.player2_id), winnerId = str(m.winner_id);
    const player1Name = str(m.player1), player2Name = str(m.player2);
    const distinct = player1Id && player2Id && player1Id !== player2Id && player1Name && player2Name;
    const winnerSide = distinct && winnerId === player1Id ? 1 : distinct && winnerId === player2Id ? 2 : null;
    const rawDate = str(m.match_date);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && Number.isFinite(Date.parse(rawDate)) &&
      new Date(rawDate).toISOString().slice(0,10) === rawDate ? rawDate : null;
    const rawSurface = str(m.surface), surface = ["hard","clay","grass","carpet"].includes(rawSurface.toLowerCase()) ? rawSurface.toLowerCase() : "unknown";
    const score = str(m.score), rawStatus = str(m.status), outcome = str(m.outcome);
    const scoreClass = ({retired:"retirement",retirement:"retirement",walkover:"walkover",default:"default",defaulted:"default",cancelled:"interrupted",abandoned:"interrupted"})[outcome.toLowerCase()] ?? (score ? "score_present" : "unknown");
    const issues = ["category_unknown"];
    if (!distinct) issues.push("invalid_players");
    if (!winnerSide) issues.push("winner_unknown");
    if (!date) issues.push("date_unknown");
    if (surface === "unknown") issues.push("surface_unknown");
    if (!score) issues.push("missing_score");
    const tournamentId = str(m.tournament_id), record = i+1;
    const row = {id: archive.id+":"+fileIndex+":"+record, archiveId:archive.id, member,fileIndex,row:record,
      matchId:m.match_id,date,rawDate,tournament:str(m.tournament),tournamentId,category:"",round:str(m.round),
      surface,rawSurface,indoor:typeof m.indoor==="boolean"?m.indoor:null,gender:tour==="ATP"?"M":"F",
      tour,season:m.season,player1Id,player2Id,player1Name,player2Name,winnerId,winnerSide,
      winnerName:winnerSide===1?player1Name:winnerSide===2?player2Name:"",
      score,rawStatus,outcome,scoreClass,openOdds:[null,null],closeOdds:[null,null],issues,
      sourceKey:["acesapi",tour,m.match_id],reviewStatus:"local_research_only",sourceRecord:m};
    if (distinct && date && tournamentId) row.naturalKey=["acesapi",tour,date,tournamentId,...[player1Id,player2Id].sort()];
    yield row;
  }
}
