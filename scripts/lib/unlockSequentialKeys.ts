import assert from 'node:assert/strict';
import { compileSortingPuzzle, initialEngineState, transitionEngine, type EngineFrame, type EngineAction } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle, SortingTrigger } from '../../src/game/engineModel.ts';

/** Rule structure, independent of trigger array order or the hidden colors. */
export function sequentialKeys(puzzle: SortingPuzzle): { status: 'supported'; keys: [SortingTrigger, SortingTrigger] } | { status: 'unsupported'; reason: string } {
  compileSortingPuzzle(puzzle);
  const no = (reason: string) => ({ status: 'unsupported' as const, reason });
  if (puzzle.hidden.length || puzzle.triggers.length !== 2 || puzzle.triggers.some(t => t.when.type !== 'empty')) return no('requires-two-bottom-keys');
  const first = puzzle.triggers.find(t => t.when.type === 'empty' && !puzzle.locked.includes(t.when.container));
  const second = puzzle.triggers.find(t => t !== first);
  if (!first || !second || second.when.type !== 'empty' || !first.unlock.includes(second.when.container)) return no('requires-first-group-to-contain-second-key');
  const targets = [...first.unlock, ...second.unlock];
  if (!first.unlock.length || !second.unlock.length || new Set(targets).size !== targets.length
    || targets.length !== puzzle.locked.length || targets.some(id => !puzzle.locked.includes(id))) return no('requires-disjoint-groups-covering-all-locks');
  if (puzzle.triggers.some(t => { const when = t.when; return when.type === 'empty' && !puzzle.containers.find(c => c.id === when.container)!.units.length; })) return no('requires-nonempty-key-bottles');
  return { status: 'supported', keys: [first, second] };
}

/** Content quality gates, never a difficulty bonus or a gameplay restriction. */
export function unlockQualityBounds(puzzle: SortingPuzzle) {
  compileSortingPuzzle(puzzle);
  const covered = new Set(puzzle.locked).size, bottles = puzzle.containers.length;
  const keys = puzzle.triggers.filter(t => t.when.type === 'empty').length;
  return { covered, bottles, maxCovered: Math.floor(bottles / 2), keys, maxKeys: 4,
    checks: [
      { check: 'cover-limit', status: covered * 2 <= bottles ? 'pass' as const : 'fail' as const, code: covered * 2 <= bottles ? 'cover-within-half' : 'cover-exceeds-half', reason: `整瓶遮盖 ${covered}／${bottles}，上限 ${Math.floor(bottles / 2)} 瓶。` },
      { check: 'key-limit', status: keys <= 4 ? 'pass' as const : 'fail' as const, code: keys <= 4 ? 'keys-within-four' : 'keys-exceed-four', reason: `底部钥匙 ${keys} 把，上限四把。` },
    ] };
}

export function validateDoubleKeyWitness(puzzle: SortingPuzzle, witness: {
  route: readonly EngineAction[]; keys: readonly string[]; splitPours: readonly number[]; openedFrames: readonly EngineFrame[];
}) {
  const scope = sequentialKeys(puzzle); assert.ok(scope.status === 'supported');
  assert.deepEqual(witness.keys, scope.keys.map(t => t.id));
  assert.equal(witness.splitPours.length, 2); assert.equal(witness.openedFrames.length, 2);
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  replayEngineRoute(runtime, initial, witness.route);
  const cuts: number[] = []; let frame = initial;
  for (const [i, action] of witness.route.entries()) {
    const next = transitionEngine(runtime, frame.state, frame.known, action); assert.ok(next.accepted);
    for (const [j, t] of scope.keys.entries()) if (!frame.state.fired.includes(t.id) && next.state.fired.includes(t.id)) {
      assert.equal(cuts.length, j); cuts.push(i + 1);
      assert.deepEqual({ state: next.state, known: next.known }, witness.openedFrames[j]);
    }
    frame = { state: next.state, known: next.known };
  }
  assert.deepEqual(cuts, witness.splitPours); assert.ok(cuts[0] > 0 && cuts[1] > cuts[0]);
  return { runtime, initial };
}
