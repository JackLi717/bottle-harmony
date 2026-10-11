import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { initialEngineState, createEngineSession, listEngineActions, transitionEngine, type EngineAction, type EngineFrame } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { solveBoard } from '../../src/game/solver.ts';
import { twoKeyHintKey, twoKeyTableHint, type TwoKeyHintTable } from '../../src/game/unlockTwoKeyHints.ts';
import { buildRatingGraph } from './unlockRatingGraph.ts';
import { concealedInventoryWorlds } from './unlockPublicDisclosure.ts';
import { proveDoubleKeyDisclosure } from './unlockDoubleKeyDisclosure.ts';
import { TWO_KEY_RECIPE, type TwoKeyRecord } from './unlockTwoKeyGeneration.ts';
import { sha256 } from './unlockRatingEvidence.ts';

/** All actual reachable states, including off-route choices and retained-knowledge
 * undo. Unknown boundary proofs block export; they never become recovery verdicts. */
export function completeTwoKeyHints(record: TwoKeyRecord, output: string) {
 assert.equal(record.acceptance.status,'pass');assert.equal(record.acceptance.definitionSha256,sha256(record.puzzle));
 const puzzle = record.puzzle, graph = buildRatingGraph(puzzle, TWO_KEY_RECIPE.graph.maxStates, TWO_KEY_RECIPE.graph.maxEdges);
 assert.ok(graph.status === 'complete'); const rated = record.acceptance.difficulty; assert.ok(rated?.status === 'rated');
 const key = twoKeyHintKey(graph.runtime), keys = graph.nodes.map(n => key(n.frame.state)), indices = new Map(keys.map((k,i) => [k,i]));
 assert.equal(indices.size, graph.nodes.length);
 const firstId = rated.witness.keys[0], secondId = rated.witness.keys[1], secondGroup = puzzle.triggers.find(t => t.id === secondId)!.unlock;
 assert.equal(secondGroup.length, 1); const secondIndex = graph.runtime.containerIndex.get(secondGroup[0])!;
 mkdirSync(output, { recursive: true }); const path = `${output}/hints-${sha256(puzzle)}.json`;
 const cache = existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : null;
 if (cache) { const { evidenceSha256,...payload } = cache; assert.equal(evidenceSha256,sha256(payload)); assert.equal(cache.binding, graph.runtime.binding); assert.equal(cache.acceptanceSha256, record.acceptance.evidenceSha256); }
 const secondProofs: Record<string, boolean> = cache?.secondProofs ?? {}, firstProofs: Record<string, boolean> = cache?.firstProofs ?? {};
 const firstExits: Record<string,string[]> = cache?.firstExits ?? {}, secondExits: Record<string,string[]> = cache?.secondExits ?? {};
 const disclosureWorkspace={binding:sha256(puzzle),losing:new Set<string>()};
 const checkpoint = () => { const payload = { binding: graph.runtime.binding, acceptanceSha256: record.acceptance.evidenceSha256, firstExits, secondExits, firstProofs, secondProofs };
  writeFileSync(path+'.tmp',JSON.stringify({...payload,evidenceSha256:sha256(payload)}));renameSync(path+'.tmp',path); };
 const known = graph.nodes.map((n,i) => n.frame.state.open.every(Boolean) ? graph.distances[i] : Infinity), unknown = [...known];
 const add = (exits: Record<string,string[]>, from:number,to:number) => { if (!(exits[keys[from]]??=[]).includes(keys[to])) exits[keys[from]].push(keys[to]); };
 const relaxKnown = () => {
  const queue = known.flatMap((d,i) => Number.isFinite(d) ? [i] : []);
  for(let c=0;c<queue.length;c++) { const to=queue[c];for(const from of graph.nodes[to].predecessors) {
   if (graph.nodes[from].frame.state.open.every(Boolean) || known[from] <= known[to]+1) continue;
   const opensSecond = !graph.nodes[from].frame.state.fired.includes(secondId) && graph.nodes[to].frame.state.fired.includes(secondId);
   if(opensSecond && !secondExits[keys[from]]?.includes(keys[to]))continue;
   known[from]=known[to]+1;queue.push(from);
  }}
 };
 const relaxUnknown = () => {
  for(const [from,targets] of Object.entries(firstExits)) for(const target of targets) {
   const a=indices.get(from)!,b=indices.get(target)!;if(Number.isFinite(known[b]))unknown[a]=Math.min(unknown[a],known[b]+1);
  }
  const queue=unknown.flatMap((d,i)=>Number.isFinite(d)?[i]:[]);
  for(let c=0;c<queue.length;c++){const to=queue[c];for(const from of graph.nodes[to].predecessors){
   if(graph.nodes[from].frame.state.fired.includes(firstId)||graph.nodes[to].frame.state.fired.includes(firstId)||unknown[from]<=unknown[to]+1)continue;
   unknown[from]=unknown[to]+1;queue.push(from);
  }}
 };
 const worlds=[...concealedInventoryWorlds({...puzzle,locked:[secondGroup[0]]})]; assert.ok(worlds.length<=24);
 const proveSecond=(from:number,to:number)=>{
  // The all-open quotient can permute bottles. Reconstruct this actual opening
  // edge before substituting the concealed bottle; never use its representative.
  const edge=graph.nodes[from].edges.find(e=>e.to===to&&e.unlock.includes(secondId));assert.ok(edge);
  const next=transitionEngine(graph.runtime,graph.nodes[from].frame.state,graph.nodes[from].frame.known,edge.action);assert.ok(next.accepted);
  const frame={state:next.state,known:next.known}, board=frame.state.contents.map(s=>s.map(u=>graph.runtime.unitColors.get(u)!));
  const identity=sha256({outside:board.filter((_,i)=>i!==secondIndex).map(s=>s.join(',')).sort(),inventory:[...board[secondIndex]].sort()});
  if(secondProofs[identity]!==undefined)return secondProofs[identity];
  for(const world of worlds){
   const state={...frame.state,contents:frame.state.contents.map((s,i)=>i===secondIndex?world.units[0]:s)}, actual=state.contents.map(s=>s.map(u=>graph.runtime.unitColors.get(u)!));
   const result=solveBoard(actual,{maxStates:1000000,maxMilliseconds:60000});
   if(result.status==='limitReached')throw Error(`Incomplete second boundary: ${identity}`);
   assert.notEqual(result.status,'invalid');
   if(result.status==='unsolvable'){secondProofs[identity]=false;checkpoint();return false;}
   assert.ok(result.status==='solved');replayEngineRoute(graph.runtime,{state,known:frame.known},result.route.map(p=>({type:'transfer',source:puzzle.containers[p.source].id,target:puzzle.containers[p.target].id})));
  }
  secondProofs[identity]=true;checkpoint();return true;
 };
 // Seed the actual accepted second boundary, then cover all remaining branches.
 let frame=initialEngineState(graph.runtime);
 for(const action of rated.witness.route){const before=frame,next=transitionEngine(graph.runtime,frame.state,frame.known,action);assert.ok(next.accepted);frame=next;
  if(!before.state.fired.includes(secondId)&&frame.state.fired.includes(secondId)){const a=indices.get(key(before.state))!,b=indices.get(key(frame.state))!;assert.ok(proveSecond(a,b));add(secondExits,a,b);break;}}
 relaxKnown();
 for(const [from,node] of graph.nodes.entries()){
  if(!Number.isFinite(graph.distances[from])||Number.isFinite(known[from])||!node.frame.state.fired.includes(firstId))continue;
  for(const e of node.edges.filter(e=>e.unlock.includes(secondId)&&Number.isFinite(graph.distances[e.to]))){if(proveSecond(from,e.to)){add(secondExits,from,e.to);relaxKnown();break;}}
 }
 relaxKnown();
 frame=initialEngineState(graph.runtime);
 for(const action of rated.witness.route){const before=frame,next=transitionEngine(graph.runtime,frame.state,frame.known,action);assert.ok(next.accepted);frame=next;
  if(!before.state.fired.includes(firstId)&&frame.state.fired.includes(firstId)){add(firstExits,indices.get(key(before.state))!,indices.get(key(frame.state))!);break;}}
 relaxUnknown();
 const routeVia=(from:number,to:number)=>{
  const chain=[from];for(let i=from;graph.nodes[i].parent>=0;){i=graph.nodes[i].parent;chain.push(i);}chain.reverse();chain.push(to);
  const prefix: EngineAction[]=[];let live=initialEngineState(graph.runtime);
  for(const target of chain.slice(1)){
   const action=listEngineActions(graph.runtime,live.state,live.known).find(a=>{const next=transitionEngine(graph.runtime,live.state,live.known,a);return next.accepted&&graph.key(next)===graph.key(graph.nodes[target].frame);});
   assert.ok(action);const next=transitionEngine(graph.runtime,live.state,live.known,action);assert.ok(next.accepted);prefix.push(action);live=next;
  }
  const route=[...prefix];let at=to;
  while(graph.distances[at]>0){const d=live.state.open.every(Boolean)?graph.distances:known;
   const chosen=listEngineActions(graph.runtime,live.state,live.known).find(action=>{const next=transitionEngine(graph.runtime,live.state,live.known,action);assert.ok(next.accepted);const target=indices.get(key(next.state))!;
    return d[target]===d[at]-1&&(!next.events.some(e=>e.type==='unlock'&&e.triggers.includes(secondId))||secondExits[keys[at]]?.includes(keys[target]));});
   assert.ok(chosen);const next=transitionEngine(graph.runtime,live.state,live.known,chosen);assert.ok(next.accepted);route.push(chosen);live=next;at=indices.get(key(live.state))!;
  }
  replayEngineRoute(graph.runtime,initialEngineState(graph.runtime),route);
  const openedFrames:EngineFrame[]=[],cuts:number[]=[];live=initialEngineState(graph.runtime);
  for(const [i,action] of route.entries()){const next=transitionEngine(graph.runtime,live.state,live.known,action);assert.ok(next.accepted);if(next.state.fired.length>live.state.fired.length){cuts.push(i+1);openedFrames.push({state:next.state,known:next.known});}live=next;}
  return {...rated,witness:{...rated.witness,route,splitPours:cuts as unknown as readonly [number,number],openedFrames}};
 };
 for(const [from,node] of graph.nodes.entries()){
  if(node.frame.state.fired.includes(firstId)||!Number.isFinite(graph.distances[from])||Number.isFinite(unknown[from]))continue;
  for(const e of node.edges.filter(e=>e.unlock.includes(firstId)&&Number.isFinite(known[e.to]))){
   const identity=keys[e.to];if(firstProofs[identity]===undefined){const proof=proveDoubleKeyDisclosure(puzzle,routeVia(from,e.to),TWO_KEY_RECIPE.disclosure,disclosureWorkspace);
    console.log('first hint boundary',puzzle.id,from,e.to,proof.status,proof.reason);
    if(proof.status==='unknown')throw Error(`Incomplete first boundary: ${proof.reason}`);firstProofs[identity]=proof.status==='pass';checkpoint();}
   if(firstProofs[identity]){add(firstExits,from,e.to);relaxUnknown();break;}
  }
 }
 checkpoint(); const finite=(d:number)=>Number.isFinite(d)?d:-1;
 const table:TwoKeyHintTable={binding:graph.runtime.binding,keys:[firstId,secondId],states:Object.fromEntries(keys.map((k,i)=>[k,[finite(graph.distances[i]),finite(known[i]),finite(unknown[i])]])),firstExits,secondExits};
 const fresh=createEngineSession(puzzle,'offline-two-key-hints');
 for(const node of graph.nodes)for(const seen of [puzzle.containers.filter((_,i)=>node.frame.state.open[i]).map(c=>c.id),puzzle.triggers[0].unlock,puzzle.locked]){
  const session={...fresh,...node.frame,seen:[...new Set([...seen,...puzzle.containers.filter((_,i)=>node.frame.state.open[i]).map(c=>c.id)])]};twoKeyTableHint(session,table);
 }
 return {table,check:{states:graph.nodes.length,edges:graph.edges,firstProofs:Object.keys(firstProofs).length,secondProofs:Object.keys(secondProofs).length,
  needsRecovery:graph.nodes.filter((n,i)=>!n.frame.state.fired.includes(firstId)&&Number.isFinite(graph.distances[i])&&!Number.isFinite(unknown[i])).length}};
}
