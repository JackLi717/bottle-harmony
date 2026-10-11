import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState, listEngineActions, transitionEngine, evaluateEngineGoal, type EngineFrame } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { UNLOCK_BASELINE } from '../src/game/unlockBaseline.ts';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty, stageProgress, STAGE_POLICIES } from '../scripts/lib/unlockStageDifficulty.ts';
import { extractUnlockRating, ratingComparisonSet } from '../scripts/lib/unlockRatingEvidence.ts';

const tinyKey = engineFixture('stage-tiny', [['coral','coral'],['coral','coral'],[]], {
  locked: [1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
});
function measure(puzzle: SortingPuzzle) {
  const graph = buildRatingGraph(puzzle);
  assert.equal(graph.status, 'complete'); if (graph.status !== 'complete') throw new Error('Incomplete test graph');
  return { graph, rating: analyzeStageDifficulty(graph) };
}

/** Independent ORDERED-state engine graph. No production quotient, macros,
 * policy verifier or minimax helper is used by the reference calculation. */
function orderedOracle(puzzle: SortingPuzzle) {
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  const encode = (f: EngineFrame) => JSON.stringify([f.state.contents.map(s => s.map(u => runtime.unitColors.get(u))), f.state.open, f.state.fired]);
  const frames = [initial], edges: number[][] = [[]], seen = new Map([[encode(initial), 0]]);
  for (let i = 0; i < frames.length; i++) {
    if (evaluateEngineGoal(runtime, frames[i].state)) continue;
    for (const action of listEngineActions(runtime, frames[i].state, frames[i].known)) {
      const next = transitionEngine(runtime, frames[i].state, frames[i].known, action); assert.ok(next.accepted);
      let j = seen.get(encode(next));
      if (j === undefined) { j = frames.length; seen.set(encode(next), j); frames.push(next); edges.push([]); }
      edges[i].push(j);
    }
  }
  const solved = frames.map(f => evaluateEngineGoal(runtime, f.state));
  const solvable = new Set(solved.flatMap((yes, i) => yes ? [i] : []));
  for (let changed = true; changed;) {
    changed = false;
    edges.forEach((next, i) => { if (!solvable.has(i) && next.some(j => solvable.has(j))) { solvable.add(i); changed = true; } });
  }
  const trigger = puzzle.triggers[0], key = runtime.containerIndex.get(trigger.when.type === 'empty' ? trigger.when.container : '')!;
  const rank = (i: number, before: boolean) => {
    const f = frames[i];
    let runs = 0;
    f.state.contents.forEach((stack, b) => { if (!before || f.state.open[b]) stack.forEach((u, d) => { if (!d || runtime.unitColors.get(u) !== runtime.unitColors.get(stack[d - 1])) runs++; }); });
    return runs + (before ? f.state.contents[key].length * (puzzle.units.length + 1) : 0);
  };
  const goal = (i: number, before: boolean) => before ? frames[i].state.fired.includes(trigger.id) : solved[i];
  const evaluate = (before: boolean, config: typeof STAGE_POLICIES[number]) => {
    const next = new Map<number, number[]>(), memo = new Map<number, boolean>();
    const segments = (root: number) => {
      // Expand the induced non-progress subgraph by shortest distance, then
      // retain every exit at its own shortest depth (not only one route).
      const distance = new Map([[root, 0]]), queue = [root], exits = new Map<number, number>();
      for (let c = 0; c < queue.length; c++) {
        const i = queue[c], d = distance.get(i)!;
        if (d === config.chainLimit) continue;
        for (const j of edges[i]) {
          if (goal(j, before) || rank(j, before) < rank(root, before)) {
            exits.set(j, Math.min(exits.get(j) ?? Infinity, d + 1));
          } else if (!distance.has(j)) { distance.set(j, d + 1); queue.push(j); }
        }
      }
      return exits;
    };
    const cache = new Map<number, ReturnType<typeof segments>>();
    const macros = (i: number) => { if (!cache.has(i)) cache.set(i, segments(i)); return cache.get(i)!; };
    const peek = (i: number, depth: number): boolean => goal(i, before) || depth === 0
      || [...macros(i).keys()].some(j => peek(j, depth - 1));
    const verify = (i: number): boolean => {
      if (goal(i, before)) return true;
      if (memo.has(i)) return memo.get(i)!;
      const viable = [...macros(i)].filter(([j]) => peek(j, config.lookahead));
      const shortest = Math.min(...viable.map(([, d]) => d));
      const frontier = viable.filter(([, d]) => d === shortest).map(([j]) => j); next.set(i, frontier);
      const pass = frontier.length > 0 && frontier.every(j => verify(j)); memo.set(i, pass); return pass;
    };
    const outcomes = (root: number) => {
      const visited = new Set<number>(), ends = new Set<number>();
      const visit = (i: number) => { if (visited.has(i)) return; visited.add(i); if (goal(i, before)) ends.add(i); else next.get(i)!.forEach(visit); };
      visit(root); return ends;
    };
    return { verify, outcomes };
  };
  const pairs: { before: number; after: number; total: number; state: number }[] = [];
  const afterPolicies = STAGE_POLICIES.map(p => evaluate(false, p));
  for (const config of STAGE_POLICIES) {
    const policy = evaluate(true, config);
    if (!policy.verify(0)) continue;
    for (const state of policy.outcomes(0)) {
      if (!solvable.has(state)) continue;
      const after = solved[state] ? 0 : afterPolicies.findIndex(p => p.verify(state)) + 1;
      if (after > 0 || solved[state]) pairs.push({ state, before: config.rank, after, total: Math.max(config.rank, after) });
    }
  }
  return { pairs, rank: Math.min(...pairs.map(p => p.total)), states: frames.length };
}

test('single-key paired maximum agrees with independent ordered-state policy enumeration', () => {
  const puzzle = engineFixture('stage-mixed', [['coral','jade','coral','jade'],['jade','coral','jade','coral'],[],[]], {
    locked: [1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
  });
  const oracle = orderedOracle(puzzle), { graph, rating } = measure(puzzle);
  assert.ok(oracle.states > graph.nodes.length); assert.ok(new Set(oracle.pairs.map(p => p.state)).size > 1);
  assert.equal(rating.status, 'rated'); assert.equal(rating.rank, oracle.rank);
  assert.equal(rating.rank, Math.max(rating.beforeRank!, rating.afterRank!));
});

test('selected before and after witness is one complete replay with its actual stable-ID unlock frame', () => {
  for (const entry of [tinyKey, UNLOCK_BASELINE[1].puzzle, UNLOCK_BASELINE[3].puzzle, UNLOCK_BASELINE[5].puzzle]) {
    const { graph, rating } = measure(entry);
    assert.equal(rating.status, 'rated'); assert.ok(rating.witness);
    const w = rating.witness, trigger = entry.triggers[0].id;
    let frame = graph.nodes[0].frame;
    w.route.forEach((action, step) => {
      const next = transitionEngine(graph.runtime, frame.state, frame.known, action); assert.ok(next.accepted);
      assert.equal(next.state.fired.includes(trigger), step + 1 >= w.splitPour!);
      frame = next;
      if (step + 1 === w.splitPour) assert.deepEqual({ state: next.state, known: next.known }, w.unlockedFrame);
    });
    assert.ok(evaluateEngineGoal(graph.runtime, frame.state));
    assert.equal(rating.rank, Math.max(rating.beforeRank!, rating.afterRank!));
    const unlockedPuzzle = { ...entry, id: `${entry.id}-unlocked`, locked: [], triggers: [], hidden: [],
      containers: entry.containers.map((c, i) => ({ ...c, units: w.unlockedFrame!.state.contents[i] })) };
    assert.equal(measure(unlockedPuzzle).rating.rank, rating.afterRank);
    assert.ok(rating.prefixChecks!.slice(0, rating.beforeRank! - 1).every(p => p.status === 'failed'));
    if ('afterChecks' in rating) assert.ok(rating.afterChecks!.slice(0, rating.afterRank! - 1).every(p => p.status === 'failed'));
  }
});

test('key planning is independent of globally shortest completion prefixes; extra space can lower its grade', () => {
  const a = measure(UNLOCK_CALIBRATION[0].puzzle).rating;
  const b = measure(UNLOCK_CALIBRATION[1].puzzle).rating;
  assert.equal(a.status, 'rated'); assert.equal(b.status, 'rated');
  assert.equal(a.beforeRank, 2); assert.equal(b.beforeRank, 1);
  assert.equal(a.witness!.splitPour, 9); // The globally shortest complete route fires at 8.
  assert.equal(a.rank, 2); assert.equal(b.rank, 1);
  assert.ok(b.consideredUnlockStates! > 1);
});

test('more mechanical pours do not increase planning rank, and ordinary controls use the same ladder', () => {
  const one = engineFixture('stage-one-merge', [['coral','coral'],['coral','coral'],[]]);
  const many = engineFixture('stage-many-merges', [['coral','coral'],['coral','coral'],['jade','jade'],['jade','jade'],['azure','azure'],['azure','azure'],[]]);
  const a = measure(one), b = measure(many), key = measure(tinyKey);
  assert.equal(a.graph.shortestMoves, 1); assert.equal(b.graph.shortestMoves, 3);
  assert.equal(a.rating.rank, 1); assert.equal(b.rating.rank, 1); assert.equal(key.rating.rank, 1);
  assert.equal(a.rating.beforeRank, null);
  const hard = measure(UNLOCK_BASELINE[0].puzzle).rating;
  assert.equal(hard.rank, 4); assert.ok(hard.ordinaryChecks!.slice(0, 3).every(p => p.status === 'failed'));
});

test('already sorted ordinary boards have genuine zero-work difficulty', () => {
  const b = measure(engineFixture('stage-finished', [['coral','coral','coral','coral'],[]])).rating;
  assert.equal(b.rank, 0); assert.deepEqual(b.witness!.route, []);
});

test('graph/work limits are unknown, true unsolvability blocks, other mechanisms receive no grade', () => {
  const graph = buildRatingGraph(tinyKey); assert.equal(graph.status, 'complete');
  const limited = analyzeStageDifficulty(graph, 1); assert.equal(limited.status, 'unknown'); assert.equal(limited.rank, null);
  assert.equal(limited.reason, 'policy-work'); assert.equal(limited.work, 1);
  assert.equal(analyzeStageDifficulty(buildRatingGraph(tinyKey, 1)).status, 'unknown');
  for (const budget of [0, -1, Infinity, 0.5]) assert.throws(() => analyzeStageDifficulty(graph, budget));
  const stuck = engineFixture('stage-stuck', [['coral','jade','coral','jade'],['jade','coral','jade','coral']]);
  assert.equal(measure(stuck).rating.status, 'blocked');
  const cover = engineFixture('stage-cover', [['coral','coral'],['coral','coral'],[]], {
    locked: [2], triggers: [{ id: 'cover', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b2'] }],
  });
  const hidden = { ...tinyKey, hidden: [tinyKey.units[0].id] };
  const optional = engineFixture('stage-optional', [['coral','coral','coral','coral'],[],[]], {
    locked: [1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
  });
  for (const puzzle of [cover, hidden, optional]) { const a = measure(puzzle).rating; assert.equal(a.status, 'unsupported'); assert.equal(a.rank, null); }
});

test('key progress uses only open liquid, and completed ratings survive equivalent bottle and color renaming', () => {
  const graph = buildRatingGraph(tinyKey); if (graph.status !== 'complete') throw new Error('Expected graph');
  const changed = { ...tinyKey, containers: tinyKey.containers.map((c, i) => i === 1 ? { ...c, units: [...c.units].reverse() } : c) };
  const other = buildRatingGraph(changed); if (other.status !== 'complete') throw new Error('Expected graph');
  assert.equal(stageProgress(graph, 0, 0), stageProgress(other, 0, 0));
  const renamed = { ...tinyKey, id: 'stage-renamed', colors: ['x'], units: tinyKey.units.map(u => ({ id: 'x'+u.id, color: 'x' })),
    containers: [...tinyKey.containers].reverse().map(c => ({ ...c, id: 'x'+c.id, units: c.units.map(u => 'x'+u) })),
    goal: { type: 'sort' as const, containers: tinyKey.containers.map(c => 'x'+c.id) }, locked: ['xb1'],
    triggers: [{ id: 'renamed-key', when: { type: 'empty' as const, container: 'xb0' }, unlock: ['xb1'] }] };
  assert.equal(measure(renamed).rating.rank, measure(tinyKey).rating.rank);
  const p = UNLOCK_BASELINE[5].puzzle;
  const remapped = { ...p, id: 'stage-renamed-hard', colors: [...p.colors].reverse().map(c => 'x'+c),
    units: [...p.units].reverse().map(u => ({ id: 'x'+u.id, color: 'x'+u.color })),
    containers: [...p.containers].reverse().map(c => ({ ...c, id: 'x'+c.id, units: c.units.map(u => 'x'+u) })),
    goal: { type: 'sort' as const, containers: p.containers.map(c => 'x'+c.id) }, locked: p.locked.map(c => 'x'+c),
    triggers: p.triggers.map(t => ({ ...t, id: 'x'+t.id, when: { type: 'empty' as const, container: 'x'+(t.when.type === 'empty' ? t.when.container : '') }, unlock: t.unlock.map(c => 'x'+c) })) };
  assert.equal(measure(remapped).rating.rank, measure(p).rating.rank);
});

test('evidence binds the stage algorithm and budget; complete graph evidence never fills an unknown grade', () => {
  const input = { puzzle: tinyKey, design: { role: 'teaching' as const, family: 'test', purpose: { event: 'key' as const, description: 'Acquire the key.' } } };
  const set = ratingComparisonSet([input]);
  const full = extractUnlockRating(input, set), low = extractUnlockRating(input, set, 250000, 4000000, 1);
  assert.equal(full.status, 'complete'); assert.equal(low.status, 'complete');
  if (full.status !== 'complete' || low.status !== 'complete') return;
  assert.equal(full.evidence.stageDifficulty.status, 'rated'); assert.equal(full.evidence.stageDifficulty.rank, 1);
  assert.equal(low.evidence.stageDifficulty.status, 'unknown'); assert.equal(low.evidence.stageDifficulty.rank, null);
  assert.notEqual(full.evidenceSha256, low.evidenceSha256);
  replayEngineRoute(compileSortingPuzzle(tinyKey), initialEngineState(compileSortingPuzzle(tinyKey)), full.evidence.stageDifficulty.witness!.route);
});
