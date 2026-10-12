import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine,
  type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import { combinationAddress } from '../../src/game/combinationHints.ts';
import type { RevealHintTable, RevealPolicyStep } from '../../src/game/progressiveRevealHints.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { concealedInventoryWorlds } from './unlockPublicDisclosure.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import {combinationScope} from './combinationScope.ts';

/** Reconstruct all public-inventory worlds at a CURRENT position, including
 * stronger knowledge retained by undo. Previously seen locked liquid is fixed.
 * Only unread lock counts/orders and still unknown open portions are varied. */
export function* currentCombinationWorlds(runtime:EngineRuntime,frame:EngineFrame) {
  const p=runtime.puzzle,known=new Set(frame.known);
  const unread=p.containers.flatMap((c,i)=>!frame.state.open[i] && !frame.state.contents[i].some(id=>known.has(id)) ? [i] : []);
  const anonymous=unread.flatMap(i=>frame.state.contents[i]), anonymousSet=new Set(anonymous);
  const masks=p.units.filter(u=>!known.has(u.id)&&!anonymousSet.has(u.id)).map(u=>u.id);
  const counts=p.colors.map(c=>4-p.units.filter(u=>known.has(u.id)&&u.color===c).length), assignments=new Map<string,string>();
  function* visit(index:number):Generator<{runtime:EngineRuntime;frame:EngineFrame}> {
    if(index<masks.length) {
      for(let c=0;c<counts.length;c++) if(counts[c]) {counts[c]--;assignments.set(masks[index],p.colors[c]);yield*visit(index+1);counts[c]++;}
      return;
    }
    const inventory=p.colors.flatMap((c,i)=>Array.from({length:counts[i]},()=>c));
    if(inventory.length!==anonymous.length) throw Error('Invalid remaining public inventory');
    const colors=new Map(anonymous.map((id,i)=>[id,inventory[i]]));
    const rt=compileSortingPuzzle({...p,units:p.units.map(u=>({...u,color:assignments.get(u.id)??colors.get(u.id)??u.color}))});
    const projection={...rt.puzzle,containers:p.containers.map((c,i)=>({...c,units:frame.state.contents[i]})),locked:unread.map(i=>p.containers[i].id)};
    for(const w of concealedInventoryWorlds(projection)) yield {runtime:rt,frame:{state:{...frame.state,
      contents:frame.state.contents.map((s,i)=>unread.includes(i)?w.units[unread.indexOf(i)]:s)},known:frame.known}};
  }
  yield*visit(0);
}

export const COMBINATION_HINT_BUDGET=Object.freeze({maxWorlds:2048,maxPhaseStates:100000,maxTotalStates:1000000,maxEdges:10000000});
export type CombinationHintBudget={readonly [K in keyof typeof COMBINATION_HINT_BUDGET]:number};
/** Offline AND/OR policy, separate from the fixed difficulty certificate.
 * No fallback to secret true-color hints. A bounded/incomplete computation
 * throws, so it cannot be exported as a complete playable hint package. */
export function completeCombinationHints(puzzle:SortingPuzzle,budget:CombinationHintBudget=COMBINATION_HINT_BUDGET) {
  if(Object.values(budget).some(n=>!Number.isSafeInteger(n)||n<1)) throw Error('Invalid combination hint budget');
  const kind=puzzle.triggers.some(t=>t.when.type==='color-full')?'key-cloth':puzzle.triggers.length===2?'two-key-reveal':'key-reveal';
  if(combinationScope(puzzle,kind).status!=='supported')throw Error('Unsupported combination hint scope');
  const runtime=compileSortingPuzzle(puzzle),states:Record<string,RevealPolicyStep>=Object.create(null);
  let totalStates=0,edges=0,phases=0,peakWorlds=0;
  function solve(rt:EngineRuntime,start:EngineFrame):RevealPolicyStep {
    const startKey=combinationAddress(rt,start).key,cached=states[startKey];if(cached)return cached;
    phases++;
    const worlds:{runtime:EngineRuntime;frame:EngineFrame}[]=[];
    for(const w of currentCombinationWorlds(rt,start)) {
      if(worlds.length>=budget.maxWorlds)throw Error('Combination hint world budget');worlds.push(w);
    }
    peakWorlds=Math.max(peakWorlds,worlds.length);
    const unread=rt.puzzle.containers.flatMap((_,i)=>!start.state.open[i]&&!start.state.contents[i].some(id=>start.known.includes(id))?[i]:[]);
    type Node={key:string;frame:EngineFrame;predecessors:{from:number;move:readonly[number,number]}[];distance:number;move:readonly[number,number]|null};
    const nodes:Node[]=[],indices=new Map<string,number>();
    const add=(frame:EngineFrame)=>{
      const key=combinationAddress(rt,frame).key,old=indices.get(key);if(old!==undefined)return old;
      if(nodes.length>=budget.maxPhaseStates||++totalStates>budget.maxTotalStates)throw Error('Combination hint state budget');
      const i=nodes.length;indices.set(key,i);nodes.push({key,frame,predecessors:[],distance:-1,move:null});return i;
    };
    const substitute=(w:typeof worlds[number],f:EngineFrame):EngineFrame=>({state:{...f.state,
      contents:f.state.contents.map((s,i)=>unread.includes(i)?w.frame.state.contents[i]:s)},known:f.known});
    add(start);
    for(let i=0;i<nodes.length;i++) {
      const n=nodes[i],f=n.frame;
      if(worlds.every(w=>evaluateEngineGoal(w.runtime,substitute(w,f).state))){n.distance=0;continue;}
      const order=combinationAddress(rt,f).order;
      for(const action of listEngineActions(rt,f.state,f.known)) {
        if(++edges>budget.maxEdges)throw Error('Combination hint edge budget');
        const move=[order.indexOf(rt.containerIndex.get(action.source)!),order.indexOf(rt.containerIndex.get(action.target)!)] as const;
        const next=transitionEngine(rt,f.state,f.known,action);if(!next.accepted)throw Error('Invalid hint action enumeration');
        if(next.known.length===f.known.length&&next.state.fired.length===f.state.fired.length) {
          const child=states[combinationAddress(rt,next).key];
          if(child) {
            if(child.distance>=0&&(n.distance<0||n.distance>child.distance+1)){n.distance=child.distance+1;n.move=move;}
          } else nodes[add(next)].predecessors.push({from:i,move});
        } else {
          const branches=new Map<string,{runtime:EngineRuntime;frame:EngineFrame}>();
          for(const w of worlds) {
            const base=substitute(w,f);if(evaluateEngineGoal(w.runtime,base.state))continue;
            const out=transitionEngine(w.runtime,base.state,base.known,action);if(!out.accepted)throw Error('Public hint leaked concealed truth');
            if(!evaluateEngineGoal(w.runtime,out.state))branches.set(combinationAddress(w.runtime,out).key,{runtime:w.runtime,frame:out});
          }
          let safe=true;
          for(const b of branches.values()) if(solve(b.runtime,b.frame).distance<0){safe=false;break;}
          if(safe&&(n.distance<0||n.distance>1)){n.distance=1;n.move=move;}
        }
      }
    }
    const queue=nodes.flatMap((n,i)=>n.distance>=0?[i]:[]);
    for(let q=0;q<queue.length;q++)for(const p of nodes[queue[q]].predecessors) {
      const from=nodes[p.from],distance=nodes[queue[q]].distance+1;
      if(from.distance<0||from.distance>distance){from.distance=distance;from.move=p.move;queue.push(p.from);}
    }
    for(const n of nodes)states[n.key]={distance:n.distance,move:n.move};return states[startKey];
  }
  const frames:EngineFrame[]=[],seen=new Set<string>();
  const add=(f:EngineFrame)=>{const key=combinationAddress(runtime,f).key;if(seen.has(key))return;
    if(frames.length>=budget.maxTotalStates)throw Error('Combination hint closure budget');seen.add(key);frames.push(f);};
  add(initialEngineState(runtime));
  for(let i=0;i<frames.length;i++) {
    const f=frames[i];solve(runtime,f);
    if(!evaluateEngineGoal(runtime,f.state))for(const a of listEngineActions(runtime,f.state,f.known)) {
      const next=transitionEngine(runtime,f.state,f.known,a);if(!next.accepted)throw Error('Invalid hint closure action');add(next);
    }
    // Include every knowledge superset that an undo could retain. Empty seen
    // locks are conservatively treated as unread; no secret empty count leaks.
    const upgrades=[...puzzle.hidden.map(id=>[id]),...puzzle.containers.filter(c=>puzzle.locked.includes(c.id)).map(c=>c.units)];
    for(const ids of upgrades)if(ids.some(id=>!f.known.includes(id)))add({state:f.state,
      known:puzzle.units.filter(u=>f.known.includes(u.id)||ids.includes(u.id)).map(u=>u.id)});
  }
  if(states[combinationAddress(runtime,initialEngineState(runtime)).key].distance<1)throw Error('No initial public combination hint');
  const table:RevealHintTable={binding:runtime.binding,states};
  for(const f of frames) {
    if(evaluateEngineGoal(runtime,f.state))continue;
    const a=combinationAddress(runtime,f),s=states[a.key];if(!s)throw Error('Incomplete hint closure');
    if(s.distance>0){const next=transitionEngine(runtime,f.state,f.known,{type:'transfer',source:puzzle.containers[a.order[s.move![0]]].id,target:puzzle.containers[a.order[s.move![1]]].id});
      if(!next.accepted)throw Error('Illegal complete hint');
      if(!evaluateEngineGoal(runtime,next.state)){const child=states[combinationAddress(runtime,next).key];
        if(!child||child.distance<0||next.known.length===f.known.length&&next.state.fired.length===f.state.fired.length&&child.distance>=s.distance)throw Error('Unsafe complete hint');}
    }
  }
  return {table,check:{method:'combination-public-complete-hints-v1',budget,closureStates:frames.length,states:Object.keys(states).length,
    totalStates,edges,phases,peakWorlds,evidenceSha256:sha256(table)}};
}
