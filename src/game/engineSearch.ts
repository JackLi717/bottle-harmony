import { compileSortingPuzzle, evaluateEngineGoal, listEngineActions, transitionEngine, validateEngineState,
  type EngineAction, type EngineFrame, type EngineRuntime, type EngineSession } from './engine.ts';

export type EngineSearchStats = { readonly visited: number; readonly expanded: number; readonly peakFrontier: number; readonly estimatedBytes: number; readonly activeMilliseconds: number };
export type EngineSearchResult =
  | { readonly status: 'solved'; readonly route: readonly EngineAction[]; readonly shortest: true; readonly stats: EngineSearchStats }
  | { readonly status: 'unsolvable'; readonly stats: EngineSearchStats }
  | { readonly status: 'unknown'; readonly reason: 'states' | 'time' | 'memory' | 'cancelled'; readonly stats: EngineSearchStats };
export type EngineSearchOptions = { readonly maxStates?: number; readonly maxMilliseconds?: number; readonly maxEstimatedBytes?: number };
export type EngineSearchTask = { step(expansions?: number, milliseconds?: number): EngineSearchResult | null; cancel(): EngineSearchResult };
const clock = () => performance.now();

/** Complete-state BFS is the correctness baseline. No unproved heuristic or bottle symmetry. */
export function createEngineProofSearch(runtime: EngineRuntime, start: EngineFrame, options: EngineSearchOptions = {}): EngineSearchTask {
  validateEngineState(runtime, start.state, start.known);
  const maxStates = options.maxStates ?? 30000, maxMilliseconds = options.maxMilliseconds ?? 250, maxBytes = options.maxEstimatedBytes ?? 32 * 1024 * 1024;
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000 || !Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024) throw new Error('Invalid engine search budget');
  const codes = new Map(runtime.puzzle.units.map(u => [u.id, runtime.puzzle.colors.indexOf(u.color) * 3]));
  const key = (frame: EngineFrame) => {
    const known = new Set(frame.known);
    // Identity is immaterial only for units with equal color and disclosure behavior.
    // Container order, permissions/goal roles (in the shared definition), locks and triggers stay fixed.
    const contents = frame.state.contents.map(units => units.map(unit => String.fromCharCode(65 + codes.get(unit)! + (known.has(unit) ? 1 : runtime.hidden.has(unit) ? 2 : 0))).join('')).join('|');
    return `${contents}#${frame.state.open.map(Number).join('')}#${frame.state.fired.join(',')}`;
  };
  type Node = { frame: EngineFrame | null; parent: number; action: EngineAction | null; actions: readonly EngineAction[] | null; cursor: number };
  const nodes: Node[] = [{ frame: start, parent: -1, action: null, actions: null, cursor: 0 }], seen = new Set([key(start)]);
  let cursor = 0, visited = 1, expanded = 0, peakFrontier = 1, bytes = key(start).length * 2 + runtime.puzzle.units.length * 8 + 256, active = 0;
  let result: EngineSearchResult | null = null;
  const stats = (): EngineSearchStats => Object.freeze({ visited, expanded, peakFrontier, estimatedBytes: bytes, activeMilliseconds: active });
  function finish(value: Omit<Extract<EngineSearchResult, { status: 'solved' }>, 'stats'> | { status: 'unsolvable' } | { status: 'unknown'; reason: 'states' | 'time' | 'memory' | 'cancelled' }) {
    result = Object.freeze({ ...value, stats: stats() }); nodes.length = 0; seen.clear(); return result;
  }
  return {
    cancel() { return result ?? finish({ status: 'unknown', reason: 'cancelled' }); },
    step(expansions = 64, milliseconds = 4) {
      if (result) return result;
      if (!Number.isSafeInteger(expansions) || expansions < 1 || !Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error('Invalid search slice');
      const begin = clock(), endCount = expanded + expansions;
      const done = (value: Parameters<typeof finish>[0]) => { active += clock() - begin; return finish(value); };
      while (cursor < nodes.length) {
        if (active + clock() - begin >= maxMilliseconds) return done({ status: 'unknown', reason: 'time' });
        if (bytes > maxBytes) return done({ status: 'unknown', reason: 'memory' });
        if (expanded >= endCount || clock() - begin >= milliseconds) { active += clock() - begin; return null; }
        const node = nodes[cursor], frame = node.frame!;
        if (!node.actions) {
          if (evaluateEngineGoal(runtime, frame.state)) {
            const route: EngineAction[] = [];
            for (let n = cursor; nodes[n].parent >= 0; n = nodes[n].parent) route.push(nodes[n].action!);
            return done({ status: 'solved', route: Object.freeze(route.reverse()), shortest: true });
          }
          node.actions = listEngineActions(runtime, frame.state, frame.known);
        }
        while (node.cursor < node.actions.length) {
          if (active + clock() - begin >= maxMilliseconds) return done({ status: 'unknown', reason: 'time' });
          if (clock() - begin >= milliseconds) { active += clock() - begin; return null; }
          const action = node.actions[node.cursor++], next = transitionEngine(runtime, frame.state, frame.known, action);
          if (!next.accepted) throw new Error('Action enumeration disagreed with transition');
          const nextKey = key(next);
          if (seen.has(nextKey)) continue;
          if (visited >= maxStates) return done({ status: 'unknown', reason: 'states' });
          const allocation = nextKey.length * 2 + runtime.puzzle.units.length * 8 + runtime.puzzle.containers.length * 32 + 256;
          if (bytes + allocation > maxBytes) return done({ status: 'unknown', reason: 'memory' });
          bytes += allocation; seen.add(nextKey); visited++;
          nodes.push({ frame: { state: next.state, known: next.known }, parent: cursor, action, actions: null, cursor: 0 });
          peakFrontier = Math.max(peakFrontier, nodes.length - cursor - 1);
        }
        node.frame = null; node.actions = null; cursor++; expanded++;
      }
      return done({ status: 'unsolvable' });
    },
  };
}
export function replayEngineRoute(runtime: EngineRuntime, initial: EngineFrame, route: readonly EngineAction[]): EngineFrame {
  validateEngineState(runtime, initial.state, initial.known);
  let frame = initial;
  for (const action of route) {
    if (evaluateEngineGoal(runtime, frame.state)) throw new Error('Route continues after completion');
    const next = transitionEngine(runtime, frame.state, frame.known, action);
    if (!next.accepted) throw new Error('Illegal engine route');
    frame = { state: next.state, known: next.known };
  }
  if (!evaluateEngineGoal(runtime, frame.state)) throw new Error('Incomplete engine route');
  return frame;
}

export type EngineHintResult = { readonly status: 'hint'; readonly action: EngineAction; readonly attempt: string; readonly revision: number; readonly binding: string; readonly worlds: number }
  | { readonly status: 'unknown'; readonly reason: 'information' | 'budget' | 'cancelled' }
  | { readonly status: 'unsolvable' | 'complete' };
export type EngineHintTask = { step(): EngineHintResult | null; cancel(): EngineHintResult };

/** Hidden classic hints must preserve a solution in every inventory-consistent world.
 * This proves one safe step, not a full adaptive-policy/fairness proof for the puzzle. */
export function createEngineHintTask(current: EngineSession, options: EngineSearchOptions & { maxWorlds?: number } = {}): EngineHintTask {
  const setupBegin = clock();
  const { runtime, state, known } = current, maxWorlds = options.maxWorlds ?? 32, totalTime = options.maxMilliseconds ?? 250;
  if (!Number.isInteger(maxWorlds) || maxWorlds < 1 || maxWorlds > 128 || !Number.isFinite(totalTime) || totalTime <= 0 || totalTime > 60000) throw new Error('Invalid hint budget');
  let result: EngineHintResult | null = current.status === 'solved' ? { status: 'complete' } : null;
  const unknown = runtime.puzzle.units.filter(u => !known.includes(u.id));
  // Four of each color is public classic inventory. General hidden-inventory rules are not inferred from secret content.
  const classicInventory = runtime.puzzle.containers.every(c => c.capacity === 4 && c.receive === 'same')
    && runtime.puzzle.colors.every(color => runtime.puzzle.units.filter(u => u.color === color).length === 4);
  if (!result && unknown.length && !classicInventory) result = { status: 'unknown', reason: 'information' };
  if (!result && runtime.puzzle.containers.some((c, i) => !state.open[i] && !current.seen.includes(c.id))) result = { status: 'unknown', reason: 'information' };
  const worlds: EngineRuntime[] = [];
  let overflow = false, setupLimited = false;
  if (!result && unknown.length) {
    const remaining = new Map(runtime.puzzle.colors.map(color => [color, runtime.puzzle.units.filter(u => u.color === color && !known.includes(u.id)).length]));
    const assignment = new Map<string, string>();
    const enumerate = (index: number) => {
      if (overflow) return;
      if (clock() - setupBegin >= Math.min(totalTime, 4)) { overflow = true; setupLimited = true; return; }
      if (index === unknown.length) {
        if (worlds.length >= maxWorlds) { overflow = true; return; }
        const world = compileSortingPuzzle({ ...runtime.puzzle, units: runtime.puzzle.units.map(u => ({ ...u, color: assignment.get(u.id) ?? u.color })) });
        // A completion that has not occurred is also public information.
        if (!evaluateEngineGoal(world, state)) worlds.push(world);
        return;
      }
      for (const color of runtime.puzzle.colors) {
        const count = remaining.get(color)!;
        if (!count) continue;
        remaining.set(color, count - 1); assignment.set(unknown[index].id, color); enumerate(index + 1); remaining.set(color, count); assignment.delete(unknown[index].id);
        if (overflow) return;
      }
    };
    enumerate(0);
    if (overflow || !worlds.length) result = { status: 'unknown', reason: setupLimited ? 'budget' : 'information' };
  } else if (!result) worlds.push(runtime);
  const candidates = listEngineActions(runtime, state, known);
  let candidate = 0, world = 0, active = clock() - setupBegin, search: EngineSearchTask | null = null;
  const finish = (value: EngineHintResult) => { search?.cancel(); search = null; worlds.length = 0; result = Object.freeze(value); return result; };
  return {
    cancel() { return result ?? finish({ status: 'unknown', reason: 'cancelled' }); },
    step() {
      if (result) return result;
      if (candidate >= candidates.length) return finish(unknown.length ? { status: 'unknown', reason: 'information' } : { status: 'unsolvable' });
      const begin = clock();
      if (active >= totalTime) return finish({ status: 'unknown', reason: 'budget' });
      if (!search) {
        const possible = worlds[world], next = transitionEngine(possible, state, known, candidates[candidate]);
        if (!next.accepted) throw new Error('Hint candidate depends on hidden information');
        search = createEngineProofSearch(possible, next, { ...options, maxMilliseconds: Math.max(.01, totalTime - active) });
      }
      const outcome = search.step(32, 3);
      active += clock() - begin;
      if (!outcome) return null;
      search = null;
      if (outcome.status === 'unknown') return finish({ status: 'unknown', reason: 'budget' });
      if (outcome.status === 'unsolvable') { candidate++; world = 0; return null; }
      world++;
      if (world < worlds.length) return null;
      return finish({ status: 'hint', action: candidates[candidate], attempt: current.attempt, revision: current.revision, binding: runtime.binding, worlds: worlds.length });
    },
  };
}
