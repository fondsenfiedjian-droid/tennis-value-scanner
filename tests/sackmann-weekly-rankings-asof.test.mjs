import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('weekly rankings join as-of match date without future leakage',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rank-asof-test-'));
  try{
    const matches=path.join(dir,'matches.csv'),rankings=path.join(dir,'rankings.csv'),out=path.join(dir,'joined.csv');
    fs.writeFileSync(matches,
      'tourney_date,tourney_id,winner_id,loser_id,score\n'+
      '20200108,1,101,102,6-4 6-4\n'+
      '20200115,2,101,103,6-3 6-3\n'+
      '20200122,3,104,102,6-2 6-2\n');
    fs.writeFileSync(rankings,
      'tour,ranking_date,player_id,rank,points\n'+
      'atp,20200106,101,10,1000\n'+
      'atp,20200106,102,20,800\n'+
      'atp,20200113,101,8,1100\n'+
      'atp,20200115,101,1,1500\n'+
      'atp,20200120,103,30,600\n'+
      'atp,20200120,104,40,500\n');
    execFileSync(process.execPath,['scripts/sackmann-weekly-rankings-asof.mjs','--tour','atp','--matches',matches,'--rankings',rankings,'--output',out],{cwd:process.cwd(),stdio:'pipe'});
    const rows=fs.readFileSync(out,'utf8').trim().split('\n');
    assert.equal(rows.length,4);
    assert.match(rows[1],/,10,20200106,1000,20,20200106,800$/);
    assert.match(rows[2],/6-3 6-3,8,20200113,1100,,,$/);
    assert.match(rows[3],/6-2 6-2,40,20200120,500,20,20200106,800$/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
