import { evaluateEngineGoal, listEngineActions, transitionEngine, type EngineRuntime, type EngineSession, type EngineState } from './engine.ts';
import type { EngineHintResult } from './engineSearch.ts';

export type SingleKeyHintTable = { readonly binding: string; readonly states: Readonly<Record<string, readonly [number, number]>>;
  readonly exits: Readonly<Record<string, readonly string[]>> };
export type SingleKeyHintResult = Exclude<EngineHintResult, { status: 'hint' } | { status: 'unknown' }>
  | Omit<Extract<EngineHintResult, { status: 'hint' }>, 'worlds'>
  | { readonly status: 'recover'; readonly reason: 'concealed-branch' };

/** Only interchangeable classic bottles merge. Before opening, key and lock roles
 * stay distinct; after opening they cannot affect any future move. Knowledge does
 * not change transfers in this scope (no progressively hidden portions). */
export function singleKeyHintKey(runtime: EngineRuntime) {
  const p = runtime.puzzle, trigger = p.triggers[0];
  if (p.containers.length > 10 || p.amount !== 'run' || p.hidden.length || p.triggers.length !== 1
    || trigger.when.type !== 'empty' || !p.locked.length || trigger.unlock.length !== p.locked.length
    || p.locked.some(id => !trigger.unlock.includes(id)) || p.goal.type !== 'sort' || p.goal.containers.length !== p.containers.length
    || p.containers.some(c => c.capacity !== 4 || !c.canSource || !c.canReceive || c.receive !== 'same' || c.protectedBottom || c.acceptColors)
    || p.colors.some(color => p.units.filter(u => u.color === color).length !== 4)) throw new Error('Unsupported single-key hint scope');
  const keyContainer = trigger.when.container;
  const roles = p.containers.map(c => JSON.stringify([c.fixed, p.locked.includes(c.id), c.id === keyContainer]));
  const groups = [...new Set(roles)].map(role => roles.flatMap((r, i) => r === role ? [i] : []));
  const openRoles = p.containers.map(c => String(c.fixed));
  const openGroups = [...new Set(openRoles)].map(role => openRoles.flatMap((r, i) => r === role ? [i] : []));
  const codes = new Map(p.units.map(u => [u.id, String.fromCharCode(65 + p.colors.indexOf(u.color))]));
  return (state: EngineState) => {
    const stacks = state.contents.map((stack, i) => Number(state.open[i]) + stack.map(u => codes.get(u)!).join(''));
    return (state.open.every(Boolean) ? openGroups : groups).map(indices => indices.map(i => stacks[i]).sort().join('|')).join('/')
      + '#' + [...state.fired].sort().join(',');
  };
}

/** True distances cover every reachable state. Public distances use fully proved
 * opening boundaries. A truly solvable state with no public continuation needs
 * free recovery; unresolved searches cannot enter this result. Re-select the live
 * action, since equivalent bottles and equal-color unit IDs may have permuted. */
export function singleKeyTableHint(current: EngineSession, table: SingleKeyHintTable): SingleKeyHintResult {
  if (table.binding !== current.runtime.binding) throw new Error('Hint table puzzle mismatch');
  if (evaluateEngineGoal(current.runtime, current.state)) return { status: 'complete' };
  const key = singleKeyHintKey(current.runtime), distance = table.states[key(current.state)];
  if (!distance) throw new Error('Reachable position missing from complete hint table');
  if (distance[0] < 0) return { status: 'unsolvable' };
  const concealed = current.runtime.puzzle.containers.some((c, i) => !current.state.open[i] && !current.seen.includes(c.id));
  const column = concealed ? 1 : 0;
  if (distance[column] < 0) return { status: 'recover', reason: 'concealed-branch' };
  for (const action of listEngineActions(current.runtime, current.state, current.known)) {
    const next = transitionEngine(current.runtime, current.state, current.known, action);
    if (!next.accepted) throw new Error('Hint action rejected');
    const after = table.states[key(next.state)];
    const safeExit = !concealed || !next.state.open.every(Boolean) || table.exits[key(current.state)]?.includes(key(next.state));
    if (safeExit && after && after[column] === distance[column] - 1) return { status: 'hint', action, attempt: current.attempt,
      revision: current.revision, binding: current.runtime.binding };
  }
  throw new Error('Invalid complete hint table');
}

export function parseSingleKeyHintTable(input: unknown, runtime: EngineRuntime): SingleKeyHintTable {
  const row = input as SingleKeyHintTable | null;
  if (!row || row.binding !== runtime.binding || !row.states || typeof row.states !== 'object' || Array.isArray(row.states)
    || !row.exits || typeof row.exits !== 'object' || Array.isArray(row.exits)
    || Object.values(row.exits).some(values => !Array.isArray(values) || values.some(k => typeof k !== 'string' || !row.states[k]))
    || !Object.keys(row.states).length || Object.values(row.states).some(d => !Array.isArray(d) || d.length !== 2
      || d.some(n => !Number.isSafeInteger(n) || n < -1))) throw new Error('Invalid single-key hint table');
  singleKeyHintKey(runtime);
  return row;
}

/** Undo preserves knowledge, so recovery may use the true-layout column once the
 * player has seen every bottle. This only recommends recovery; it never edits play. */
export function singleKeyHintRecoverySteps(current: EngineSession, table: SingleKeyHintTable): number | null {
  if (table.binding !== current.runtime.binding) throw new Error('Hint table puzzle mismatch');
  const key = singleKeyHintKey(current.runtime);
  for (let i = current.history.length - 1; i >= 0; i--) {
    const state = current.history[i].state;
    const column = current.runtime.puzzle.containers.some((c, j) => !state.open[j] && !current.seen.includes(c.id)) ? 1 : 0;
    if ((table.states[key(state)]?.[column] ?? -1) > 0) return current.history.length - i;
  }
  return null;
}
