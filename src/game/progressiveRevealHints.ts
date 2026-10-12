import { evaluateEngineGoal, initialEngineState, transitionEngine, type EngineFrame, type EngineRuntime, type EngineSession } from './engine.ts';
import type { SingleKeyHintResult } from './unlockHints.ts';

export type RevealPolicyStep = { readonly distance: number; readonly move: readonly [number, number] | null };
export type RevealHintTable = { readonly binding: string; readonly states: Readonly<Record<string, RevealPolicyStep>> };

/** Only public colors and stable unknown IDs enter this address. Known equal-color
 * units and ordinary bottle positions are interchangeable in this narrow scope. */
export function revealAddress(runtime: EngineRuntime, frame: EngineFrame) {
  const known = new Set(frame.known);
  const stacks = frame.state.contents.map((s, i) => ({ i, code: JSON.stringify(s.map(id => known.has(id)
    ? runtime.puzzle.colors.indexOf(runtime.unitColors.get(id)!) : id)) }));
  stacks.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.i - b.i);
  return { key: JSON.stringify(stacks.map(s => s.code)), order: stacks.map(s => s.i) };
}
export function assertRevealScope(runtime: EngineRuntime) {
  const p = runtime.puzzle;
  if (!p.hidden.length || p.hidden.length > 6 || p.containers.length > 6 || p.locked.length || p.triggers.length
    || p.amount !== 'run' || p.goal.type !== 'sort' || p.goal.containers.length !== p.containers.length
    || p.containers.some(c => c.capacity !== 4 || !c.canSource || !c.canReceive || c.receive !== 'same' || c.fixed || c.protectedBottom || c.acceptColors)
    || p.colors.some(c => p.units.filter(u => u.color === c).length !== 4)
    || p.containers.some(c => c.units.length && p.hidden.includes(c.units.at(-1)!))) throw Error('Unsupported independent progressive reveal scope');
}
export function revealTableHint(current: EngineSession, table: RevealHintTable): SingleKeyHintResult {
  if (table.binding !== current.runtime.binding) throw Error('Reveal hint binding mismatch');
  if (evaluateEngineGoal(current.runtime, current.state)) return { status: 'complete' };
  const { key, order } = revealAddress(current.runtime, current), step = table.states[key];
  if (!step) throw Error('Position missing from complete reveal hint table');
  if (step.distance < 0) return current.known.length === current.runtime.puzzle.units.length
    ? { status: 'unsolvable' } : { status: 'recover', reason: 'concealed-branch' };
  if (!step.move || step.distance < 1) throw Error('Invalid reveal hint step');
  const action = { type: 'transfer' as const, source: current.runtime.puzzle.containers[order[step.move[0]]].id,
    target: current.runtime.puzzle.containers[order[step.move[1]]].id };
  const next = transitionEngine(current.runtime, current.state, current.known, action);
  if (!next.accepted) throw Error('Invalid certified reveal action');
  return { status: 'hint', action, attempt: current.attempt, revision: current.revision, binding: current.runtime.binding };
}
export function revealRecoverySteps(current: EngineSession, table: RevealHintTable) {
  for (let i = current.history.length - 1; i >= 0; i--) {
    const frame = { state: current.history[i].state, known: current.known };
    if ((table.states[revealAddress(current.runtime, frame).key]?.distance ?? -1) > 0) return current.history.length - i;
  }
  return null;
}
export function parseRevealHintTable(input: unknown, runtime: EngineRuntime): RevealHintTable {
  assertRevealScope(runtime);
  const t = input as RevealHintTable | null;
  if (!t || t.binding !== runtime.binding || !t.states || typeof t.states !== 'object' || Array.isArray(t.states)
    || !Object.keys(t.states).length || Object.values(t.states).some(s => !s || !Number.isSafeInteger(s.distance) || s.distance < -1
      || (s.distance > 0 ? !Array.isArray(s.move) || s.move.length !== 2 || s.move[0] === s.move[1]
        || s.move.some(i => !Number.isSafeInteger(i) || i < 0 || i >= runtime.puzzle.containers.length) : s.move !== null))
    || (t.states[revealAddress(runtime, initialEngineState(runtime)).key]?.distance ?? -1) < 1) throw Error('Invalid reveal hint table');
  return t;
}
