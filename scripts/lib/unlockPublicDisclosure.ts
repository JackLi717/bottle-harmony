import assert from 'node:assert/strict';
import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, transitionEngine, visibleEngineState, type EngineAction } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { solveBoard } from '../../src/game/solver.ts';
import { assertRatingScope } from './unlockRatingGraph.ts';

export const PUBLIC_DISCLOSURE_METHOD = 'single-key-public-disclosure-v1';
export const PUBLIC_DISCLOSURE_BUDGET = Object.freeze({ maxWorlds: 256, maxStatesPerWorld: 100000, maxTotalStates: 1000000, maxMilliseconds: 30000 });
export type DisclosureBudget = { maxWorlds: number; maxStatesPerWorld: number; maxTotalStates: number; maxMilliseconds: number };
export function validateDisclosureBudget(budget: DisclosureBudget) {
  if (!Number.isSafeInteger(budget.maxWorlds) || budget.maxWorlds < 1 || budget.maxWorlds > 10000
    || !Number.isSafeInteger(budget.maxStatesPerWorld) || budget.maxStatesPerWorld < 1 || budget.maxStatesPerWorld > 1000000
    || !Number.isSafeInteger(budget.maxTotalStates) || budget.maxTotalStates < 1 || budget.maxTotalStates > 10000000
    || !Number.isFinite(budget.maxMilliseconds) || budget.maxMilliseconds <= 0 || budget.maxMilliseconds > 60000) throw new Error('Invalid public disclosure budget');
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

/** A single public preparation must work in all inventory-consistent worlds;
 * after the only disclosure each world may use its own visible continuation.
 * This proves existence, not safety of arbitrary wrong moves or discoverability. */
export function proveSingleKeyDisclosure(puzzle: SortingPuzzle, route: readonly EngineAction[], budget: DisclosureBudget = PUBLIC_DISCLOSURE_BUDGET) {
  validateDisclosureBudget(budget); assertRatingScope(puzzle);
  const started = performance.now(), runtime = compileSortingPuzzle(puzzle), trigger = puzzle.triggers[0];
  assert.ok(puzzle.hidden.length === 0 && puzzle.triggers.length === 1 && trigger.when.type === 'empty'
    && puzzle.locked.length > 0 && puzzle.locked.every(id => trigger.unlock.includes(id)), 'Requires one key opening all concealed bottles');
  const initial = initialEngineState(runtime);
  replayEngineRoute(runtime, initial, route);
  const prefix: EngineAction[] = [], observations: ReturnType<typeof visibleEngineState>[] = [];
  let frame = initial;
  for (const action of route) {
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
  type World = { contents: string[][]; status: 'pass' | 'fail' | 'unknown'; reason: string | null; continuation: readonly EngineAction[] | null };
  const worlds: World[] = []; let states = 0;
  const finish = (status: World['status'], reason: string | null) => ({ method: PUBLIC_DISCLOSURE_METHOD, status, reason, budget,
    criterion: 'common-public-prefix-then-visible-completion', prefix, locked: locked.map(c => c.id), worlds, states,
    limits: 'Enumerates concealed counts and color orders from public inventory, not just the true locked multiset per bottle. Allows a different fully visible continuation after opening. Does not prove every move safe, human discoverability or equal difficulty in every world.' });
  for (const sizes of lengths(unknown.length, locked.length)) for (const order of orders(counts, unknown.length)) {
    if (performance.now() - started >= budget.maxMilliseconds) return finish('unknown', 'public-time-budget');
    if (worlds.length >= budget.maxWorlds) return finish('unknown', 'public-world-budget');
    if (states >= budget.maxTotalStates) return finish('unknown', 'public-total-state-budget');
    let offset = 0;
    const contents = sizes.map(size => { const stack = order.slice(offset, offset + size); offset += size; return stack; });
    const used = new Map<string, number>();
    const units = contents.map(stack => stack.map(color => { const i = used.get(color) ?? 0; used.set(color, i + 1); return pools.get(color)![i]; }));
    const world = compileSortingPuzzle({ ...puzzle, containers: puzzle.containers.map(c => {
      const i = locked.findIndex(l => l.id === c.id); return i < 0 ? c : { ...c, units: units[i] };
    }) });
    let current = initialEngineState(world);
    for (const [i, action] of prefix.entries()) {
      if (evaluateEngineGoal(world, current.state) || JSON.stringify(visibleEngineState(world, current.state, current.known)) !== JSON.stringify(observations[i])) {
        worlds.push({ contents, status: 'fail', reason: 'public-preparation-mismatch', continuation: null }); return finish('fail', 'public-preparation-mismatch');
      }
      const next = transitionEngine(world, current.state, current.known, action);
      if (!next.accepted) { worlds.push({ contents, status: 'fail', reason: 'public-preparation-illegal', continuation: null }); return finish('fail', 'public-preparation-illegal'); }
      current = next;
    }
    assert.ok(current.state.open.every(Boolean) && current.known.length === puzzle.units.length);
    const remaining = budget.maxMilliseconds - (performance.now() - started);
    if (remaining <= 0) return finish('unknown', 'public-time-budget');
    const result = solveBoard(current.state.contents.map(stack => stack.map(u => world.unitColors.get(u)!)), {
      maxStates: Math.min(budget.maxStatesPerWorld, budget.maxTotalStates - states), maxMilliseconds: remaining,
    });
    states += result.stats.visitedStates;
    if (result.status === 'invalid') throw new Error(`Invalid classic disclosure continuation: ${result.issues.join(', ')}`);
    if (result.status === 'unsolvable') {
      worlds.push({ contents, status: 'fail', reason: 'public-world-unsolvable', continuation: null }); return finish('fail', 'public-world-unsolvable');
    }
    if (result.status === 'limitReached') worlds.push({ contents, status: 'unknown', reason: `public-search-${result.reason}`, continuation: null });
    else {
      const continuation: EngineAction[] = result.route.map(p => ({ type: 'transfer', source: puzzle.containers[p.source].id, target: puzzle.containers[p.target].id }));
      replayEngineRoute(world, initialEngineState(world), [...prefix, ...continuation]);
      worlds.push({ contents, status: 'pass', reason: null, continuation });
    }
  }
  const unknownWorld = worlds.find(w => w.status === 'unknown');
  return finish(unknownWorld ? 'unknown' : 'pass', unknownWorld?.reason ?? null);
}
