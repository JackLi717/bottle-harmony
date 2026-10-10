import { parseSortingPuzzle, type SortingGoal, type SortingPuzzle } from './engineModel.ts';
import { sortedContainers, transferAmount } from './transfer.ts';

export type EngineState = { readonly contents: readonly (readonly string[])[]; readonly open: readonly boolean[]; readonly fired: readonly string[] };
export type EngineAction = { readonly type: 'transfer'; readonly source: string; readonly target: string };
export type EngineEvent =
  | { readonly type: 'transfer'; readonly source: string; readonly target: string; readonly units: readonly string[] }
  | { readonly type: 'unlock'; readonly containers: readonly string[]; readonly triggers: readonly string[] }
  | { readonly type: 'reveal'; readonly units: readonly string[] }
  | { readonly type: 'solved' };
export type EngineResult = { readonly accepted: true; readonly state: EngineState; readonly known: readonly string[]; readonly events: readonly EngineEvent[] }
  | { readonly accepted: false; readonly reason: 'invalidAction' | 'unavailable' | 'illegalTransfer' };
export type EngineRuntime = {
  readonly puzzle: SortingPuzzle; readonly binding: string;
  readonly containerIndex: { get(id: string): number | undefined }; readonly unitColors: { get(id: string): string | undefined; has(id: string): boolean }; readonly hidden: { has(id: string): boolean };
};
const runtimes = new WeakMap<SortingPuzzle, EngineRuntime>();
const frozen = <T>(values: readonly T[]): readonly T[] => Object.isFrozen(values) ? values : Object.freeze([...values]);
export function compileSortingPuzzle(input: unknown): EngineRuntime {
  const existing = input && typeof input === 'object' ? runtimes.get(input as SortingPuzzle) : undefined;
  if (existing) return existing;
  const puzzle = parseSortingPuzzle(input);
  const indices = new Map(puzzle.containers.map((c, i) => [c.id, i])), colors = new Map(puzzle.units.map(u => [u.id, u.color])), hidden = new Set(puzzle.hidden);
  const runtime: EngineRuntime = Object.freeze({ puzzle, binding: JSON.stringify(puzzle),
    containerIndex: Object.freeze({ get: (id: string) => indices.get(id) }),
    unitColors: Object.freeze({ get: (id: string) => colors.get(id), has: (id: string) => colors.has(id) }), hidden: Object.freeze({ has: (id: string) => hidden.has(id) }) });
  runtimes.set(puzzle, runtime);
  return runtime;
}
function state(contents: readonly (readonly string[])[], open: readonly boolean[], fired: readonly string[]): EngineState {
  return Object.freeze({ contents: Object.freeze(contents.map(units => frozen(units))), open: frozen(open), fired: frozen([...fired].sort()) });
}
function canonicalKnown(runtime: EngineRuntime, known: ReadonlySet<string>): readonly string[] {
  return frozen(runtime.puzzle.units.filter(unit => known.has(unit.id)).map(unit => unit.id));
}

/** Knowledge never decreases within an attempt, including after undo. */
function expose(runtime: EngineRuntime, current: EngineState, known: Set<string>): string[] {
  const revealed: string[] = [];
  current.contents.forEach((units, i) => {
    if (!current.open[i]) return;
    units.forEach((unit, depth) => {
      if ((!runtime.hidden.has(unit) || depth === units.length - 1) && !known.has(unit)) { known.add(unit); revealed.push(unit); }
    });
  });
  return revealed;
}
function settle(runtime: EngineRuntime, contents: readonly (readonly string[])[], initiallyOpen: readonly boolean[], initiallyFired: readonly string[], initiallyKnown: readonly string[]) {
  if (!runtime.puzzle.triggers.length && initiallyKnown.length === runtime.puzzle.units.length) {
    return { state: state(contents, initiallyOpen, initiallyFired), known: frozen(initiallyKnown), events: [] as EngineEvent[] };
  }
  const open = [...initiallyOpen], fired = new Set(initiallyFired), known = new Set(initiallyKnown), events: EngineEvent[] = [];
  // Every non-stable round fires at least one previously unfired trigger.
  for (let round = 0; round <= runtime.puzzle.triggers.length; round++) {
    const revealed = expose(runtime, { contents, open, fired: [...fired] }, known);
    if (revealed.length) events.push(Object.freeze({ type: 'reveal', units: frozen(revealed) }));
    const pending = runtime.puzzle.triggers.filter(trigger => {
      if (fired.has(trigger.id)) return false;
      const when = trigger.when;
      if (when.type === 'empty') { const i = runtime.containerIndex.get(when.container)!; return open[i] && !contents[i].length; }
      return contents.some((units, i) => open[i] && runtime.puzzle.containers[i].capacity === when.count && units.length === when.count
        && units.every(unit => runtime.unitColors.get(unit) === when.color));
    });
    if (!pending.length) return { state: state(contents, open, [...fired]), known: canonicalKnown(runtime, known), events };
    const unlocked: string[] = [];
    for (const trigger of pending) {
      fired.add(trigger.id);
      for (const id of trigger.unlock) {
        const i = runtime.containerIndex.get(id)!;
        if (!open[i]) { open[i] = true; unlocked.push(id); }
      }
    }
    events.push(Object.freeze({ type: 'unlock', containers: frozen(unlocked), triggers: frozen(pending.map(t => t.id)) }));
  }
  throw new Error('Trigger termination invariant violated');
}
export function initialEngineState(runtime: EngineRuntime): { state: EngineState; known: readonly string[] } {
  const puzzle = runtime.puzzle;
  const next = settle(runtime, puzzle.containers.map(c => c.units), puzzle.containers.map(c => !puzzle.locked.includes(c.id)), [], []);
  return { state: next.state, known: next.known };
}
export function evaluateEngineGoal(runtime: EngineRuntime, current: EngineState, goal: SortingGoal = runtime.puzzle.goal): boolean {
  const contents = (id: string) => current.contents[runtime.containerIndex.get(id)!];
  const color = (unit: string) => runtime.unitColors.get(unit)!;
  switch (goal.type) {
    case 'sort': {
      const selected = goal.containers.map(contents);
      return selected.every(units => !units.length) || sortedContainers(selected, i => runtime.puzzle.containers[runtime.containerIndex.get(goal.containers[i])!].capacity, color);
    }
    case 'collect': {
      const units = contents(goal.container), count = units.filter(unit => color(unit) === goal.color).length;
      return (goal.exact ? count === goal.count : count >= goal.count) && (!goal.exclusive || units.every(unit => color(unit) === goal.color));
    }
    case 'sequence': { const units = contents(goal.container); return units.length === goal.colors.length && units.every((unit, i) => color(unit) === goal.colors[i]); }
    case 'all': return goal.goals.every(g => evaluateEngineGoal(runtime, current, g));
  }
}
export function engineTransferAmount(runtime: EngineRuntime, current: EngineState, known: readonly string[], source: number, target: number): number {
  return transferWithKnowledge(runtime, current, known.length === runtime.puzzle.units.length ? null : new Set(known), source, target);
}
function transferWithKnowledge(runtime: EngineRuntime, current: EngineState, knowledge: ReadonlySet<string> | null, source: number, target: number): number {
  const from = runtime.puzzle.containers[source], to = runtime.puzzle.containers[target];
  if (!Number.isInteger(source) || !Number.isInteger(target) || source === target || !from || !to || !current.open[source] || !current.open[target]) return 0;
  return transferAmount(current.contents[source], current.contents[target], unit => runtime.unitColors.get(unit)!, {
    capacity: to.capacity, amount: runtime.puzzle.amount, receive: to.receive, sourceEnabled: from.canSource, targetEnabled: to.canReceive, floor: from.protectedBottom, acceptColors: to.acceptColors,
  }, knowledge ? unit => knowledge.has(unit) : undefined);
}
export function listEngineActions(runtime: EngineRuntime, current: EngineState, known: readonly string[]): readonly EngineAction[] {
  const actions: EngineAction[] = [], knowledge = known.length === runtime.puzzle.units.length ? null : new Set(known);
  for (let source = 0; source < current.contents.length; source++) for (let target = 0; target < current.contents.length; target++) {
    if (transferWithKnowledge(runtime, current, knowledge, source, target)) actions.push(Object.freeze({ type: 'transfer', source: runtime.puzzle.containers[source].id, target: runtime.puzzle.containers[target].id }));
  }
  return frozen(actions);
}
export function hasEngineAction(runtime: EngineRuntime, current: EngineState, known: readonly string[]): boolean {
  const knowledge = known.length === runtime.puzzle.units.length ? null : new Set(known);
  for (let source = 0; source < current.contents.length; source++) for (let target = 0; target < current.contents.length; target++) {
    if (transferWithKnowledge(runtime, current, knowledge, source, target)) return true;
  }
  return false;
}
export function transitionEngine(runtime: EngineRuntime, current: EngineState, known: readonly string[], action: EngineAction): EngineResult {
  if (!action || action.type !== 'transfer' || Object.keys(action).some(key => !['type', 'source', 'target'].includes(key))) return { accepted: false, reason: 'invalidAction' };
  const source = runtime.containerIndex.get(action.source), target = runtime.containerIndex.get(action.target);
  if (source === undefined || target === undefined) return { accepted: false, reason: 'invalidAction' };
  if (!current.open[source] || !current.open[target]) return { accepted: false, reason: 'unavailable' };
  const amount = engineTransferAmount(runtime, current, known, source, target);
  if (!amount) return { accepted: false, reason: 'illegalTransfer' };
  const units = current.contents[source].slice(-amount);
  const contents = current.contents.map((values, i) => i === source ? values.slice(0, -amount) : i === target ? [...values, ...units] : values);
  const next = settle(runtime, contents, current.open, current.fired, known);
  const events: EngineEvent[] = [Object.freeze({ type: 'transfer', source: action.source, target: action.target, units: frozen(units) }), ...next.events];
  if (evaluateEngineGoal(runtime, next.state) && !evaluateEngineGoal(runtime, current)) events.push(Object.freeze({ type: 'solved' }));
  return Object.freeze({ accepted: true, state: next.state, known: next.known, events: frozen(events) });
}

export type VisibleEngineContainer = { readonly id: string; readonly capacity: number; readonly fixed: boolean; readonly locked: boolean;
  readonly canSource: boolean; readonly canReceive: boolean; readonly colors: readonly (string | null)[]; readonly count: number | null };
export function visibleEngineState(runtime: EngineRuntime, current: EngineState, known: readonly string[], seen: readonly string[] = []): readonly VisibleEngineContainer[] {
  const knowledge = new Set(known);
  return frozen(runtime.puzzle.containers.map((c, i) => {
    const units = current.contents[i], visible = seen.includes(c.id) || units.some(unit => knowledge.has(unit)) || current.open[i];
    return Object.freeze({ id: c.id, capacity: c.capacity, fixed: c.fixed, locked: !current.open[i],
      canSource: current.open[i] && c.canSource, canReceive: current.open[i] && c.canReceive,
      count: visible ? units.length : null, colors: frozen(visible ? units.map(unit => knowledge.has(unit) ? runtime.unitColors.get(unit)! : null) : []) });
  }));
}
export function visibleEngineEvents(events: readonly EngineEvent[], known: readonly string[]): readonly EngineEvent[] {
  const knowledge = new Set(known);
  // Unit identities in transfer/reveal events are visible only after disclosure.
  return frozen(events.map(event => event.type === 'transfer' || event.type === 'reveal'
    ? Object.freeze({ ...event, units: frozen(event.units.filter(unit => knowledge.has(unit))) }) : event));
}

/** Strict checkpoint validation, separate from transition execution. */
export function validateEngineState(runtime: EngineRuntime, input: EngineState, known: readonly string[]): void {
  const fail = () => { throw new Error('Invalid engine checkpoint'); };
  if (!input || Object.keys(input).some(key => !['contents', 'open', 'fired'].includes(key)) || !Array.isArray(input.contents) || !Array.isArray(input.open) || !Array.isArray(input.fired)
    || input.contents.length !== runtime.puzzle.containers.length || input.open.length !== input.contents.length || input.open.some(v => typeof v !== 'boolean')
    || !Array.isArray(known) || new Set(known).size !== known.length || known.some(u => !runtime.unitColors.has(u))) fail();
  const assigned: string[] = [];
  input.contents.forEach((units, i) => {
    const definition = runtime.puzzle.containers[i];
    if (!Array.isArray(units) || units.length > definition.capacity || units.some(u => !runtime.unitColors.has(u))
      || definition.units.slice(0, definition.protectedBottom).some((unit, depth) => units[depth] !== unit)) fail();
    assigned.push(...units);
  });
  if (assigned.length !== runtime.puzzle.units.length || new Set(assigned).size !== assigned.length || new Set(input.fired).size !== input.fired.length
    || input.fired.some(id => !runtime.puzzle.triggers.some(t => t.id === id))) fail();
  const fired = new Set(input.fired);
  runtime.puzzle.containers.forEach((c, i) => {
    const expected = !runtime.puzzle.locked.includes(c.id) || runtime.puzzle.triggers.some(t => fired.has(t.id) && t.unlock.includes(c.id));
    if (input.open[i] !== expected) fail();
  });
  const required = new Set(known);
  if (expose(runtime, input, required).length) fail();
}

export type EngineFrame = { readonly state: EngineState; readonly known: readonly string[] };
export type EngineCheckpoint = EngineFrame & { readonly seen: readonly string[] };
export type EngineSession = { readonly runtime: EngineRuntime; readonly attempt: string; readonly revision: number;
  readonly state: EngineState; readonly known: readonly string[]; readonly seen: readonly string[]; readonly history: readonly EngineCheckpoint[]; readonly offset: number;
  readonly historyBytes: number; readonly status: 'playing' | 'stalled' | 'solved' };
export const ENGINE_HISTORY_LIMIT = 4096;
export const ENGINE_HISTORY_BYTE_LIMIT = 8 * 1024 * 1024;
const checkpointSizes = new WeakMap<EngineCheckpoint, number>();
function checkpointBytes(frame: EngineCheckpoint) {
  let bytes = checkpointSizes.get(frame);
  if (bytes === undefined) { bytes = JSON.stringify(frame).length; checkpointSizes.set(frame, bytes); }
  return bytes;
}
function session(runtime: EngineRuntime, attempt: string, revision: number, current: EngineState, known: readonly string[], history: readonly EngineCheckpoint[], offset: number, previousSeen: readonly string[] = [], historyBytes = 0): EngineSession {
  const status = evaluateEngineGoal(runtime, current) ? 'solved' : hasEngineAction(runtime, current, known) ? 'playing' : 'stalled';
  const seen = frozen(runtime.puzzle.containers.filter((c, i) => current.open[i] || previousSeen.includes(c.id)).map(c => c.id));
  return Object.freeze({ runtime, attempt, revision, state: current, known, seen, history: frozen(history), offset, historyBytes, status });
}
export function createEngineSession(input: unknown, attempt: string): EngineSession {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(attempt)) throw new Error('Invalid attempt identity');
  const runtime = compileSortingPuzzle(input), initial = initialEngineState(runtime);
  return session(runtime, attempt, 0, initial.state, initial.known, [], 0);
}
export function moveEngineSession(current: EngineSession, action: EngineAction, expectedRevision = current.revision): { session: EngineSession; events: readonly EngineEvent[] } | null {
  if (expectedRevision !== current.revision || current.status === 'solved') return null;
  const result = transitionEngine(current.runtime, current.state, current.known, action);
  if (!result.accepted) return null;
  const checkpoint = Object.freeze({ state: current.state, known: current.known, seen: current.seen });
  let bytes = current.historyBytes + checkpointBytes(checkpoint), trimmed = 0;
  while (trimmed < current.history.length && (current.history.length + 1 - trimmed > ENGINE_HISTORY_LIMIT || bytes > ENGINE_HISTORY_BYTE_LIMIT)) bytes -= checkpointBytes(current.history[trimmed++]);
  const history = [...current.history.slice(trimmed), checkpoint];
  return { session: session(current.runtime, current.attempt, current.revision + 1, result.state, result.known, history, current.offset + trimmed, current.seen, bytes), events: result.events };
}
export function undoEngineSession(current: EngineSession): EngineSession {
  if (!current.history.length) return current;
  const previous = current.history.at(-1)!;
  return session(current.runtime, current.attempt, current.revision + 1, previous.state, current.known, current.history.slice(0, -1), current.offset, current.seen, current.historyBytes - checkpointBytes(previous));
}
export function resetEngineSession(current: EngineSession): EngineSession {
  const initial = initialEngineState(current.runtime);
  return session(current.runtime, current.attempt, current.revision + 1, initial.state, initial.known, [], 0);
}

export type SavedEngineSession = { readonly format: 'engine-session-v1'; readonly binding: string; readonly attempt: string; readonly revision: number;
  readonly state: EngineState; readonly known: readonly string[]; readonly seen: readonly string[]; readonly history: readonly EngineCheckpoint[]; readonly offset: number };
export function saveEngineSession(current: EngineSession): SavedEngineSession {
  return Object.freeze({ format: 'engine-session-v1', binding: current.runtime.binding, attempt: current.attempt, revision: current.revision,
    state: current.state, known: current.known, seen: current.seen, history: current.history, offset: current.offset });
}
/** Incremental validation keeps long cold restores cooperative on mobile. */
export function createEngineRestoreTask(input: unknown, saved: SavedEngineSession) {
  const runtime = compileSortingPuzzle(input);
  function* restore(): Generator<void, EngineSession> {
    if (!saved || Object.keys(saved).some(key => !['format', 'binding', 'attempt', 'revision', 'state', 'known', 'seen', 'history', 'offset'].includes(key))
      || saved.format !== 'engine-session-v1' || saved.binding !== runtime.binding || !/^[a-zA-Z0-9_-]{1,96}$/.test(saved.attempt)
      || !Number.isSafeInteger(saved.revision) || saved.revision < 0 || !Number.isSafeInteger(saved.offset) || saved.offset < 0
      || !Array.isArray(saved.history) || saved.history.length > ENGINE_HISTORY_LIMIT || saved.revision < saved.offset + saved.history.length) throw new Error('Invalid engine session binding');
    const checkpoints: readonly EngineCheckpoint[] = [...saved.history, { state: saved.state, known: saved.known, seen: saved.seen }];
    const history: EngineCheckpoint[] = [];
    let bytes = 0;
    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];
      if (!checkpoint || Object.keys(checkpoint).some(key => !['state', 'known', 'seen'].includes(key)) || !Array.isArray(checkpoint.seen)
        || new Set(checkpoint.seen).size !== checkpoint.seen.length || checkpoint.seen.some(id => runtime.containerIndex.get(id) === undefined)) throw new Error('Invalid checkpoint fields');
      validateEngineState(runtime, checkpoint.state, checkpoint.known);
      if (runtime.puzzle.containers.some((c, n) => checkpoint.state.open[n] && !checkpoint.seen.includes(c.id))) throw new Error('Invalid seen containers');
      const size = checkpointBytes(checkpoint);
      if (size > 131072) throw new Error('Sorting checkpoint exceeds storage budget');
      if (i < saved.history.length) {
        bytes += size;
        if (bytes > ENGINE_HISTORY_BYTE_LIMIT) throw new Error('Sorting history exceeds storage budget');
        history.push(Object.freeze({ state: state(checkpoint.state.contents, checkpoint.state.open, checkpoint.state.fired),
          known: canonicalKnown(runtime, new Set(checkpoint.known)), seen: frozen(checkpoint.seen) }));
      }
      yield;
    }
    const first = checkpoints[0], initial = initialEngineState(runtime);
    if (!saved.offset && JSON.stringify(first.state) !== JSON.stringify(initial.state)) throw new Error('Invalid initial checkpoint');
    for (let i = 1; i < checkpoints.length; i++) {
      const previous = checkpoints[i - 1], next = checkpoints[i];
      if (previous.known.some(unit => !next.known.includes(unit)) || previous.seen.some(id => !next.seen.includes(id))) throw new Error('Knowledge regressed');
      // Exactly two stacks change. Infer the single candidate instead of replaying every pair.
      const changed = previous.state.contents.flatMap((units, n) => JSON.stringify(units) === JSON.stringify(next.state.contents[n]) ? [] : [n]);
      const source = changed.find(n => previous.state.contents[n].length > next.state.contents[n].length);
      const target = changed.find(n => previous.state.contents[n].length < next.state.contents[n].length);
      if (changed.length !== 2 || source === undefined || target === undefined || evaluateEngineGoal(runtime, previous.state)) throw new Error('Invalid engine history transition');
      const result = transitionEngine(runtime, previous.state, previous.known, { type: 'transfer', source: runtime.puzzle.containers[source].id, target: runtime.puzzle.containers[target].id });
      if (!result.accepted || JSON.stringify(result.state) !== JSON.stringify(next.state) || result.known.some(unit => !next.known.includes(unit))) throw new Error('Invalid engine history transition');
      yield;
    }
    return session(runtime, saved.attempt, saved.revision, state(saved.state.contents, saved.state.open, saved.state.fired), canonicalKnown(runtime, new Set(saved.known)), history, saved.offset, saved.seen, bytes);
  }
  const work = restore();
  let completed: EngineSession | null = null;
  return { step(checkpoints = 64, milliseconds = 4): EngineSession | null {
    if (completed) return completed;
    if (!Number.isSafeInteger(checkpoints) || checkpoints < 1 || !Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Invalid restore slice');
    const begin = performance.now();
    for (let i = 0; i < checkpoints; i++) {
      const next = work.next();
      if (next.done) { completed = next.value; return completed; }
      if (performance.now() - begin >= milliseconds) break;
    }
    return null;
  } };
}
export function restoreEngineSession(input: unknown, saved: SavedEngineSession): EngineSession {
  const task = createEngineRestoreTask(input, saved);
  let restored; do { restored = task.step(); } while (!restored);
  return restored;
}
