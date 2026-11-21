import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const importer=path.join(root,'scripts/sackmann-weekly-rankings-import.mjs');

test('weekly ranking importer deduplicates safely and quarantines conflicts across sort chunks',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-import-test-'));
  try{
    const input=path.join(dir,'rankings.csv');
    const out=path.join(dir,'out');
    const lines=['ranking_date,rank,player,points'];
    for(let i=1;i<=1000;i++) lines.push('20240101,'+(i+10)+','+i+','+(1000-i));
    lines.push(
      '20240101,500,9001,',
      '20240101,500,9001,25',
      '20240101,600,9002,10',
      '20240101,600,9002,10',
      '20240101,700,9003,8',
      '20240101,701,9003,7',
      '20240101,800,9004,6',
      '20240101,800,9004,5'
    );
    fs.writeFileSync(input,lines.join('\n')+'\n');
    const run=spawnSync(process.execPath,[importer,'--tour','atp','--out-dir',out,'--chunk-size','1000',input],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(fs.readFileSync(path.join(out,'atp-weekly-rankings-report.json'),'utf8'));
    assert.equal(report.inputRows,1008);
    assert.equal(report.canonicalRows,1002);
    assert.equal(report.quarantinedRows,4);
    assert.equal(report.conflictGroups,2);
    assert.equal(report.exactDuplicateRowsRemoved,1);
    assert.equal(report.filledPointsDuplicateRowsResolved,1);
    const canonical=fs.readFileSync(path.join(out,'atp-weekly-rankings.csv'),'utf8');
    assert.match(canonical,/atp,20240101,9001,500,25/);
    assert.match(canonical,/atp,20240101,9002,600,10/);
    assert.doesNotMatch(canonical,/9003|9004/);
    const quarantine=fs.readFileSync(path.join(out,'atp-weekly-rankings-quarantine.csv'),'utf8');
    assert.match(quarantine,/9003,700,8/);
    assert.match(quarantine,/9003,701,7/);
    assert.match(quarantine,/9004,800,6/);
    assert.match(quarantine,/9004,800,5/);
    assert.equal(fs.readFileSync(input,'utf8').split('\n').length,lines.length+1,'raw input must remain unchanged');
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
