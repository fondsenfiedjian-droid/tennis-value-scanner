import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('  function normalizePlayer('),end=source.indexOf('  function normalizeTour(',start);
assert.ok(start>=0&&end>start);
const ttl=source.match(/ODDS_FRESHNESS_MAX_AGE_MS\s*=\s*([^;\n]+)/)[1];
const run=new Function('quotes','match',`const cachedOdds=quotes;const ODDS_FRESHNESS_MAX_AGE_MS=${ttl};const playerName=x=>x;const matchDate=m=>new Date(m.start);${source.slice(start,end)};return oddsForMatch(match);`);
const now=Date.now(),startTime=new Date(now+3600000).toISOString();
const match={players:{p1:'Jannik Sinner',p2:'Carlos Alcaraz'},tournament_name:'Davis Cup Finals',start:startTime};
function pair(id='1',bookmaker='Winamax',homeTeam='Jannik Sinner',awayTeam='Carlos Alcaraz',extra={}){
return ['home','away'].map(outcome=>({bookmaker,bookmakerCountry:'FR',sport:'tennis',marketType:'match_winner',eventId:id,homeTeam,awayTeam,eventName:homeTeam+' - '+awayTeam,competition:'Davis Cup Finals',startTime,scrapedAt:new Date(now-60000).toISOString(),oddsDecimal:2,outcome,...extra}));
}
test('reject ambiguous complete events from same provider',()=>assert.equal(run([...pair(),...pair('2')],match).length,0));
test('preserve independent unambiguous provider',()=>assert.deepEqual(run([...pair(),...pair('2'),...pair('1','Betclic')],match).map(q=>q.bookmaker),['Betclic','Betclic']));
test('accept same event ID across providers',()=>assert.equal(run([...pair(),...pair('1','Betclic')],match).length,4));
test('accept Davis Cup singles',()=>assert.equal(run(pair(),match).length,2));
test('reject national team tie',()=>assert.equal(run(pair('1','Winamax','Grande-Bretagne','Allemagne'),match).length,0));
test('accept reversed players',()=>assert.equal(run(pair('1','Winamax','Carlos Alcaraz','Jannik Sinner'),match).length,2));
test('reject stale quotes',()=>assert.equal(run(pair('1','Winamax',undefined,undefined,{scrapedAt:new Date(now-7*3600000).toISOString()}),match).length,0));
test('reject incomplete pair',()=>assert.equal(run(pair().slice(0,1),match).length,0));
test('reject started match',()=>assert.equal(run(pair(),{...match,start:new Date(now-1000).toISOString()}).length,0));
