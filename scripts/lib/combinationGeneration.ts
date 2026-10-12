import assert from 'node:assert/strict';
import { initialBoard, parseLevel } from '../../src/game/model.ts';
import { structureKey } from '../../src/game/generation.ts';
import { solveBoard, replaySolution } from '../../src/game/solver.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState, type EngineFrame } from '../../src/game/engine.ts';
import type { CombinationKind } from './combinationScope.ts';
import { buildRatingGraph, colorRuns } from './unlockRatingGraph.ts';
import { analyzeDisclosureDifficulty } from './disclosureStageDifficulty.ts';
import { classifyStageWork } from './unlockStageRhythm.ts';
import { evaluateDisclosure, disclosureClassicReferences } from './disclosureAcceptance.ts';
import { DISCLOSURE_PROOF_BUDGET } from './disclosurePublicProof.ts';
import { rowStructure } from './unlockPostKeyDiversity.ts';
import { completeCombinationHints } from './combinationCompleteHints.ts';
import { sha256 } from './unlockRatingEvidence.ts';

export const COMBINATION_RECIPE=Object.freeze({method:'classic-combination-six-v1',count:6,perKind:2,
  target:{min:1,max:7},source:'whole-classic-profile-shuffle-v1',maxCandidates:500,
  graph:{maxStates:100000,maxEdges:2000000},maxWork:10000000,
  proofBudget:{...DISCLOSURE_PROOF_BUDGET,maxPhaseStates:100000,maxTotalStates:2000000,maxEdges:20000000},
  integration:'shared-unfinished-color-network-v1',diversity:'unique-classic-lower-row-opened-v1'});
const C='coral',J='jade',A='amber',D='azure',V='violet';
const kinds:CombinationKind[]=['key-cloth','key-cloth','key-reveal','key-reveal','two-key-reveal','two-key-reveal'];
const profiles=[[4,4,3,1,0],[4,3,2,2,1,0],[4,3,2,1,2,0],[4,4,3,2,2,1,0]];
export function reconstructCombination(number:number,candidateIndex:number) {
  assert.ok(Number.isSafeInteger(number)&&number>=1&&number<=6&&Number.isSafeInteger(candidateIndex)&&candidateIndex>=0&&candidateIndex<COMBINATION_RECIPE.maxCandidates);
  const seed=62000000+number*10000,kind=kinds[number-1];let state=(seed^Math.imul(candidateIndex+1,0x9e3779b9))>>>0;
  function shuffle<T>(items:readonly T[]) {const a=[...items];for(let i=a.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=Math.floor(state/0x100000000*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  let board:string[][],locked:number[],hidden:readonly(readonly[number,number])[],triggers:ReturnType<typeof engineFixture>['triggers'];
  if(kind==='key-cloth') {
    // Generate the WHOLE inventory first, with only two initially empty vessels.
    // The visible color is complete in inventory; the key creates working space.
    // Every lower-row non-coral portion is shuffled, never a copied subpuzzle.
    const loose=shuffle([J,J,J,A,A,D,D,V,V]);
    board=[[D],[A],[D,V],[C,J,A],[],[],[...loose.slice(0,3),C],[...loose.slice(3,5),C,C],loose.slice(5),[V]];
    if(number===2){board=[...board].reverse();}
    const map=(i:number)=>number===2?9-i:i;
    locked=[0,2,4,5,9].map(map);hidden=[];
    triggers=[{id:'key',when:{type:'empty',container:`b${map(1)}`},unlock:[`b${map(2)}`]},
      {id:'cloth',when:{type:'color-full',color:C,count:4},unlock:[0,4,5,9].map(i=>`b${map(i)}`)}];
  } else {
    const profile=profiles[number-3],colors=number===6?[C,J,A,D]:[C,J,A],pool=shuffle(colors.flatMap(c=>[c,c,c,c]));let at=0;
    board=profile.map(n=>{const s=pool.slice(at,at+n);at+=n;return s;});
    const first=number===3?2:number===4?3:number===5?2:3,second=number===5?4:4,key=number===4||number===6?1:0;
    locked=kind==='two-key-reveal'?[first,second]:[first];
    hidden=number===3?[[1,0]]:number===4?[[0,0],[0,1],[2,0]]:number===5?[[1,0]]:[[0,0],[2,0]];
    triggers=[{id:'key-a',when:{type:'empty',container:`b${key}`},unlock:[`b${first}`]},
      ...(kind==='two-key-reveal'?[{id:'key-b',when:{type:'empty' as const,container:`b${first}`},unlock:[`b${second}`]}]:[])];
  }
  const origin={method:COMBINATION_RECIPE.source,seed,number,candidateIndex},overlay={locked,hidden,triggers};
  const classic=parseLevel({format:'bottle-harmony',version:1,rules:'water-sort',id:`combined-base-${number}-${candidateIndex}`,capacity:4,
    colors:[...new Set(board.flat())],bottles:board.map((layers,i)=>({id:`b${i}`,layers}))});
  const puzzle=engineFixture(`combined-v1-${number}-${candidateIndex}`,initialBoard(classic),overlay);
  return {kind,origin,overlay,classic,puzzle};
}
/** A recipe screen, not an extra difficulty/quality score. Small partial boxes
 * may have one shared color; no concealed unfinished color island is allowed. */
export function combinationIntegration(puzzle:ReturnType<typeof engineFixture>,frames:readonly EngineFrame[]) {
  const rt=compileSortingPuzzle(puzzle);let previous=new Set<string>();
  const openings=frames.flatMap(f=>{
    const fired=f.state.fired.filter(id=>!previous.has(id));previous=new Set(f.state.fired);if(!fired.length)return [];
    const newly=puzzle.triggers.filter(t=>fired.includes(t.id)).flatMap(t=>t.unlock);
    const board=f.state.contents.map((s,i)=>f.state.open[i]?s.map(id=>rt.unitColors.get(id)!):[]);
    const inside=new Set(newly.flatMap(id=>board[rt.containerIndex.get(id)!]));
    const outside=new Set(board.flatMap((s,i)=>newly.includes(puzzle.containers[i].id)?[]:s));
    const shared=[...inside].filter(c=>outside.has(c));
    const complete=new Set(board.filter(s=>s.length===4&&s.every(c=>c===s[0])).map(s=>s[0]));
    const remaining=[...new Set(board.flat())].filter(c=>!complete.has(c)),visited=new Set<string>(),queue=remaining.slice(0,1);
    for(const c of queue){if(visited.has(c))continue;visited.add(c);for(const s of board)if(s.includes(c))for(const d of s)if(!complete.has(d)&&!visited.has(d))queue.push(d);}
    const linked=[...inside].every(c=>outside.has(c));
    return [{triggers:fired,sharedColors:shared.sort(),connected:visited.size===remaining.length,linked}];
  });
  return {method:COMBINATION_RECIPE.integration,status:openings.length&&openings.every(o=>o.linked&&o.connected)?'pass':'fail',openings};
}
export function evaluateCombinationCandidate(number:number,index:number,log:(message:string)=>void=()=>{}) {
  const source=reconstructCombination(number,index),{classic,puzzle,kind}=source,board=initialBoard(classic);
  if(board.some(s=>s.length===4&&new Set(s).size===1)||board.filter(s=>!s.length).length>2
    ||puzzle.locked.some(id=>!puzzle.containers.find(c=>c.id===id)!.units.length)&&kind!=='key-cloth')return null;
  const solved=solveBoard(board,{maxStates:100000,maxMilliseconds:30000});if(solved.status!=='solved')return null;
  replaySolution(board,solved.route,4);
  const graph=buildRatingGraph(puzzle,COMBINATION_RECIPE.graph.maxStates,COMBINATION_RECIPE.graph.maxEdges,12);
  const d=analyzeDisclosureDifficulty(graph,kind,COMBINATION_RECIPE.maxWork);
  if(graph.status!=='complete'||d.status!=='rated')return null;
  if(puzzle.triggers.some(t=>graph.nodes.some(n=>n.solved&&!n.frame.state.fired.includes(t.id))))return null;
  if(kind==='key-cloth'&&graph.nodes.some(n=>n.frame.state.fired.includes('cloth')&&!n.frame.state.fired.includes('key')))return null;
  const frames=d.witness.stages.map(s=>s.frame),integration=combinationIntegration(puzzle,frames);if(integration.status!=='pass')return null;
  const last=d.witness.stages.filter(s=>s.opened.length).at(-1);if(!last)return null;
  if(classifyStageWork(colorRuns(graph.runtime,initialEngineState(graph.runtime))-colorRuns(graph.runtime,last.frame),
    colorRuns(graph.runtime,last.frame)-colorRuns(graph.runtime,frames.at(-1)!)).status!=='pass')return null;
  log(`proof ${number}/${index} rank ${d.stageRanks.join('/')} graph ${graph.nodes.length}`);
  const acceptance=evaluateDisclosure(puzzle,kind,{target:COMBINATION_RECIPE.target,...COMBINATION_RECIPE.graph,maxWork:COMBINATION_RECIPE.maxWork,proofBudget:COMBINATION_RECIPE.proofBudget});
  log(`${number}/${index} ${acceptance.status} ${acceptance.publicInformation?.reason} ${acceptance.publicInformation?.worlds}`);
  if(acceptance.status!=='pass')return null;
  return {number,kind,puzzle,source:{...source,solution:solved.route},sourceSha256:sha256(source),classicStructureKey:structureKey(classic),
    lowerRow:rowStructure(board.slice(Math.ceil(board.length/2))),openedStructure:rowStructure(last.frame.state.contents.map(s=>s.map(id=>graph.runtime.unitColors.get(id)!))),
    acceptance,references:disclosureClassicReferences(puzzle,acceptance),integration};
}
export type CombinationRecord=NonNullable<ReturnType<typeof evaluateCombinationCandidate>>;
export function assertCombinationRecord(r:CombinationRecord) {
  const source=reconstructCombination(r.number,r.source.origin.candidateIndex),{solution,...saved}=r.source;
  assert.deepEqual(saved,source);assert.deepEqual(r.puzzle,source.puzzle);assert.equal(r.kind,source.kind);
  assert.equal(r.sourceSha256,sha256(source));assert.equal(r.classicStructureKey,structureKey(source.classic));
  replaySolution(initialBoard(source.classic),solution,4);
  const {method,definitionSha256,target,budgets,evidenceSha256,limits:_limits,...evidence}=r.acceptance;
  assert.equal(definitionSha256,sha256(r.puzzle));assert.equal(evidenceSha256,sha256({binding:{method,definitionSha256,target,budgets},evidence}));
  assert.deepEqual(target,COMBINATION_RECIPE.target);assert.equal(r.acceptance.status,'pass');
  assert.ok(r.acceptance.difficulty?.status==='rated');assert.equal(r.acceptance.publicInformation?.status,'pass');
  assert.equal(r.acceptance.publicInformation?.certificatesSha256,sha256(r.acceptance.publicInformation!.certificates));
  assert.equal(r.lowerRow,rowStructure(initialBoard(source.classic).slice(Math.ceil(r.puzzle.containers.length/2))));
  const stages=r.acceptance.difficulty.witness.stages;
  const last=stages.filter(s=>s.opened.length).at(-1)!;
  const colors=new Map(r.puzzle.units.map(u=>[u.id,u.color]));
  assert.equal(r.openedStructure,rowStructure(last.frame.state.contents.map(s=>s.map(id=>colors.get(id)!))));
  assert.deepEqual(r.integration,combinationIntegration(r.puzzle,stages.map(s=>s.frame)));assert.equal(r.integration.status,'pass');
}
export function combinationDiversity(records:readonly CombinationRecord[]) {
  const keys=['classicStructureKey','lowerRow','openedStructure'] as const;
  return {method:COMBINATION_RECIPE.diversity,status:keys.every(k=>new Set(records.map(r=>r[k])).size===records.length)?'pass':'fail',
    counts:Object.fromEntries(keys.map(k=>[k,new Set(records.map(r=>r[k])).size]))};
}
export function projectCombinationBank(records:readonly CombinationRecord[]) {
  assert.equal(records.length,6);const diversity=combinationDiversity(records);assert.equal(diversity.status,'pass');
  const entries=records.map(r=>{
    assertCombinationRecord(r);
    assert.equal(r.acceptance.status,'pass');assert.ok(r.acceptance.difficulty?.status==='rated');
    const hints=completeCombinationHints(r.puzzle);
    const d=r.acceptance.difficulty;
    return {number:r.number,kind:r.kind,puzzle:r.puzzle,origin:r.source.origin,overlay:r.source.overlay,classicSolution:r.source.solution,
      sourceSha256:r.sourceSha256,classicStructureKey:r.classicStructureKey,lowerRow:r.lowerRow,openedStructure:r.openedStructure,
      acceptance:{method:r.acceptance.method,status:r.acceptance.status,label:r.acceptance.label,evidenceSha256:r.acceptance.evidenceSha256,
        worlds:r.acceptance.publicInformation!.worlds,certificatesSha256:r.acceptance.publicInformation!.certificatesSha256},
      rank:d.rank,stageRanks:d.stageRanks,route:d.witness.route,rhythm:r.acceptance.rhythm,integration:r.integration,
      classicReference:{status:r.references.base.status,score:r.references.base.human?.score?.total??null},hints:hints.table,hintClosure:hints.check};
  });
  const payload={format:'bottle-harmony-internal-combination-bank',version:1,method:COMBINATION_RECIPE.method,recipe:COMBINATION_RECIPE,diversity,entries};
  return {...payload,evidenceSha256:sha256(payload)};
}
