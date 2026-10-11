import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSortingPuzzle, initialEngineState, evaluateEngineGoal, listEngineActions, transitionEngine, type EngineFrame } from '../src/game/engine.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty, STAGE_POLICIES } from '../scripts/lib/unlockStageDifficulty.ts';
import { analyzeDoubleKeyDifficulty } from '../scripts/lib/unlockDoubleKeyDifficulty.ts';
import { analyzeDoubleKeyRhythm } from '../scripts/lib/unlockDoubleKeyRhythm.ts';
import { DOUBLE_KEY_SAMPLES } from '../scripts/lib/unlockDoubleKeySamples.ts';
import { sequentialKeys, validateDoubleKeyWitness } from '../scripts/lib/unlockSequentialKeys.ts';

/** Independent ordered color-state graph and exhaustive three-task coupling.
 * No production graph quotient, progress function, macro or policy is called. */
function orderedOracle(puzzle: SortingPuzzle) {
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  const scope = sequentialKeys(puzzle); assert.ok(scope.status === 'supported');
  const keyIndices = scope.keys.map(t => runtime.containerIndex.get(t.when.type === 'empty' ? t.when.container : '')!);
  const encode = (f: EngineFrame) => JSON.stringify([f.state.contents.map(s => s.map(u => runtime.unitColors.get(u))), f.state.open, [...f.state.fired].sort()]);
  const frames = [initial], edges: number[][] = [[]], seen = new Map([[encode(initial), 0]]);
  for (let i = 0; i < frames.length; i++) {
    if (evaluateEngineGoal(runtime, frames[i].state)) continue;
    for (const a of listEngineActions(runtime, frames[i].state, frames[i].known)) {
      const next = transitionEngine(runtime, frames[i].state, frames[i].known, a); assert.ok(next.accepted);
      let j = seen.get(encode(next));
      if (j === undefined) { j = frames.length; seen.set(encode(next), j); frames.push(next); edges.push([]); }
      edges[i].push(j);
    }
  }
  const solved = frames.map(f => evaluateEngineGoal(runtime, f.state));
  const solvable = new Set(solved.flatMap((yes, i) => yes ? [i] : []));
  for (let changed = true; changed;) { changed = false; edges.forEach((next, i) => { if (!solvable.has(i) && next.some(j => solvable.has(j))) { solvable.add(i); changed = true; } }); }
  const phase = (task: number, config: typeof STAGE_POLICIES[number]) => {
    const done = (i: number) => task < 2 ? frames[i].state.fired.includes(scope.keys[task].id) : solved[i];
    const progress = (i: number) => {
      const f = frames[i]; let runs = 0;
      f.state.contents.forEach((s, b) => { if (task === 2 || f.state.open[b]) s.forEach((u, d) => { if (!d || runtime.unitColors.get(u) !== runtime.unitColors.get(s[d - 1])) runs++; }); });
      return runs + (task < 2 ? f.state.contents[keyIndices[task]].length * (puzzle.units.length + 1) : 0);
    };
    const segments = new Map<number, Map<number, number>>(), fronts = new Map<number, number[]>(), memo = new Map<number, boolean>(), peekMemo = new Map<string, boolean>();
    const exits = (root: number) => {
      if (segments.has(root)) return segments.get(root)!;
      const distance = new Map([[root, 0]]), queue = [root], ends = new Map<number, number>();
      for (let c = 0; c < queue.length; c++) {
        const i = queue[c], depth = distance.get(i)!; if (depth === config.chainLimit) continue;
        for (const j of edges[i]) {
          if (done(j) || progress(j) < progress(root)) ends.set(j, Math.min(ends.get(j) ?? Infinity, depth + 1));
          else if (!distance.has(j)) { distance.set(j, depth + 1); queue.push(j); }
        }
      }
      segments.set(root, ends); return ends;
    };
    const peek = (i: number, depth: number): boolean => {
      if (done(i) || !depth) return true;
      const k = `${i}:${depth}`; if (peekMemo.has(k)) return peekMemo.get(k)!;
      const yes = [...exits(i).keys()].some(j => peek(j, depth - 1)); peekMemo.set(k, yes); return yes;
    };
    const verify = (i: number): boolean => {
      if (done(i)) return true; if (memo.has(i)) return memo.get(i)!;
      const viable = [...exits(i)].filter(([j]) => peek(j, config.lookahead));
      const best = Math.min(...viable.map(([, d]) => d)), next = viable.filter(([, d]) => d === best).map(([j]) => j); fronts.set(i, next);
      const yes = !!next.length && next.every(verify); memo.set(i, yes); return yes;
    };
    const endpoints = (root: number) => {
      const ends = new Set<number>(), visited = new Set<number>();
      const visit = (i: number) => { if (visited.has(i)) return; visited.add(i); if (done(i)) ends.add(i); else fronts.get(i)!.forEach(visit); };
      visit(root); return ends;
    };
    return { verify, endpoints };
  };
  const policies = [0,1,2].map(task => STAGE_POLICIES.map(p => phase(task, p)));
  const first = new Map<number, number>();
  for (const [q, policy] of policies[0].entries()) if (policy.verify(0)) for (const a of policy.endpoints(0)) if (solvable.has(a) && !first.has(a)) first.set(a, q + 1);
  const pairs: { a: number; b: number; ranks: number[]; rank: number }[] = [];
  for (const [a, one] of first) {
    const second = new Map<number, number>();
    for (const [q, policy] of policies[1].entries()) if (policy.verify(a)) for (const b of policy.endpoints(a)) if (solvable.has(b) && !second.has(b)) second.set(b, q + 1);
    for (const [b, two] of second) {
      const tail = solved[b] ? 0 : policies[2].findIndex(p => p.verify(b)) + 1;
      if (!tail && !solved[b]) continue;
      const ranks = [one, two, tail]; pairs.push({ a, b, ranks, rank: Math.max(...ranks) });
    }
  }
  return { rank: Math.min(...pairs.map(p => p.rank)), pairs, states: frames.length };
}

test('three-task minimax matches independent ordered-state enumeration, including multiple coupled endpoints', () => {
  for (const { puzzle } of [DOUBLE_KEY_SAMPLES[0], DOUBLE_KEY_SAMPLES[2]]) {
    const oracle = orderedOracle(puzzle), graph = buildRatingGraph(puzzle), rating = analyzeDoubleKeyDifficulty(graph);
    assert.equal(graph.status, 'complete'); assert.ok(graph.status === 'complete');
    assert.ok(oracle.states > graph.nodes.length); assert.ok(oracle.pairs.length > 1);
    assert.equal(rating.status, 'rated'); assert.equal(rating.rank, oracle.rank);
    assert.equal(rating.rank, Math.max(...rating.stageRanks!));
  }
});

test('mechanical controls stay rank one; witnesses retain actual two openings and final ordinary difficulty', () => {
  for (const [i, { puzzle }] of DOUBLE_KEY_SAMPLES.entries()) {
    const graph = buildRatingGraph(puzzle), rating = analyzeDoubleKeyDifficulty(graph);
    assert.equal(rating.status, 'rated'); assert.ok(rating.status === 'rated');
    assert.deepEqual(rating.stageRanks, i < 2 ? [1,1,1] : [2,1,1]);
    const { runtime } = validateDoubleKeyWitness(puzzle, rating.witness);
    const frame = rating.witness.openedFrames[1];
    const ordinary = { ...puzzle, locked: [], triggers: [], containers: puzzle.containers.map((c, j) => ({ ...c, units: frame.state.contents[j] })) };
    assert.equal(analyzeStageDifficulty(buildRatingGraph(ordinary)).rank, rating.stageRanks[2]);
    assert.equal(evaluateEngineGoal(runtime, rating.witness.openedFrames[0].state), false);
    const rhythm = analyzeDoubleKeyRhythm(graph, rating);
    assert.equal(rhythm.status, 'pass'); assert.deepEqual(rhythm.stageWork, i === 0 ? [1,1,1] : i === 1 ? [1,1,2] : [3,1,2]);
    assert.equal(rhythm.before, rhythm.stageWork![0] + rhythm.stageWork![1]);
    const forged = structuredClone(rating); forged.witness.splitPours = [rating.witness.splitPours[0] + 1, rating.witness.splitPours[1]];
    assert.throws(() => analyzeDoubleKeyRhythm(graph, forged));
  }
});

test('lower-policy work limits are unknown and trigger order or stable-ID renaming cannot change ranks', () => {
  const puzzle = DOUBLE_KEY_SAMPLES[2].puzzle, graph = buildRatingGraph(puzzle);
  const limited = analyzeDoubleKeyDifficulty(graph, 1);
  assert.equal(limited.status, 'unknown'); assert.equal(limited.rank, null); assert.equal(limited.work, 1);
  assert.equal(analyzeDoubleKeyDifficulty(buildRatingGraph(puzzle, 1)).status, 'unknown');
  for (const budget of [0, -1, Infinity, 0.5]) assert.throws(() => analyzeDoubleKeyDifficulty(graph, budget));
  const renamed: SortingPuzzle = { ...puzzle, id: 'renamed', colors: [...puzzle.colors].reverse().map(c => 'x'+c),
    units: [...puzzle.units].reverse().map(u => ({ id: 'x'+u.id, color: 'x'+u.color })),
    containers: [...puzzle.containers].reverse().map(c => ({ ...c, id: 'x'+c.id, units: c.units.map(u => 'x'+u) })),
    goal: { type: 'sort', containers: puzzle.containers.map(c => 'x'+c.id) }, locked: puzzle.locked.map(c => 'x'+c),
    triggers: [...puzzle.triggers].reverse().map(t => ({ id: 'x'+t.id, when: { type: 'empty', container: 'x'+(t.when.type === 'empty' ? t.when.container : '') }, unlock: t.unlock.map(c => 'x'+c) })) };
  const result = analyzeDoubleKeyDifficulty(buildRatingGraph(renamed)); assert.equal(result.rank, analyzeDoubleKeyDifficulty(graph).rank);
  assert.equal(analyzeDoubleKeyDifficulty(buildRatingGraph({ ...puzzle, triggers: [...puzzle.triggers].reverse() })).rank, result.rank);
});
