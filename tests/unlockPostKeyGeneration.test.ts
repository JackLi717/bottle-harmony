import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState, transitionEngine, evaluateEngineGoal, listEngineActions } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { buildRatingGraph, ratingStateKey, type RatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty, stageProgress } from '../scripts/lib/unlockStageDifficulty.ts';
import { unlockTrialStructure } from '../scripts/lib/unlockTrialAudit.ts';
import { postKeyOrigin, reconstructPostKeyClassic, postKeyOverlays, postKeyWorldCount, postKeyStageInTarget, POST_KEY_RECIPE } from '../scripts/lib/unlockPostKeyGeneration.ts';
import { auditUnlockVisualTemplates } from '../scripts/lib/unlockVisualTemplates.ts';

test('larger classic-core recipe preserves inventory, separate source reconstruction and fixed box geometry', () => {
  assert.deepEqual(POST_KEY_RECIPE.target, { min: 4, max: 6 }); assert.equal(POST_KEY_RECIPE.afterMin, 3);
  const generators = new Set<string>(), sizes = new Set<number>(), cuts = new Set<number>();
  for (const template of [2, 3] as const) for (let i = 0; i < 12; i++) {
    const origin = postKeyOrigin(template, i), source = reconstructPostKeyClassic(origin);
    assert.deepEqual(source, reconstructPostKeyClassic(origin));
    assert.equal(source.bottles.length, source.colors.length + 2); assert.ok([9, 10].includes(source.bottles.length));
    assert.ok(source.bottles.filter(b => !b.layers.length).length <= 2);
    for (const c of source.colors) assert.equal(source.bottles.flatMap(b => b.layers).filter(v => v === c).length, 4);
    generators.add(origin.generator); sizes.add(source.bottles.length); cuts.add(origin.cut);
    const overlays = postKeyOverlays(origin); assert.equal(overlays.length, origin.colors - 3);
    for (const overlay of overlays) {
      assert.equal(overlay.puzzle.locked.length, template);
      assert.equal(auditUnlockVisualTemplates(overlay.puzzle).status, 'pass');
      assert.deepEqual(overlay.order.map(b => source.bottles[b].layers), overlay.puzzle.containers.map(c => c.units.map(id => overlay.puzzle.units.find(u => u.id === id)!.color)));
      assert.equal(overlay.worlds, postKeyWorldCount(source.bottles.map(b => b.layers), overlay.locked));
      if (template === 3) assert.equal(overlay.worlds, 6300);
    }
  }
  assert.equal(generators.size, 2); assert.equal(sizes.size, 2); assert.equal(cuts.size, 3);
  assert.throws(() => postKeyOrigin(2, -1)); assert.throws(() => reconstructPostKeyClassic({ ...postKeyOrigin(3, 1), cut: 0 as 1 }));
});

test('public budget precheck counts concealed lengths as well as orders', () => {
  assert.equal(postKeyWorldCount([['a', 'a'], ['b', 'b']], [0, 1]), 30); // six orders, five size distributions
  assert.equal(postKeyWorldCount([['a','a','b','b'],['a','a'],['c','c']], [0,1,2]), 6300);
});

test('larger graph collapses spent key roles only after opening and keeps physical roles', () => {
  const puzzle = engineFixture('larger-key', [['a','a'],['a','a'],[],[],[],[],[],[],[]], {
    locked: [1], fixed: [8], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
  });
  const runtime = compileSortingPuzzle(puzzle), key = ratingStateKey(runtime), initial = initialEngineState(runtime);
  const opened = transitionEngine(runtime, initial.state, initial.known, { type: 'transfer', source: 'b0', target: 'b2' }); assert.ok(opened.accepted);
  const moved = transitionEngine(runtime, opened.state, opened.known, { type: 'transfer', source: 'b2', target: 'b0' }); assert.ok(moved.accepted);
  assert.equal(key(opened), key(moved));
  const fixed = transitionEngine(runtime, opened.state, opened.known, { type: 'transfer', source: 'b2', target: 'b8' }); assert.ok(fixed.accepted);
  assert.notEqual(key(opened), key(fixed));
  const graph = buildRatingGraph(puzzle); assert.equal(graph.status, 'complete'); if (graph.status !== 'complete') throw new Error('Missing graph');
  assert.equal(graph.shortestMoves, 2); replayEngineRoute(runtime, initial, graph.route);
  const stage = analyzeStageDifficulty(graph); assert.equal(stage.status, 'rated'); assert.equal(stage.rank, 1);
  assert.equal(postKeyStageInTarget(stage), false);
  assert.equal(postKeyStageInTarget(analyzeStageDifficulty(buildRatingGraph(puzzle, 1))), false);
  assert.throws(() => buildRatingGraph(engineFixture('too-large', [...Array(11)].map(() => []))));
});

test('larger structural dedup keeps keys and locks while ignoring color and bottle names', () => {
  const origin = postKeyOrigin(3, 1), puzzle = postKeyOverlays(origin)[0].puzzle;
  const renamed = { ...puzzle, id: 'renamed', colors: [...puzzle.colors].reverse().map(c => `renamed-${c}`),
    units: puzzle.units.map(u => ({ ...u, color: `renamed-${u.color}` })), containers: [...puzzle.containers].reverse() };
  assert.equal(unlockTrialStructure(renamed), unlockTrialStructure(puzzle));
  const changed = { ...puzzle, triggers: [{ ...puzzle.triggers[0], when: { type: 'empty' as const, container: 'b1' } }] };
  assert.notEqual(unlockTrialStructure(changed), unlockTrialStructure(puzzle));
});

test('larger quotient preserves every ordered-state continuation and stage progress', () => {
  for (const size of [9, 10]) {
    const puzzle = engineFixture(`ordered-oracle-${size}`, [['a','a'],['a','a'],['b','b'],['b','b'], ...Array.from({ length: size - 4 }, () => [])], {
      locked: [2, 3], fixed: [size - 1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2', 'b3'] }],
    });
    const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime), quotient = ratingStateKey(runtime);
    const colors = (frame: typeof initial) => frame.state.contents.map(stack => stack.map(u => runtime.unitColors.get(u)));
    const ordered = (frame: typeof initial) => JSON.stringify([colors(frame), frame.state.open, frame.state.fired]);
    const queue = [initial], seen = new Set([ordered(initial)]), signatures = new Map<string, string>();
    let shortest: number | null = null;
    const depths = [0];
    for (let i = 0; i < queue.length; i++) {
      const frame = queue[i], solved = evaluateEngineGoal(runtime, frame.state);
      if (solved && shortest === null) shortest = depths[i];
      const nextKeys = new Set<string>();
      if (!solved) for (const action of listEngineActions(runtime, frame.state, frame.known)) {
        const next = transitionEngine(runtime, frame.state, frame.known, action); assert.ok(next.accepted);
        nextKeys.add(quotient(next));
        const identity = ordered(next);
        if (!seen.has(identity)) { seen.add(identity); queue.push({ state: next.state, known: next.known }); depths.push(depths[i] + 1); }
      }
      const runs = colors(frame).reduce((n, stack) => n + stack.filter((c, i) => !i || c !== stack[i - 1]).length, 0);
      const before = frame.state.fired.length ? null : stageProgress({ runtime, nodes: [{ frame }] } as RatingGraph, 0, 0);
      const signature = JSON.stringify([solved, runs, before, [...nextKeys].sort()]);
      const prior = signatures.get(quotient(frame));
      if (prior !== undefined) assert.equal(signature, prior, 'Merged states must have identical goals, progress and continuation classes');
      signatures.set(quotient(frame), signature);
      assert.ok(queue.length < 100000, 'Ordered oracle budget');
    }
    const graph = buildRatingGraph(puzzle); assert.equal(graph.status, 'complete');
    if (graph.status !== 'complete') throw new Error('Graph missing');
    assert.equal(graph.shortestMoves, shortest); assert.equal(graph.nodes.length, signatures.size);
    assert.ok(queue.length > graph.nodes.length, 'Oracle must exercise real merging');
  }
});

test('larger ordinary comparison retains exact classic structural deduplication', () => {
  const puzzle = postKeyOverlays(postKeyOrigin(3, 1))[0].puzzle;
  const ordinary = { ...puzzle, triggers: [], locked: [] };
  assert.equal(unlockTrialStructure(ordinary), unlockTrialStructure({ ...ordinary, containers: [...ordinary.containers].reverse() }));
  assert.notEqual(unlockTrialStructure(ordinary), unlockTrialStructure(puzzle));
});
