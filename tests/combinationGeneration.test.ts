import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {compileSortingPuzzle,createEngineSession,evaluateEngineGoal,initialEngineState,listEngineActions,moveEngineSession,resetEngineSession,transitionEngine,undoEngineSession,type EngineFrame} from '../src/game/engine.ts';
import {generatedCombinationTrials} from '../src/game/combinationGenerated.ts';
import {combinationAddress,combinationRecoverySteps,combinationTableHint,parseCombinationHints} from '../src/game/combinationHints.ts';
import {initialBoard} from '../src/game/model.ts';
import {structureKey} from '../src/game/generation.ts';
import {replaySolution} from '../src/game/solver.ts';
import {replayEngineRoute} from '../src/game/engineSearch.ts';
import {COMBINATION_RECIPE,reconstructCombination,combinationIntegration} from '../scripts/lib/combinationGeneration.ts';
import {COMBINATION_SAMPLES} from '../scripts/lib/combinationSamples.ts';
import {completeCombinationHints,currentCombinationWorlds,COMBINATION_HINT_BUDGET} from '../scripts/lib/combinationCompleteHints.ts';
import {combinedInventoryWorlds} from '../scripts/lib/combinedInventoryWorlds.ts';
import {buildRatingGraph,colorRuns} from '../scripts/lib/unlockRatingGraph.ts';
import {analyzeDisclosureDifficulty} from '../scripts/lib/disclosureStageDifficulty.ts';
import {classifyStageWork} from '../scripts/lib/unlockStageRhythm.ts';
import {auditUnlockClothTemplates} from '../scripts/lib/unlockClothTemplates.ts';
import {auditProgressiveMasks} from '../scripts/lib/progressiveMaskTemplates.ts';
import {sha256} from '../scripts/lib/unlockRatingEvidence.ts';

const bank=JSON.parse(readFileSync(new URL('../assets/levels/unlock-combination-six.json',import.meta.url),'utf8'));
const trials=generatedCombinationTrials(bank);

test('six independent whole classic sources reconstruct before overlays, bind evidence, replay and differ in roots, lower rows and final openings',()=>{
  const {evidenceSha256,...payload}=bank;assert.equal(sha256(payload),evidenceSha256);assert.deepEqual(bank.recipe,COMBINATION_RECIPE);
  assert.equal(trials.length,6);assert.equal(new Set(bank.entries.map((r:{classicStructureKey:string})=>r.classicStructureKey)).size,6);
  assert.equal(new Set(bank.entries.map((r:{lowerRow:string})=>r.lowerRow)).size,6);assert.equal(new Set(bank.entries.map((r:{openedStructure:string})=>r.openedStructure)).size,6);
  for(const [i,t] of trials.entries()){
    const r=bank.entries[i],source=reconstructCombination(i+1,r.origin.candidateIndex),rt=compileSortingPuzzle(t.puzzle);
    assert.deepEqual(t.puzzle,source.puzzle);assert.equal(sha256(source),r.sourceSha256);assert.equal(structureKey(source.classic),r.classicStructureKey);
    replaySolution(initialBoard(source.classic),r.classicSolution,4);replayEngineRoute(rt,initialEngineState(rt),r.route);
    assert.deepEqual(t.puzzle.containers.map(c=>c.units.map(id=>rt.unitColors.get(id))),initialBoard(source.classic));
    assert.ok(t.puzzle.locked.length<=Math.floor(t.puzzle.containers.length/2));assert.ok(source.classic.bottles.filter(b=>!b.layers.length).length<=2);
    assert.equal(sha256(r.hints),r.hintClosure.evidenceSha256);assert.equal(r.rank,Math.max(...r.stageRanks));
  }
});

test('fresh unchanged policy ladder proves all actual stages, mandatory dependency, rhythm and presentation templates',()=>{
  for(const [i,t]of trials.entries()){
    const r=bank.entries[i],g=buildRatingGraph(t.puzzle,COMBINATION_RECIPE.graph.maxStates,COMBINATION_RECIPE.graph.maxEdges,12);
    assert.equal(g.status,'complete');if(g.status!=='complete')throw Error('Incomplete graph');
    const d=analyzeDisclosureDifficulty(g,r.kind,COMBINATION_RECIPE.maxWork);assert.equal(d.status,'rated');if(d.status!=='rated')throw Error('Unknown grade');
    assert.deepEqual(d.stageRanks,r.stageRanks);assert.deepEqual(d.witness.route,r.route);assert.equal(d.rank,r.rank);
    for(const trigger of t.puzzle.triggers)assert.ok(g.nodes.filter(n=>n.solved).every(n=>n.frame.state.fired.includes(trigger.id)));
    if(r.kind==='key-cloth') {
      assert.ok(!g.nodes.some(n=>n.frame.state.fired.includes('cloth')&&!n.frame.state.fired.includes('key')));
      assert.equal(auditUnlockClothTemplates(t.puzzle,{mixedKeys:true}).status,'pass');
    } else assert.equal(auditProgressiveMasks(t.puzzle).status,'pass');
    const last=d.witness.stages.filter(s=>s.opened.length).at(-1)!;
    const before=colorRuns(g.runtime,initialEngineState(g.runtime))-colorRuns(g.runtime,last.frame),after=colorRuns(g.runtime,last.frame)-colorRuns(g.runtime,d.witness.stages.at(-1)!.frame);
    assert.equal(classifyStageWork(before,after).status,'pass');assert.equal(before,r.rhythm.before);assert.equal(after,r.rhythm.after);
    assert.deepEqual(combinationIntegration(t.puzzle,d.witness.stages.map(s=>s.frame)),r.integration);assert.equal(r.integration.status,'pass');
  }
});

test('all inventory-compatible initial worlds finish with the exported public hint policy; private counts/colors never select the first action',()=>{
  for(const [i,t]of trials.entries()){
    let worlds=0;const initialActions=new Set<string>();
    for(const w of combinedInventoryWorlds(t.puzzle)){
      worlds++;const table={...t.combinationHints!,binding:w.runtime.binding};let frame=w.frame;const seen=new Set<string>();
      const fresh={...createEngineSession(w.runtime.puzzle,'all-worlds'),runtime:w.runtime};
      const first=combinationTableHint({...fresh,...frame},table);assert.equal(first.status,'hint');if(first.status==='hint')initialActions.add(JSON.stringify(first.action));
      while(!evaluateEngineGoal(w.runtime,frame.state)){
        const key=combinationAddress(w.runtime,frame).key;assert.ok(!seen.has(key));seen.add(key);
        const hint=combinationTableHint({...fresh,...frame},table);assert.equal(hint.status,'hint');if(hint.status!=='hint')throw Error('Unfinished public policy');
        const next=transitionEngine(w.runtime,frame.state,frame.known,hint.action);assert.ok(next.accepted);frame=next;
      }
    }
    assert.equal(worlds,bank.entries[i].acceptance.worlds);assert.equal(initialActions.size,1);
  }
});

test('every actual legal branch and stronger undo knowledge set has a certified hint or explicit recovery, with finite policy progress',()=>{
  for(const [i,t]of trials.entries()){
    const fresh=createEngineSession(t.puzzle,'closure'),rt=fresh.runtime,table=t.combinationHints!,frames:EngineFrame[]=[],seen=new Set<string>();
    const add=(f:EngineFrame)=>{const k=combinationAddress(rt,f).key;if(!seen.has(k)){seen.add(k);frames.push(f);}};add(initialEngineState(rt));
    for(let cursor=0;cursor<frames.length;cursor++){
      const f=frames[cursor],hint=combinationTableHint({...fresh,...f},table);
      if(hint.status==='hint'){
        const next=transitionEngine(rt,f.state,f.known,hint.action);assert.ok(next.accepted);
        if(!evaluateEngineGoal(rt,next.state)){
          const parent=table.states[combinationAddress(rt,f).key],child=table.states[combinationAddress(rt,next).key];assert.ok(child&&child.distance>0);
          assert.ok(next.known.length>f.known.length||next.state.fired.length>f.state.fired.length||child.distance<parent.distance);
        }
      }else assert.ok(['recover','unsolvable','complete'].includes(hint.status));
      if(!evaluateEngineGoal(rt,f.state))for(const a of listEngineActions(rt,f.state,f.known)){const next=transitionEngine(rt,f.state,f.known,a);assert.ok(next.accepted);add(next);}
      for(const ids of [...t.puzzle.hidden.map(id=>[id]),...t.puzzle.containers.filter(c=>t.puzzle.locked.includes(c.id)).map(c=>c.units)])if(ids.some(id=>!f.known.includes(id)))
        add({state:f.state,known:t.puzzle.units.filter(u=>f.known.includes(u.id)||ids.includes(u.id)).map(u=>u.id)});
    }
    assert.equal(frames.length,bank.entries[i].hintClosure.closureStates);
  }
});

test('undo preserves seen colors and locks while reset restores the original mask; hints remain available',()=>{
  for(const t of trials){
    let s=createEngineSession(t.puzzle,'undo');const initial=s;
    while(!s.state.fired.length){const h=combinationTableHint(s,t.combinationHints!);assert.equal(h.status,'hint');if(h.status!=='hint')throw Error('Missing initial hint');const n=moveEngineSession(s,h.action);assert.ok(n);s=n.session;}
    const undo=undoEngineSession(s);assert.deepEqual(undo.known,s.known);assert.ok(undo.state.fired.length<s.state.fired.length);
    assert.notEqual(combinationTableHint(undo,t.combinationHints!).status,'complete');assert.notEqual(combinationRecoverySteps(undo,t.combinationHints!),undefined);
    assert.deepEqual(resetEngineSession(undo).known,initial.known);assert.deepEqual(resetEngineSession(undo).state,initial.state);
  }
});

test('fresh small policy controls preserve all-world enumeration, reject incomplete budgets and do not use hidden truth',()=>{
  for(const {puzzle}of COMBINATION_SAMPLES){
    const rt=compileSortingPuzzle(puzzle),initial=initialEngineState(rt),worlds=[...currentCombinationWorlds(rt,initial)];
    assert.equal(worlds.length,[...combinedInventoryWorlds(puzzle)].length);assert.equal(new Set(worlds.map(w=>combinationAddress(w.runtime,w.frame).key)).size,1);
    const result=completeCombinationHints(puzzle);assert.ok(result.check.closureStates>0);assert.equal(sha256(result.table),result.check.evidenceSha256);
    assert.throws(()=>completeCombinationHints(puzzle,{...COMBINATION_HINT_BUDGET,maxWorlds:1}),/budget/);
    assert.throws(()=>completeCombinationHints(puzzle,{...COMBINATION_HINT_BUDGET,maxTotalStates:1}),/budget/);
  }
});

test('strict frozen bank rejects unknown/fail acceptance, wrong grades, duplicate structure, unsafe scope and mismatched hints; formal content stays byte identical',()=>{
  for(const change of [
    (b:typeof bank)=>{b.entries[0].acceptance.status='unknown';},(b:typeof bank)=>{b.entries[1].rank=1;},
    (b:typeof bank)=>{b.entries[1].lowerRow=b.entries[0].lowerRow;},(b:typeof bank)=>{b.entries[2].puzzle.hidden=[];},
    (b:typeof bank)=>{b.entries[4].puzzle.triggers[1].when.container='b1';},(b:typeof bank)=>{b.entries[0].hints.binding='wrong';},
  ]){const bad=structuredClone(bank);change(bad);assert.throws(()=>generatedCombinationTrials(bad));}
  assert.throws(()=>parseCombinationHints({...trials[0].combinationHints,binding:'wrong'},compileSortingPuzzle(trials[0].puzzle)));
  for(const file of ['content.sqlite','mainline-catalog.json','mainline-play.json','solid-side-50.json','progressive-reveal-four.json','unlock-two-key-six.json','unlock-post-key-20.json','unlock-internal-100.json']){
    const path=`assets/levels/${file}`;assert.deepEqual(readFileSync(path),execFileSync('git',['show',`HEAD:${path}`],{maxBuffer:30*1024*1024}));
  }
  const screen=readFileSync('src/ui/DemoScreen.tsx','utf8'),menu=readFileSync('src/ui/MainlineMenu.tsx','utf8');
  assert.match(screen,/page === 'unlock-combinations'\) && INTERNAL_TOOLS/);assert.match(menu,/toolsVisible && <>\{onUnlockCombinations/);
  for(const path of ['src/game/combinationGenerated.ts','src/game/combinationHints.ts'])assert.doesNotMatch(readFileSync(path,'utf8'),/from ['"][^'"]*(?:storage|mainline|sqlite)|AsyncStorage/);
});
