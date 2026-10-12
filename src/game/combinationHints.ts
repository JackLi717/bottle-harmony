import { evaluateEngineGoal, initialEngineState, transitionEngine, visibleEngineState, type EngineFrame, type EngineRuntime, type EngineSession } from './engine.ts';
import type { RevealHintTable } from './progressiveRevealHints.ts';
import type { SingleKeyHintResult } from './unlockHints.ts';

/** Public address: unread locks disclose neither their count nor their IDs.
 * Empty-key roles remain distinct until fired; revealed equal colors may merge. */
export function combinationAddress(runtime: EngineRuntime, frame: EngineFrame) {
  const p = runtime.puzzle, known = new Set(frame.known);
  const visible = visibleEngineState(runtime, frame.state, frame.known), triggerIds=p.triggers.map(t=>t.id).sort();
  const color=(c:string)=>String.fromCharCode(65+p.colors.indexOf(c));
  const rows = visible.map((v, i) => {
    const role=v.locked?`l${i}`:`o${p.triggers.flatMap(t=>t.when.type==='empty'&&t.when.container===v.id
      &&!frame.state.fired.includes(t.id)?[triggerIds.indexOf(t.id)]:[]).sort().join('.')}`;
    const stack=v.locked ? v.count===null?'?':v.colors.map(c=>c===null?'?':color(c)).join('')
      : frame.state.contents[i].map(id=>known.has(id)?color(runtime.unitColors.get(id)!):`[${id}]`).join('');
    return {i,code:`${role}:${stack}`};
  });
  rows.sort((a,b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.i - b.i);
  return { key: `${frame.state.fired.map(id=>triggerIds.indexOf(id)).sort().join('.')}|${rows.map(r=>r.code).join('|')}`, order: rows.map(r => r.i) };
}
export function combinationTableHint(current: EngineSession, table: RevealHintTable): SingleKeyHintResult {
  if (table.binding !== current.runtime.binding) throw Error('Combination hint binding mismatch');
  if (evaluateEngineGoal(current.runtime, current.state)) return { status: 'complete' };
  const {key,order} = combinationAddress(current.runtime,current), step = table.states[key];
  if (!step) throw Error('Missing complete combination hint');
  if (step.distance < 0) return current.known.length === current.runtime.puzzle.units.length
    ? {status:'unsolvable'} : {status:'recover',reason:'concealed-branch'};
  if (!step.move || step.distance < 1) throw Error('Invalid combination hint');
  const action = {type:'transfer' as const,source:current.runtime.puzzle.containers[order[step.move[0]]].id,target:current.runtime.puzzle.containers[order[step.move[1]]].id};
  if (!transitionEngine(current.runtime,current.state,current.known,action).accepted) throw Error('Illegal combination hint');
  return {status:'hint',action,attempt:current.attempt,revision:current.revision,binding:current.runtime.binding};
}
export function combinationRecoverySteps(current: EngineSession, table: RevealHintTable) {
  for (let i=current.history.length-1;i>=0;i--) {
    const frame={state:current.history[i].state,known:current.known};
    if ((table.states[combinationAddress(current.runtime,frame).key]?.distance ?? -1)>0) return current.history.length-i;
  }
  return null;
}
export function parseCombinationHints(input:unknown,runtime:EngineRuntime):RevealHintTable {
  const t=input as RevealHintTable|null;
  if (!t || t.binding!==runtime.binding || !t.states || typeof t.states!=='object' || Array.isArray(t.states)
    || !Object.keys(t.states).length || Object.values(t.states).some(s=>!s||!Number.isSafeInteger(s.distance)||s.distance < -1
      || (s.distance>0 ? !Array.isArray(s.move)||s.move.length!==2||s.move[0]===s.move[1]
        || s.move.some(i=>!Number.isSafeInteger(i)||i<0||i>=runtime.puzzle.containers.length) : s.move!==null))
    || (t.states[combinationAddress(runtime,initialEngineState(runtime)).key]?.distance??-1)<1) throw Error('Invalid combination hint table');
  return t;
}
