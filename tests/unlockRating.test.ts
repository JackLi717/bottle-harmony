import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState, listEngineActions, transitionEngine, evaluateEngineGoal } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { extractUnlockRating, ratingComparisonSet, publicRatingFacts, ratingSpace, type RatingInput } from '../scripts/lib/unlockRatingEvidence.ts';
import { operationGrade, reviewTemplate, scoreUnlockRating, RATING_CHECKLISTS, type RatingMetric } from '../scripts/lib/unlockRatingScores.ts';

const design: RatingInput['design'] = { role: 'teaching', family: 'test', purpose: { event: 'sort', description: 'Sort all liquid.' } };
const small = engineFixture('rating-small', [['coral', 'jade', 'coral', 'jade'], ['jade', 'coral', 'jade', 'coral'], [], []]);
const input = { puzzle: small, design };
const comparison = ratingComparisonSet([input]);
const report = extractUnlockRating(input, comparison);
function complete(value: ReturnType<typeof extractUnlockRating>) {
  assert.equal(value.status, 'complete'); if (value.status !== 'complete') throw new Error('Expected complete evidence');
  return value;
}

test('D6 has exactly the approved bands and Q/D never redistribute missing weights', () => {
  for (const [moves, expected] of [[0,0],[6,0],[7,1],[12,1],[13,2],[18,2],[19,3],[24,3],[25,4],[30,4],[31,5],[80,5]]) assert.equal(operationGrade(moves), expected);
  for (const n of [-1, 0.5, Infinity, NaN]) assert.throws(() => operationGrade(n));
  const scores = scoreUnlockRating(small.id, report);
  assert.equal(scores.Q.score, null); assert.equal(scores.D.score, null);
  assert.equal(scores.Q.pending.length, 5); assert.equal(scores.D.pending.length, 5);
  assert.equal(scores.metrics.D6.source, 'automatic');
  assert.equal(scores.metrics.D5.grade, null); // No implicit zero/default grade even on a visible board.
});

test('manual scoring binds exact evidence, validates checklists and separates provenance', () => {
  const review = reviewTemplate(small.id, report);
  for (const [key, item] of Object.entries(review.metrics)) {
    item!.grade = key.startsWith('Q') ? 5 : 2;
    item!.reviewer = 'fixture-reviewer'; item!.reason = 'Synthetic aggregation test, not a real puzzle rating.';
    item!.checklist = RATING_CHECKLISTS[key as Exclude<RatingMetric, 'D6'>].map(() => true);
    item!.externalEvidence = key === 'Q3' ? ['test-only-ui-reference'] : [];
  }
  const scores = scoreUnlockRating(small.id, report, review);
  assert.equal(scores.Q.score, 100); assert.equal(scores.D.score, 38 + scores.metrics.D6.grade!);
  assert.equal(scores.metrics.D1.source, 'manual');
  assert.throws(() => scoreUnlockRating(small.id, report, { ...review, evidenceSha256: 'stale' }));
  assert.throws(() => scoreUnlockRating(small.id, report, { ...review, puzzle: 'another' }));
  const bad = structuredClone(review); bad.metrics.Q3!.externalEvidence = [];
  assert.throws(() => scoreUnlockRating(small.id, report, bad));
  const incomplete = structuredClone(review); incomplete.metrics.D1!.checklist[0] = false;
  assert.throws(() => scoreUnlockRating(small.id, report, incomplete));
  const overridden = { ...review, metrics: { ...review.metrics, D6: review.metrics.D1 } };
  assert.throws(() => scoreUnlockRating(small.id, report, overridden));
  const grade = structuredClone(review); grade.metrics.Q1!.grade = 6;
  assert.throws(() => scoreUnlockRating(small.id, report, grade));
  assert.throws(() => scoreUnlockRating(small.id, report, { ...review, extra: true }));
});

test('bounded searches are unknown, complete exhaustion is unsolvable, unsupported rules reject', () => {
  assert.throws(() => ratingComparisonSet([input,input]));
  assert.throws(() => extractUnlockRating({ ...input, design: { ...design, role: 'challenge' } },comparison));
  const unknown = extractUnlockRating(input, comparison, 1);
  assert.equal(unknown.status, 'unknown'); assert.equal(scoreUnlockRating(small.id, unknown).metrics.D6.grade, null);
  assert.equal(buildRatingGraph(small, 100, 1).status, 'unknown');
  for (const n of [0, -1, NaN, 1.5]) assert.throws(() => buildRatingGraph(small, n));
  const stuck = { ...small, containers: small.containers.slice(0,2), goal: { type: 'sort' as const, containers: ['b0','b1'] } };
  const graph = buildRatingGraph(stuck); assert.equal(graph.status, 'complete');
  if (graph.status === 'complete') { assert.equal(graph.shortestMoves, null); assert.ok(graph.deadEnds > 0); }
  assert.throws(() => buildRatingGraph({ ...small, amount: 'one' }));
  assert.throws(() => buildRatingGraph({ ...small, goal: { type: 'collect', container: 'b0', color: 'coral', count: 4, exact: true, exclusive: true } }));
});

test('shortest/+2 corridors match an independent ordered-state BFS, and representative routes replay', () => {
  const runtime = compileSortingPuzzle(small), initial = initialEngineState(runtime);
  const key = (frame: typeof initial) => JSON.stringify([frame.state.contents.map(s => s.map(u => runtime.unitColors.get(u))), frame.state.open, frame.state.fired]);
  const states = [initial], depth = [0], edges: number[][] = [[]], seen = new Map([[key(initial),0]]);
  for (let i = 0; i < states.length; i++) {
    if (evaluateEngineGoal(runtime, states[i].state)) continue;
    for (const action of listEngineActions(runtime, states[i].state, states[i].known)) {
      const next = transitionEngine(runtime, states[i].state, states[i].known, action); assert.ok(next.accepted);
      let j = seen.get(key(next));
      if (j === undefined) { j = states.length; seen.set(key(next),j); states.push(next); depth.push(depth[i]+1); edges.push([]); }
      edges[i].push(j);
    }
  }
  const distance = states.map(s => evaluateEngineGoal(runtime,s.state) ? 0 : Infinity);
  let changed = true;
  while (changed) { changed = false; edges.forEach((next,i) => next.forEach(j => { if (distance[i] > distance[j]+1) { distance[i] = distance[j]+1; changed = true; } })); }
  const graph = buildRatingGraph(small); assert.equal(graph.status,'complete'); if (graph.status !== 'complete') return;
  assert.equal(graph.shortestMoves,distance[0]); replayEngineRoute(graph.runtime,graph.nodes[0].frame,graph.route);
  const evidence = complete(report).evidence;
  for (const [extra,corridor] of [[0,evidence.shortest],[2,evidence.plusTwo]] as const) {
    const unique: Set<string> = new Set(states.flatMap((s,i): string[] => depth[i]+distance[i] <= distance[0]+extra ? [graph.key(s)] : []));
    assert.equal(corridor.states,unique.size);
    assert.ok(corridor.examples.every(e => e.candidates.length === new Set(graph.nodes[e.state].edges.map(x => x.to)).size));
    corridor.examples.forEach(example => example.candidates.forEach(candidate => {
      const next = transitionEngine(graph.runtime,example.frame.state,example.frame.known,candidate.action); assert.ok(next.accepted);
      assert.equal(graph.key(next),graph.key(graph.nodes[candidate.successor].frame));
    }));
  }
});

test('renaming/reordering/color permutation retains evidence distributions and exact duplicate detection', () => {
  const puzzle = UNLOCK_TRIAL[1].puzzle, order = [5,2,4,0,3,1];
  const renamed = { ...puzzle, id: 'renamed', colors: puzzle.colors.map(c => 'x'+c).reverse(), units: puzzle.units.map(u => ({ id: 'z'+u.id,color: 'x'+u.color })).reverse(),
    containers: order.map(i => ({ ...puzzle.containers[i],id: 'z'+puzzle.containers[i].id,units: puzzle.containers[i].units.map(u => 'z'+u) })),
    goal: { type: 'sort' as const, containers: order.map(i => 'z'+puzzle.containers[i].id) }, hidden: puzzle.hidden.map(u => 'z'+u), locked: puzzle.locked.map(c => 'z'+c),
    triggers: puzzle.triggers.map(t => ({ ...t,id:'z'+t.id, when: t.when.type === 'empty' ? { type: 'empty' as const,container:'z'+t.when.container } : { ...t.when,color:'x'+t.when.color },unlock:t.unlock.map(c=>'z'+c) })) };
  const entries = [{ puzzle, design }, { puzzle: renamed, design }], set = ratingComparisonSet(entries);
  const a = complete(extractUnlockRating(entries[0],set)), b = complete(extractUnlockRating(entries[1],set));
  assert.equal(a.structureSha256,b.structureSha256);
  for (const field of ['equivalentChoices','consequenceClasses','emptyReceivers','compatibleSlots','preparationToNextEvent','rhythm'] as const) {
    assert.deepEqual(a.evidence.shortest[field],b.evidence.shortest[field]);
    assert.deepEqual(a.evidence.plusTwo[field],b.evidence.plusTwo[field]);
  }
  assert.equal(a.evidence.novelty.nearest[0].exactDuplicate,true);
  assert.equal(scoreUnlockRating(puzzle.id,a).metrics.Q5.grade,null);
  assert.deepEqual(extractUnlockRating(entries[0],set),a);
});

test('space excludes locks, incompatible colors and source; public deductions never read hidden truth', () => {
  const puzzle = UNLOCK_TRIAL[1].puzzle, runtime = compileSortingPuzzle(puzzle), frame = initialEngineState(runtime);
  const space = ratingSpace(runtime,frame);
  assert.equal(space.openCapacity,12); assert.equal(space.freeSlots,6); assert.equal(space.emptyReceivers,1);
  assert.ok(space.compatible.every(c=>c.slots === 4));
  const hidden = engineFixture('public-truth-invariance', [['coral','jade','coral','jade'],['jade','coral','jade','coral'],[],[]], { hidden:[[0,0],[0,1],[1,0],[1,1]] });
  const originalRuntime = compileSortingPuzzle(hidden), original = initialEngineState(originalRuntime);
  const unknown = hidden.units.filter(u => !original.known.includes(u.id));
  const swapped = { ...hidden, units: hidden.units.map(u => { const i = unknown.findIndex(v=>v.id===u.id); return i<0 ? u : { ...u,color:unknown[(i+1)%unknown.length].color }; }) };
  const other = compileSortingPuzzle(swapped);
  assert.deepEqual(publicRatingFacts(originalRuntime,original),publicRatingFacts(other,original));
  assert.deepEqual(listEngineActions(originalRuntime,original.state,original.known),listEngineActions(other,original.state,original.known));
  assert.equal(publicRatingFacts(runtime,frame).visible.find(c=>c.id==='b3')!.count,null);
  const concealedPalette = { ...puzzle, colors: puzzle.colors.map(c=>c==='amber' ? 'azure' : c),
    units: puzzle.units.map(u=>({ ...u,color:u.color==='amber' ? 'azure' : u.color })) };
  assert.deepEqual(publicRatingFacts(runtime,frame),publicRatingFacts(compileSortingPuzzle(concealedPalette),frame));
  assert.equal(publicRatingFacts(runtime,frame).forcedColor,null);
});

test('same-base comparisons preserve D6 and do not grant automatic hidden-information quality/difficulty', () => {
  const entries = [0,7,1,10].map(i=>({ puzzle:UNLOCK_TRIAL[i].puzzle,design })), set = ratingComparisonSet(entries);
  const reports = entries.map(e=>complete(extractUnlockRating(e,set)));
  assert.equal(reports[0].evidence.graph.shortestMoves,10); assert.equal(reports[1].evidence.graph.shortestMoves,10);
  assert.equal(reports[2].evidence.graph.shortestMoves,9); assert.equal(reports[3].evidence.graph.shortestMoves,9);
  for (const [i,r] of reports.entries()) {
    const scores = scoreUnlockRating(entries[i].puzzle.id,r);
    assert.equal(scores.metrics.D6.grade,1); assert.equal(scores.metrics.D5.grade,null); assert.equal(scores.metrics.Q5.grade,null);
    assert.ok(r.evidence.novelty.nearest.some(n=>n.sameBase));
  }
});

test('unchanged ablation move counts do not erase both first-color opening orders', () => {
  const entry = { puzzle:UNLOCK_TRIAL[5].puzzle,design }, set = ratingComparisonSet([entry]);
  const r = complete(extractUnlockRating(entry,set));
  assert.equal(r.evidence.graph.shortestMoves,13); assert.equal(r.evidence.ablations.allOpen.status,'complete');
  if (r.evidence.ablations.allOpen.status === 'complete') assert.equal(r.evidence.ablations.allOpen.shortestMoves,13);
  assert.ok(r.evidence.mechanisms.firedSets.includes('cover-a')); assert.ok(r.evidence.mechanisms.firedSets.includes('cover-b'));
  assert.equal(r.evidence.mechanisms.verifiedPrecedence.length,0);
  assert.equal(scoreUnlockRating(entry.puzzle.id,r).metrics.Q2.grade,null);
});


test('mechanical detours change exact route intervals without manufacturing thinking grades', () => {
  const puzzle = engineFixture('mechanical-detour', [['coral','coral'],['coral','coral'],[],[]]);
  const entry = { puzzle, design }, set = ratingComparisonSet([entry]), r = complete(extractUnlockRating(entry,set));
  assert.equal(r.evidence.graph.shortestMoves,1);
  assert.equal(r.evidence.shortest.rhythm!.longestPreparation.min,0);
  assert.equal(r.evidence.shortest.rhythm!.longestPreparation.max,0);
  assert.equal(r.evidence.plusTwo.rhythm!.longestPreparation.min,0);
  assert.equal(r.evidence.plusTwo.rhythm!.longestPreparation.max,2);
  assert.equal(r.evidence.plusTwo.rhythm!.tailAfterLastChoice.max,0);
  const scores = scoreUnlockRating(puzzle.id,r);
  assert.equal(scores.metrics.D6.grade,0);
  for (const metric of ['Q1','Q2','Q4','D1','D2','D5'] as const) assert.equal(scores.metrics[metric].grade,null);
  const review = reviewTemplate(puzzle.id,r);
  for (const [key,item] of Object.entries(review.metrics)) {
    if (!key.startsWith('Q')) continue;
    item!.grade = 4; item!.reviewer = 'synthetic'; item!.reason = 'Aggregation-only fixture';
    item!.checklist = item!.checklist.map(()=>true); item!.externalEvidence = ['test-only'];
  }
  const partial = scoreUnlockRating(puzzle.id,r,review);
  assert.equal(partial.Q.score,80); assert.equal(partial.D.score,null);
});
