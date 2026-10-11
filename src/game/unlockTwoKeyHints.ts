import { evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine, type EngineRuntime, type EngineState, type EngineSession } from './engine.ts';
import type { SingleKeyHintResult } from './unlockHints.ts';
export type TwoKeyHintTable = { readonly binding: string; readonly keys: readonly [string, string];
 readonly states: Readonly<Record<string, readonly [number, number, number]>>;
 readonly firstExits: Readonly<Record<string, readonly string[]>>; readonly secondExits: Readonly<Record<string, readonly string[]>> };
/** Colors determine forward rules. Seen liquid only selects the knowledge column,
 * so undo can retain knowledge without changing this complete state address. */
export function twoKeyHintKey(runtime: EngineRuntime) {
 const p = runtime.puzzle;
 const roles = p.containers.map(c => JSON.stringify([c.fixed, p.locked.includes(c.id),
  p.triggers.filter(t => t.when.type === 'empty' && t.when.container === c.id).map(t => t.id).sort(),
  p.triggers.filter(t => t.unlock.includes(c.id)).map(t => t.id).sort()]));
 const groups = [...new Set(roles)].map(r => roles.flatMap((v,i) => v === r ? [i] : []));
 const openRoles = p.containers.map(c => String(c.fixed)), opened = [...new Set(openRoles)].map(r => openRoles.flatMap((v,i) => v === r ? [i] : []));
 const codes = new Map(p.units.map(u => [u.id, String.fromCharCode(65 + p.colors.indexOf(u.color))]));
 return (state: EngineState) => {
  const stacks = state.contents.map((s,i) => Number(state.open[i]) + s.map(u => codes.get(u)!).join(''));
  return (p.containers.length > 8 && state.open.every(Boolean) ? opened : groups).map(g => g.map(i => stacks[i]).sort().join('|')).join('/') + '#' + [...state.fired].sort().join(',');
 };
}
export function twoKeyHintColumn(session: Pick<EngineSession, 'runtime' | 'state' | 'seen'>, table: TwoKeyHintTable): 0 | 1 | 2 {
 const second = session.runtime.puzzle.triggers.find(t => t.id === table.keys[1])!;
 if (session.runtime.puzzle.locked.every(id => session.seen.includes(id))) return 0;
 const first = session.runtime.puzzle.triggers.find(t => t.id === table.keys[0])!;
 return first.unlock.every(id => session.seen.includes(id)) || session.state.fired.includes(first.id) || second.unlock.every(id => session.seen.includes(id)) ? 1 : 2;
}
export function twoKeyTableHint(current: EngineSession, table: TwoKeyHintTable): SingleKeyHintResult {
 if (table.binding !== current.runtime.binding) throw Error('Two-key hint binding mismatch');
 if (evaluateEngineGoal(current.runtime, current.state)) return { status: 'complete' };
 const key = twoKeyHintKey(current.runtime), before = key(current.state), distances = table.states[before];
 if (!distances) throw Error('Reachable two-key state missing from complete hint table');
 if (distances[0] < 0) return { status: 'unsolvable' };
 const column = twoKeyHintColumn(current, table);
 if (distances[column] < 0) return { status: 'recover', reason: 'concealed-branch' };
 for (const action of listEngineActions(current.runtime, current.state, current.known)) {
  const next = transitionEngine(current.runtime, current.state, current.known, action); if (!next.accepted) throw Error('Invalid hint action');
  const after = key(next.state), d = table.states[after];
  const first = !current.state.fired.includes(table.keys[0]) && next.state.fired.includes(table.keys[0]);
  const second = !current.state.fired.includes(table.keys[1]) && next.state.fired.includes(table.keys[1]);
  if (column === 2 && first && !table.firstExits[before]?.includes(after)) continue;
  if (column !== 0 && second && !table.secondExits[before]?.includes(after)) continue;
  const nextColumn = column === 2 && first ? 1 : column;
  if (d && d[nextColumn] === distances[column] - 1) return { status: 'hint', action, attempt: current.attempt, revision: current.revision, binding: current.runtime.binding };
 }
 throw Error('Invalid complete two-key hint table');
}
export function twoKeyHintRecoverySteps(current: EngineSession, table: TwoKeyHintTable) {
 const key = twoKeyHintKey(current.runtime);
 for (let i = current.history.length - 1; i >= 0; i--) {
  const state = current.history[i].state, column = twoKeyHintColumn({ ...current, state }, table);
  if ((table.states[key(state)]?.[column] ?? -1) > 0) return current.history.length - i;
 }
 return null;
}
export function parseTwoKeyHintTable(input: unknown, runtime: EngineRuntime): TwoKeyHintTable {
 const row = input as TwoKeyHintTable | null, first = runtime.puzzle.triggers.find(t => t.when.type === 'empty' && !runtime.puzzle.locked.includes(t.when.container)),
  second = runtime.puzzle.triggers.find(t => t !== first);
 if (!row || row.binding !== runtime.binding || !first || !second || runtime.puzzle.hidden.length || runtime.puzzle.triggers.length !== 2
  || first.when.type !== 'empty' || second.when.type !== 'empty' || !first.unlock.includes(second.when.container)
  || JSON.stringify(row.keys) !== JSON.stringify([first.id,second.id]) || !row.states || typeof row.states !== 'object' || Array.isArray(row.states)
  || !Object.keys(row.states).length || Object.values(row.states).some(d => !Array.isArray(d) || d.length !== 3 || d.some(n => !Number.isSafeInteger(n) || n < -1))
  || [row.firstExits,row.secondExits].some(exits => !exits || typeof exits !== 'object' || Array.isArray(exits) || Object.entries(exits).some(([k,a]) => !row.states[k] || !Array.isArray(a) || a.some(k => typeof k !== 'string' || !row.states[k])))) throw Error('Invalid two-key hint table');
 const initial=row.states[twoKeyHintKey(runtime)(initialEngineState(runtime).state)];
 if(!initial||initial[2]<1)throw Error('Missing certified initial two-key hint');
 return row;
}
