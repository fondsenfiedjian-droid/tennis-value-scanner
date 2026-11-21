import test from "node:test";
import assert from "node:assert/strict";
import { predictMatchWinner } from "../winner-formula.mjs";
import { runWinnerFormulaResearch } from "../scripts/winner-formula-research.mjs";

const model={
  featureNames:["baseLogit","matches3","matches7","playingDays7","restDays","minutes7","durationCoverage7","workloadAvailable"],
  means:[0,0,0,0,0,0,0,0],
  scales:[1,1,1,1,1,1,1,1],
  coefficients:[0,1,-0.2,-0.1,-0.1,0.05,-0.01,-0.1,0.2]
};

test("winner formula returns complementary probabilities and recognizes workload advantage",()=>{
  const result=predictMatchWinner({
    playerA:{workload:{matches3:0,matches7:1,playingDays7:1,restDays:3,minutes7:90,durationCoverage7:1,priorMatchRecords7:1}},
    playerB:{workload:{matches3:2,matches7:4,playingDays7:3,restDays:1,minutes7:360,durationCoverage7:1,priorMatchRecords7:4}},
    baseProbabilityA:0.5,model
  });
  assert.ok(result.probabilityA>0.5);
  assert.equal(result.probabilityA+result.probabilityB,1);
  assert.equal(result.predictedWinner,"A");
  assert.equal(result.workloadAvailable,true);
});

test("missing workload is neutral and explicitly marked unavailable",()=>{
  const result=predictMatchWinner({playerA:{},playerB:{},baseProbabilityA:0.6,model});
  assert.ok(Math.abs(result.probabilityA-0.6)<1e-8);
  assert.equal(result.workloadAvailable,false);
});

test("winner formula rejects malformed probabilities and model schemas",()=>{
  assert.throws(()=>predictMatchWinner({playerA:{},playerB:{},baseProbabilityA:1,model}),RangeError);
  assert.throws(()=>predictMatchWinner({playerA:{},playerB:{},baseProbabilityA:0.5,model:{}}),TypeError);
});

test("winner formula research enforces chronological train/evaluation split",()=>{
  assert.throws(()=>runWinnerFormulaResearch("match_id,date,tournoi_id,genre,surface,joueur1_id,joueur2_id,vainqueur_id,score\n",{
    trainingEnd:"20260101",evaluationStart:"20260101",evaluationEnd:"20261231"
  }),/trainingEnd < evaluationStart/);
});
