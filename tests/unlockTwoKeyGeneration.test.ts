import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TWO_KEY_RECIPE, twoKeyOrigin, twoKeyOverlays, twoKeyIntegration, type projectTwoKeyBank } from '../scripts/lib/unlockTwoKeyGeneration.ts';
import { reconstructPostKeyClassic, POST_KEY_RECIPE } from '../scripts/lib/unlockPostKeyGeneration.ts';
import { rowStructure } from '../scripts/lib/unlockPostKeyDiversity.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeDoubleKeyDifficulty } from '../scripts/lib/unlockDoubleKeyDifficulty.ts';
import { analyzeDoubleKeyRhythm } from '../scripts/lib/unlockDoubleKeyRhythm.ts';
import { auditUnlockVisualTemplates } from '../scripts/lib/unlockVisualTemplates.ts';
import { generatedTwoKeyTrials } from '../src/game/unlockTwoKeyGenerated.ts';
import { createEngineSession, moveEngineSession, undoEngineSession, resetEngineSession, transitionEngine, initialEngineState } from '../src/game/engine.ts';
import { twoKeyTableHint, twoKeyHintKey, twoKeyHintColumn, twoKeyHintRecoverySteps } from '../src/game/unlockTwoKeyHints.ts';
import { completeTwoKeyHints } from '../scripts/lib/unlockTwoKeyCompleteHints.ts';
import { evaluateDoubleKey } from '../scripts/lib/unlockDoubleKeyAcceptance.ts';
import { DOUBLE_KEY_SAMPLES } from '../scripts/lib/unlockDoubleKeySamples.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { solveBoard, replaySolution } from '../src/game/solver.ts';
import { initialBoard } from '../src/game/model.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';
import { structureKey } from '../src/game/generation.ts';

const bank=JSON.parse(readFileSync(new URL('../assets/levels/unlock-two-key-six.json',import.meta.url),'utf8')) as ReturnType<typeof projectTwoKeyBank>;
const hintBank=JSON.parse(readFileSync(new URL('../assets/levels/unlock-two-key-hints.json',import.meta.url),'utf8'));
const trials=generatedTwoKeyTrials(bank,hintBank);

test('six closed-loop puzzles reconstruct complete classic sources before overlays, three stages and integration',()=>{
 const {evidenceSha256,...payload}=bank;assert.equal(evidenceSha256,sha256(payload));assert.deepEqual(bank.recipe,TWO_KEY_RECIPE);
 const roots=new Set<string>(),rows=new Set<string>(),finals=new Set<string>();
 for(const [i,row] of bank.entries.entries()){
  assert.deepEqual(row.origin,twoKeyOrigin(row.origin.seed-POST_KEY_RECIPE.seed-POST_KEY_RECIPE.templateSeedOffset[2]));
  const classic=reconstructPostKeyClassic(row.origin),board=initialBoard(classic);assert.ok(hasCleanStart(classic));
  const solved=solveBoard(board,{maxStates:100000,maxMilliseconds:30000});assert.ok(solved.status==='solved');replaySolution(board,solved.route,4);
  assert.equal(row.classicStructureKey,structureKey(classic));roots.add(row.classicStructureKey);
  const source={origin:row.origin,classic,solution:solved.route,structureKey:structureKey(classic),overlay:row.overlay};assert.equal(row.sourceSha256,sha256(source));
  const overlay=twoKeyOverlays(row.origin).find(o=>o.key===row.overlay.key&&o.first===row.overlay.first&&o.second===row.overlay.second);assert.ok(overlay);
  assert.deepEqual(overlay.order,row.overlay.order);assert.deepEqual(overlay.puzzle,row.puzzle);
  const colors=new Map(row.puzzle.units.map(u=>[u.id,u.color]));assert.deepEqual(row.puzzle.containers.map(c=>c.units.map(u=>colors.get(u)!)),row.overlay.order.map(j=>board[j]));
  assert.equal(row.puzzle.locked.length,2);assert.ok(row.puzzle.locked.length*2<=row.puzzle.containers.length);
  assert.ok(row.puzzle.locked.every(id=>row.puzzle.containers.find(c=>c.id===id)!.units.length===4));
  assert.equal(auditUnlockVisualTemplates(row.puzzle).status,'pass');
  const graph=buildRatingGraph(row.puzzle,TWO_KEY_RECIPE.graph.maxStates,TWO_KEY_RECIPE.graph.maxEdges);assert.ok(graph.status==='complete');
  const rating=analyzeDoubleKeyDifficulty(graph,TWO_KEY_RECIPE.maxWork);assert.ok(rating.status==='rated');assert.deepEqual(rating.stageRanks,row.stageRanks);assert.equal(rating.rank,row.rank);
  assert.deepEqual(rating.witness.route,row.route);assert.deepEqual(rating.witness.splitPours,row.splitPours);
  assert.equal(Math.max(...row.stageRanks),row.rank);assert.ok(row.rank>=4&&row.rank<=6);
  assert.equal(twoKeyIntegration(row.puzzle,rating.witness.openedFrames).status,'pass');
  const rhythm=analyzeDoubleKeyRhythm(graph,rating);assert.ok(rhythm.status==='pass');assert.deepEqual(rhythm.stageWork,row.rhythm.stageWork);
  assert.ok(Number.isFinite(row.classicScore)&&Number.isFinite(row.finalClassicScore));
  rows.add(rowStructure(row.overlay.order.slice(Math.ceil(board.length/2)).map(j=>board[j])));
  finals.add(rowStructure(rating.witness.openedFrames[1].state.contents.map(s=>s.map(u=>colors.get(u)!))));
  assert.equal(trials[i].puzzle.id,row.puzzle.id);
 }
 assert.equal(roots.size,6);assert.equal(rows.size,6);assert.equal(finals.size,6);
});

test('every reachable two-key state has an exact hint/recovery verdict for unseen, partly seen and undo knowledge',()=>{
 const {evidenceSha256,...payload}=hintBank;assert.equal(evidenceSha256,sha256(payload));
 for(const trial of trials){
  const table=trial.twoKeyHints!,graph=buildRatingGraph(trial.puzzle,TWO_KEY_RECIPE.graph.maxStates,TWO_KEY_RECIPE.graph.maxEdges);assert.ok(graph.status==='complete');
  const fresh=createEngineSession(trial.puzzle,'all-reachable-hint-test'),key=twoKeyHintKey(graph.runtime);assert.equal(Object.keys(table.states).length,graph.nodes.length);
  for(const [index,node] of graph.nodes.entries())for(const extraSeen of [[],trial.puzzle.triggers[0].unlock,trial.puzzle.locked]){
   const seen=[...new Set([...extraSeen,...trial.puzzle.containers.filter((_,i)=>node.frame.state.open[i]).map(c=>c.id)])];
   const current={...fresh,...node.frame,seen},result=twoKeyTableHint(current,table),column=twoKeyHintColumn(current,table);
   assert.equal(table.states[key(current.state)][0],Number.isFinite(graph.distances[index])?graph.distances[index]:-1);
   if(result.status==='hint'){
    const next=transitionEngine(graph.runtime,current.state,current.known,result.action);assert.ok(next.accepted);
    const nextColumn=column===2&&next.state.fired.includes(table.keys[0])?1:column;
    assert.equal(table.states[key(next.state)][nextColumn],table.states[key(current.state)][column]-1);
   }else if(result.status==='unsolvable')assert.equal(graph.distances[index],Infinity);
   else if(result.status==='recover')assert.equal(table.states[key(current.state)][column],-1);
   else assert.equal(result.status,'complete');
  }
 }
});

test('free hints complete all six; undo retains both disclosures and reset restores masks without persistence',()=>{
 for(const trial of trials){let session=createEngineSession(trial.puzzle,'playthrough'),steps=0;const table=trial.twoKeyHints!;
  while(session.status!=='solved'&&steps++<200){const result=twoKeyTableHint(session,table);assert.equal(result.status,'hint');assert.ok(result.status==='hint');const moved=moveEngineSession(session,result.action,result.revision);assert.ok(moved);session=moved.session;}
  assert.equal(session.status,'solved');assert.ok(steps<200);
  while(session.history.length)session=undoEngineSession(session);
  assert.ok(trial.puzzle.locked.every(id=>session.seen.includes(id)));assert.equal(twoKeyHintColumn(session,table),0);
  assert.equal(twoKeyTableHint(session,table).status,'hint');assert.equal(twoKeyHintRecoverySteps(session,table),null);
  session=resetEngineSession(session);assert.deepEqual(session.state,initialEngineState(session.runtime).state);assert.equal(twoKeyHintColumn(session,table),2);
  assert.equal(twoKeyTableHint(session,table).status,'hint');
 }
});

test('internal loader rejects missing hints, changed scope, mismatched grades and isolated openings',()=>{
 for(const change of [
  (x:typeof bank)=>{x.entries[0].rank=7;},
  (x:typeof bank)=>{x.entries[0].puzzle={...x.entries[0].puzzle,triggers:[x.entries[0].puzzle.triggers[0],{...x.entries[0].puzzle.triggers[1],when:{type:'empty',container:x.entries[0].puzzle.containers.find(c=>!x.entries[0].puzzle.locked.includes(c.id))!.id}}]};},
  (x:typeof bank)=>{x.entries[0].integration.openings[0].sharedColors=[];},
  (x:typeof bank)=>{x.entries[1].classicStructureKey=x.entries[0].classicStructureKey;},
 ]){const altered=structuredClone(bank);change(altered);assert.throws(()=>generatedTwoKeyTrials(altered,hintBank));}
 const changed=structuredClone(hintBank);delete changed.tables[trials[0].puzzle.id];assert.throws(()=>generatedTwoKeyTrials(bank,changed));
});

test('complete multi-key hint compiler handles fixed control and replays public-safe second boundaries',()=>{
 const directory=mkdtempSync(join(tmpdir(),'two-key-hints-'));
 try {const puzzle=DOUBLE_KEY_SAMPLES[0].puzzle,acceptance=evaluateDoubleKey(puzzle,{target:{min:1,max:7},disclosureBudget:{maxWorlds:2048,maxStatesPerWorld:100000,maxTotalStates:1000000,maxMilliseconds:30000,reuseContinuations:true}});
  assert.equal(acceptance.status,'pass');const record={puzzle,acceptance} as unknown as Parameters<typeof completeTwoKeyHints>[0];
  const result=completeTwoKeyHints(record,directory);assert.ok(result.check.states>0);let session=createEngineSession(puzzle,'fixture');
  for(let i=0;session.status!=='solved'&&i<100;i++){const hint=twoKeyTableHint(session,result.table);assert.ok(hint.status==='hint');const moved=moveEngineSession(session,hint.action);assert.ok(moved);session=moved.session;}
  assert.equal(session.status,'solved');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('two-key public-proof acceleration keeps every hidden world and complete replay; limits never poison negative reuse',async()=>{
 const {proveDoubleKeyDisclosure}=await import('../scripts/lib/unlockDoubleKeyDisclosure.ts');
 const {compileSortingPuzzle}=await import('../src/game/engine.ts');
 const {concealedInventoryWorlds}=await import('../scripts/lib/unlockPublicDisclosure.ts');
 const {replayEngineRoute}=await import('../src/game/engineSearch.ts');
 const puzzle=DOUBLE_KEY_SAMPLES[2].puzzle,graph=buildRatingGraph(puzzle);assert.ok(graph.status==='complete');
 const stage=analyzeDoubleKeyDifficulty(graph);assert.ok(stage.status==='rated');
 const budget={maxWorlds:2048,maxStatesPerWorld:100000,maxTotalStates:1000000,maxMilliseconds:30000,reuseContinuations:true};
 const workspace={binding:sha256(puzzle),losing:new Set<string>()};
 const limited=proveDoubleKeyDisclosure(puzzle,stage,{...budget,maxWorlds:1},workspace);assert.equal(limited.status,'unknown');assert.equal(workspace.losing.size,0);
 const proof=proveDoubleKeyDisclosure(puzzle,stage,budget,workspace);assert.equal(proof.status,'pass');
 assert.equal(proof.worlds.length,60);assert.equal(proof.certificates.length,60);
 const runtime=compileSortingPuzzle(puzzle),initial=initialEngineState(runtime),locked=puzzle.containers.filter(c=>puzzle.locked.includes(c.id));
 const worlds=[...concealedInventoryWorlds(puzzle)];
 for(const certificate of proof.certificates){const world=worlds[certificate.world];
  const state={...initial.state,contents:puzzle.containers.map((c,i)=>{const j=locked.findIndex(l=>l.id===c.id);return j<0?initial.state.contents[i]:world.units[j];})};
  replayEngineRoute(runtime,{state,known:initial.known},certificate.route);
 }
 assert.throws(()=>proveDoubleKeyDisclosure(puzzle,stage,budget,{binding:'wrong',losing:new Set()}));
});
