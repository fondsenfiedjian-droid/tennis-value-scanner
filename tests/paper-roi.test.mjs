import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('  function archivePaperRoi(rows, stake=1){');
const end=html.indexOf('\n  function renderArchive()',start);
assert.ok(start>=0&&end>start,'paper ROI function must remain available in index.html');
const archivePaperRoi=vm.runInNewContext(html.slice(start,end)+'\narchivePaperRoi',{});

const before=Date.parse('2026-11-21T10:00:00.000Z');
const later=Date.parse('2026-11-21T10:30:00.000Z');
const matchDate='2026-11-21T11:00:00.000Z';
function row(overrides={}){
  return {matchId:101,matchKey:'match-101',matchDate,captureStatus:'upcoming',bookmaker:'Winamax',
    model:'general-elo-v2',modelVersion:'2',side:'A',odds:2.5,probability:45,ev:12,
    capturedAt:before,resultOutcome:'completed',resultWinner:1,resultVersion:1,
    resultSource:'live_tennis_api',...overrides};
}

test('settles a winning flat-stake pick at decimal odds',()=>{
  const result=archivePaperRoi([row()]);
  assert.equal(result.bets,1);assert.equal(result.wins,1);assert.equal(result.losses,0);
  assert.equal(result.profit,1.5);assert.equal(result.turnover,1);assert.equal(result.roi,150);
});
test('uses the latest snapshot even when its EV is no longer positive',()=>{
  const result=archivePaperRoi([row(),row({capturedAt:later,ev:-3,odds:1.8})]);
  assert.equal(result.bets,0);assert.equal(result.profit,0);
});
test('selects the higher positive-EV side from the latest snapshot only',()=>{
  const result=archivePaperRoi([row(),row({side:'B',odds:3,ev:18,capturedAt:later})]);
  assert.equal(result.bets,1);assert.equal(result.wins,0);assert.equal(result.losses,1);
  assert.equal(result.profit,-1);
});
test('excludes an EV tie across opposite sides as ambiguous',()=>{
  const result=archivePaperRoi([row({capturedAt:later}),row({side:'B',ev:12,capturedAt:later})]);
  assert.equal(result.bets,0);assert.equal(result.ambiguous,1);
});
test('uses the latest authoritative result version, not an obsolete winner',()=>{
  const result=archivePaperRoi([row({resultWinner:2,resultVersion:1}),row({side:'B',resultWinner:1,resultVersion:2})]);
  assert.equal(result.bets,1);assert.equal(result.losses,1);
});
test('excludes conflicting outcomes in the latest result version',()=>{
  const result=archivePaperRoi([row(),row({side:'B',resultOutcome:'retired',resultWinner:null,resultVersion:1})]);
  assert.equal(result.bets,0);
});
test('excludes post-start, non-Winamax, non-v2 and non-positive-EV rows',()=>{
  const rows=[
    row({capturedAt:Date.parse(matchDate)}),
    row({bookmaker:'Betclic'}),
    row({modelVersion:'1'}),
    row({ev:0})
  ];
  assert.equal(archivePaperRoi(rows).bets,0);
});
