import assert from 'node:assert/strict';
import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, transitionEngine, visibleEngineState, type EngineFrame, type EngineAction } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { solveBoard } from '../../src/game/solver.ts';
import { assertRatingScope } from './unlockRatingGraph.ts';

export const PUBLIC_DISCLOSURE_METHOD = 'single-key-public-disclosure-v1';
export const PUBLIC_DISCLOSURE_BUDGET = Object.freeze({ maxWorlds: 256, maxStatesPerWorld: 100000, maxTotalStates: 1000000, maxMilliseconds: 30000 });
export type DisclosureBudget = { maxWorlds: number; maxStatesPerWorld: number; maxTotalStates: number; maxMilliseconds: number; reuseContinuations?: boolean; compactContinuations?: boolean };
export function validateDisclosureBudget(budget: DisclosureBudget) {
  if (!Number.isSafeInteger(budget.maxWorlds) || budget.maxWorlds < 1 || budget.maxWorlds > 500000
    || !Number.isSafeInteger(budget.maxStatesPerWorld) || budget.maxStatesPerWorld < 1 || budget.maxStatesPerWorld > 1000000
    || !Number.isSafeInteger(budget.maxTotalStates) || budget.maxTotalStates < 1 || budget.maxTotalStates > 50000000
    || (budget.compactContinuations !== undefined && typeof budget.compactContinuations !== 'boolean')
    || (budget.reuseContinuations !== undefined && typeof budget.reuseContinuations !== 'boolean')
    || !Number.isFinite(budget.maxMilliseconds) || budget.maxMilliseconds <= 0 || budget.maxMilliseconds > 1800000) throw new Error('Invalid public disclosure budget');
}

// Counts inside locked bottles are concealed. Enumerate all capacity-compatible
// count distributions as well as every distinct color order, lazily and bounded.
function* lengths(total: number, bottles: number, head: number[] = []): Generator<number[]> {
  if (!bottles) { if (!total) yield head; return; }
  for (let n = Math.max(0, total - 4 * (bottles - 1)); n <= Math.min(4, total); n++) yield* lengths(total - n, bottles - 1, [...head, n]);
}
function* orders(counts: Map<string, number>, total: number, head: string[] = []): Generator<string[]> {
  if (!total) { yield head; return; }
  for (const [color, n] of counts) if (n) {
    counts.set(color, n - 1); yield* orders(counts, total - 1, [...head, color]); counts.set(color, n);
  }
}

/** Shared inventory-only enumeration. Neither concealed counts nor per-bottle
 * true multisets constrain possible public worlds. Stable IDs preserve color. */
export function* concealedInventoryWorlds(puzzle: SortingPuzzle) {
  const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
  const unknown = new Set(locked.flatMap(c => c.units));
  const counts = new Map([...puzzle.colors].sort().map(color => [color, 4 - puzzle.units.filter(u => !unknown.has(u.id) && u.color === color).length]));
  const pools = new Map([...counts.keys()].map(color => [color, puzzle.units.filter(u => unknown.has(u.id) && u.color === color).map(u => u.id).sort()]));
  for (const sizes of lengths(unknown.size, locked.length)) for (const order of orders(counts, unknown.size)) {
    let offset = 0;
    const contents = sizes.map(size => { const stack = order.slice(offset, offset + size); offset += size; return stack; });
    const used = new Map<string, number>();
    const units = contents.map(stack => stack.map(color => { const i = used.get(color) ?? 0; used.set(color, i + 1); return pools.get(color)![i]; }));
    yield { contents, units };
  }
}

/** A single public preparation must work in all inventory-consistent worlds;
 * after the only disclosure each world may use its own visible continuation.
 * This proves existence, not safety of arbitrary wrong moves or discoverability. */
export function proveSingleKeyDisclosure(puzzle: SortingPuzzle, route: readonly EngineAction[], budget: DisclosureBudget = PUBLIC_DISCLOSURE_BUDGET, acceptEarlyCompletion = false) {
  validateDisclosureBudget(budget); assertRatingScope(puzzle);
  const started = performance.now(), runtime = compileSortingPuzzle(puzzle), trigger = puzzle.triggers[0];
  assert.ok(puzzle.hidden.length === 0 && puzzle.triggers.length === 1 && trigger.when.type === 'empty'
    && puzzle.locked.length > 0 && puzzle.locked.every(id => trigger.unlock.includes(id)), 'Requires one key opening all concealed bottles');
  const initial = initialEngineState(runtime);
  replayEngineRoute(runtime, initial, route);
  const prefixFrames: EngineFrame[] = [];
  const prefix: EngineAction[] = [], observations: ReturnType<typeof visibleEngineState>[] = [];
  let frame = initial;
  for (const action of route) {
    prefixFrames.push(frame);
    observations.push(visibleEngineState(runtime, frame.state, frame.known));
    const next = transitionEngine(runtime, frame.state, frame.known, action); assert.ok(next.accepted);
    prefix.push(action); frame = next;
    if (frame.state.fired.includes(trigger.id)) break;
  }
  assert.ok(frame.state.fired.includes(trigger.id) && frame.state.open.every(Boolean), 'Certificate must reach the only disclosure');
  const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
  const unknown = locked.flatMap(c => c.units), unknownSet = new Set(unknown);
  assert.deepEqual(puzzle.units.filter(u => !initial.known.includes(u.id)).map(u => u.id).sort(), [...unknown].sort());
  // Only the public four-of-each inventory minus visible units defines counts.
  const counts = new Map([...puzzle.colors].sort().map(color => [color, 4 - puzzle.units.filter(u => !unknownSet.has(u.id) && u.color === color).length]));
  const pools = new Map([...counts.keys()].map(color => [color, unknown.filter(id => runtime.unitColors.get(id) === color).sort()]));
  type World = PublicDisclosureWorld;
  const lockIndices = puzzle.containers.map(c => locked.findIndex(l => l.id === c.id));
  // Every preparation transfer uses two open bottles. With a single empty-key
  // trigger and no progressive masks, replacing untouched locked contents cannot
  // alter legality, amount or observations. Only early completion depends on them.
  for (const [i, action] of prefix.entries()) {
    assert.equal(action.type, 'transfer');
    if (action.type === 'transfer') for (const id of [action.source, action.target]) assert.ok(prefixFrames[i].state.open[runtime.containerIndex.get(id)!]);
  }
  const couldComplete = prefixFrames.map(base => base.state.contents.every((stack, i) => !base.state.open[i] || !stack.length
    || (stack.length === 4 && stack.every(u => runtime.unitColors.get(u) === runtime.unitColors.get(stack[0])))));
  const worlds: World[] = []; let states = 0;
  // Optional offline acceleration: once every bottle is open, physical order
  // does not change this classic whole-sort task. Re-map and replay each route.
  const continuations = new Map<string, Extract<ReturnType<typeof solveBoard>, { status: 'solved' | 'unsolvable' }>>();
  const finish = (status: World['status'], reason: string | null) => ({ method: PUBLIC_DISCLOSURE_METHOD, status, reason, budget,
    criterion: acceptEarlyCompletion ? 'common-public-prefix-until-complete-or-visible-continuation' : 'common-public-prefix-then-visible-completion', prefix, locked: locked.map(c => c.id), worlds, states,
    limits: 'Enumerates concealed counts and color orders from public inventory, not just the true locked multiset per bottle. Allows a different fully visible continuation after opening. Does not prove every move safe, human discoverability or equal difficulty in every world.' });
  for (const sizes of lengths(unknown.length, locked.length)) for (const order of orders(counts, unknown.length)) {
    if (performance.now() - started >= budget.maxMilliseconds) return finish('unknown', 'public-time-budget');
    if (worlds.length >= budget.maxWorlds) return finish('unknown', 'public-world-budget');
    if (states >= budget.maxTotalStates) return finish('unknown', 'public-total-state-budget');
    let offset = 0;
    const contents = sizes.map(size => { const stack = order.slice(offset, offset + size); offset += size; return stack; });
    const used = new Map<string, number>();
    const units = contents.map(stack => stack.map(color => { const i = used.get(color) ?? 0; used.set(color, i + 1); return pools.get(color)![i]; }));
    // In this classic scope the rules, unit colors and permissions are fixed;
    // only concealed initial contents vary. Reuse the validated runtime and
    // substitute a frame, rather than decode the same rules for every world.
    const world = budget.reuseContinuations ? runtime : compileSortingPuzzle({ ...puzzle, containers: puzzle.containers.map(c => {
      const i = locked.findIndex(l => l.id === c.id); return i < 0 ? c : { ...c, units: units[i] };
    }) });
    const substituted = (base: EngineFrame): EngineFrame => ({ state: { ...base.state, contents: base.state.contents.map((stack, i) => lockIndices[i] < 0 ? stack : units[lockIndices[i]]) }, known: base.known });
    const worldInitial = budget.reuseContinuations ? substituted(initial) : initialEngineState(world);
    let current = worldInitial;
    let completedEarly = false;
    for (const [i, action] of prefix.entries()) {
      if (budget.reuseContinuations) {
        if (!couldComplete[i]) continue; // A visible partial/mixed bottle rules out completion in every world.
        current = substituted(prefixFrames[i]);
      }
      // A hint preserves success if this possible world already completed. The
      // stage/rating certificate keeps its original, stricter common-key policy.
      if (acceptEarlyCompletion && evaluateEngineGoal(world, current.state)) {
        replayEngineRoute(world, worldInitial, prefix.slice(0, i)); completedEarly = true; break;
      }
      if (evaluateEngineGoal(world, current.state) || (!budget.reuseContinuations && JSON.stringify(visibleEngineState(world, current.state, current.known)) !== JSON.stringify(observations[i]))) {
        worlds.push({ contents, status: 'fail', reason: 'public-preparation-mismatch', continuation: null }); return finish('fail', 'public-preparation-mismatch');
      }
      if (budget.reuseContinuations) continue;
      const next = transitionEngine(world, current.state, current.known, action);
      if (!next.accepted) { worlds.push({ contents, status: 'fail', reason: 'public-preparation-illegal', continuation: null }); return finish('fail', 'public-preparation-illegal'); }
      current = next;
    }
    if (completedEarly) { worlds.push({ contents, status: 'pass', reason: null, continuation: [] }); continue; }
    if (budget.reuseContinuations) current = substituted(frame);
    assert.ok(current.state.open.every(Boolean) && current.known.length === puzzle.units.length);
    const remaining = budget.maxMilliseconds - (performance.now() - started);
    if (remaining <= 0) return finish('unknown', 'public-time-budget');
    const board = current.state.contents.map(stack => stack.map(u => world.unitColors.get(u)!));
    const indices = board.map((_, i) => i);
    if (budget.reuseContinuations) indices.sort((a, b) => JSON.stringify(board[a]).localeCompare(JSON.stringify(board[b])) || a - b);
    const orderedBoard = indices.map(i => board[i]), identity = JSON.stringify(orderedBoard);
    let result = budget.reuseContinuations ? continuations.get(identity) : undefined;
    if (!result) {
      const searched = solveBoard(orderedBoard, {
        maxStates: Math.min(budget.maxStatesPerWorld, budget.maxTotalStates - states), maxMilliseconds: Math.min(remaining, 60000),
      });
      states += searched.stats.visitedStates;
      if (budget.reuseContinuations && (searched.status === 'solved' || searched.status === 'unsolvable')) continuations.set(identity, searched);
      if (searched.status !== 'solved' && searched.status !== 'unsolvable') {
        if (searched.status === 'invalid') throw new Error(`Invalid classic disclosure continuation: ${searched.issues.join(', ')}`);
        worlds.push({ contents, status: 'unknown', reason: `public-search-${searched.reason}`, continuation: null }); continue;
      }
      result = searched;
    }
    if (result.status === 'unsolvable') {
      worlds.push({ contents, status: 'fail', reason: 'public-world-unsolvable', continuation: null }); return finish('fail', 'public-world-unsolvable');
    }
    {
      const continuation: EngineAction[] = result.route.map(p => ({ type: 'transfer', source: puzzle.containers[indices[p.source]].id, target: puzzle.containers[indices[p.target]].id }));
      if (budget.reuseContinuations) replayEngineRoute(world, current, continuation);
      else replayEngineRoute(world, worldInitial, [...prefix, ...continuation]);
      worlds.push(budget.compactContinuations
        ? { contents, status: 'pass', reason: null, continuation: null, transfers: result.route.map(p => indices[p.source] * 16 + indices[p.target]) }
        : { contents, status: 'pass', reason: null, continuation });
    }
  }
  const unknownWorld = worlds.find(w => w.status === 'unknown');
  return finish(unknownWorld ? 'unknown' : 'pass', unknownWorld?.reason ?? null);
}


export type PublicDisclosureWorld = { contents: string[][]; status: 'pass' | 'fail' | 'unknown'; reason: string | null;
  continuation: readonly EngineAction[] | null; transfers?: readonly number[] };
/** Lossless offline certificate encoding for large all-world proofs. */
export function publicWorldContinuation(puzzle: SortingPuzzle, world: PublicDisclosureWorld): readonly EngineAction[] {
  if (world.continuation) return world.continuation;
  assert.equal(world.status, 'pass'); assert.ok(world.transfers);
  return world.transfers.map(code => {
    assert.ok(Number.isSafeInteger(code) && code >= 0);
    const source = puzzle.containers[Math.floor(code / 16)], target = puzzle.containers[code % 16];
    assert.ok(source && target);
    return { type: 'transfer', source: source.id, target: target.id };
  });
}
