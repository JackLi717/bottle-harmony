import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { transitionEngine } from '../src/game/engine.ts';
import { buildRatingGraph, colorRuns, completeColors } from '../scripts/lib/unlockRatingGraph.ts';
import { ratingSpace } from '../scripts/lib/unlockRatingFacts.ts';
import { analyzeRatingDecisions, compareRatingDecisions } from '../scripts/lib/unlockDecisionAnalysis.ts';
import { extractUnlockRating, pairedRatingComparisons, ratingComparisonSet, type RatingInput } from '../scripts/lib/unlockRatingEvidence.ts';

const tinyKey = engineFixture('tiny-key', [['coral','coral'],['coral','coral'],[]], {
  locked: [1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
});
function measured(puzzle = tinyKey) {
  const graph = buildRatingGraph(puzzle);
  if (graph.status !== 'complete') throw new Error('Expected complete graph');
  const analysis = analyzeRatingDecisions(graph);
  if (analysis.status !== 'complete') throw new Error('Expected solvable graph');
  return { graph, analysis };
}

test('milestone phases, all bounded route extrema and elapsed curves agree with exhaustive walks', () => {
  const { graph, analysis } = measured();
  assert.equal(graph.shortestMoves, 2);
  for (const corridor of [analysis.shortest, analysis.plusTwo]) {
    const m = corridor.milestones[0];
    assert.equal(m.mandatory, true); assert.equal(m.minimumSuccessfulPreparation, 1);
    assert.deepEqual(m.before.route.pours, { min: 1, max: 1 });
    const consequential = new Set(corridor.examples.map(e => e.state));
    assert.equal(consequential.size, corridor.summary.consequentialStates); // This small fixture has no truncated examples.
    const walks: { states: number[]; targets: number[] }[] = [];
    function visit(i: number, states: number[], targets: number[]) {
      if (graph.nodes[i].solved) { walks.push({ states, targets }); return; }
      if (states.length === graph.shortestMoves! + corridor.extraPours) return;
      for (const to of new Set(graph.nodes[i].edges.map(e => e.to))) visit(to, [...states, i], [...targets, to]);
    }
    visit(0, [], []);
    const extrema = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
    const choiceBits = walks.map(w => w.states.map((i, step) => consequential.has(i) && w.targets[step] !== i));
    assert.deepEqual(corridor.route.pours, extrema(walks.map(w => w.states.length)));
    assert.deepEqual(corridor.route.consequentialPours, extrema(choiceBits.map(bits => bits.filter(Boolean).length)));
    assert.deepEqual(corridor.route.consequentialShareOfWholeRoute, extrema(choiceBits.map(bits => bits.filter(Boolean).length / bits.length)));
    assert.deepEqual(corridor.route.tailAfterLastConsequentialChoice, extrema(choiceBits.map(bits => bits.length - bits.lastIndexOf(true) - 1)));
    assert.deepEqual(corridor.route.longestConsequentialRun, extrema(choiceBits.map(bits => {
      let run = 0, peak = 0; for (const b of bits) { run = b ? run + 1 : 0; peak = Math.max(peak, run); } return peak;
    })));
    assert.deepEqual(m.after.route.pours, extrema(walks.map(w => w.states.filter(i => graph.nodes[i].frame.state.fired.includes('key')).length)));
    for (const row of corridor.curve) {
      const states = new Set(walks.flatMap(w => w.states[row.elapsedPours] === undefined ? [] : [w.states[row.elapsedPours]]));
      assert.equal(row.states, states.size);
      assert.equal(row.consequentialStates, [...states].filter(i => consequential.has(i)).length);
    }
    for (const crossing of m.crossings.examples) {
      assert.equal(crossing.openReceivingCapacityGain, 4);
      assert.equal(crossing.openFreeSlotsGain, 2); // Two locked portions occupy the other two slots.
      const from = graph.nodes[crossing.state].frame;
      const next = transitionEngine(graph.runtime, from.state, from.known, crossing.action);
      assert.ok(next.accepted);
      assert.ok(!from.state.fired.includes('key')); assert.ok(next.state.fired.includes('key'));
      assert.equal(graph.key(next), graph.key(graph.nodes[crossing.successor].frame));
    }
  }
});

test('cost witnesses replay and one-step public progress is distinct from equal-cost planning', () => {
  const { graph, analysis } = measured();
  assert.equal(analysis.shortest.summary.optimalPlanningStates, 0);
  assert.equal(analysis.shortest.summary.publicProgressHorizon.resolved.max, 1);
  assert.equal(analysis.shortest.summary.publicProgressHorizon.unavailable, 1); // Locked initial bottle.
  for (const witness of analysis.plusTwo.examples) {
    assert.equal(witness.horizon.pours, 1);
    assert.ok(witness.alternatives.some(a => a.regret === 0));
    assert.ok(witness.alternatives.some(a => a.regret! > 0));
    for (const alternative of witness.alternatives) {
      const next = transitionEngine(graph.runtime, witness.frame.state, witness.frame.known, alternative.action);
      assert.ok(next.accepted);
      assert.equal(graph.key(next), graph.key(graph.nodes[alternative.successor].frame));
      assert.equal(alternative.regret, 1 + graph.distances[alternative.successor] - graph.distances[witness.state]);
    }
  }
});

test('neutral bottle relocation adds execution length without manufacturing consequence decisions', () => {
  const { analysis } = measured(engineFixture('neutral', [['coral','coral'],['coral','coral'],[],[]]));
  assert.deepEqual(analysis.shortest.route.pours, { min: 1, max: 1 });
  assert.deepEqual(analysis.plusTwo.route.pours, { min: 1, max: 3 });
  assert.deepEqual(analysis.plusTwo.route.consequentialPours, { min: 0, max: 0 });
  assert.deepEqual(analysis.plusTwo.route.longestConsequentialRun, { min: 0, max: 0 });
  assert.deepEqual(analysis.plusTwo.route.tailAfterLastConsequentialChoice, { min: 1, max: 3 });
});

test('hidden states never acquire an oracle-derived public horizon', () => {
  const puzzle = engineFixture('hidden-policy', [['coral','jade','coral','jade'],['jade','coral','jade','coral'],[],[]], { hidden: [[0,0],[1,0]] });
  const { analysis } = measured(puzzle);
  assert.equal(analysis.shortest.curve[0].publicProgressHorizon.unavailable, 1);
  assert.equal(analysis.shortest.curve[0].publicProgressHorizon.resolved.count, 0);
  assert.ok(analysis.shortest.summary.publicProgressHorizon.unavailable > 0);
});

test('public-policy horizon requires every tied best candidate to have optimal continuation', () => {
  const { graph, analysis } = measured(engineFixture('policy-depth', [
    ['azure','coral','jade','azure'],['azure','jade','amber','jade'],
    ['amber','azure','amber','coral'],['coral','amber','jade','coral'],[],[],
  ]));
  assert.equal(analysis.shortest.summary.choiceProgressHorizon.resolved.max, 5);
  const example = analysis.shortest.examples.find(e => e.horizon.pours! > 1)!;
  assert.ok(example);
  const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  function bestPublic(i: number, remaining: number): number[] {
    const node = graph.nodes[i];
    if (!remaining || node.solved) return [completeColors(graph.runtime, node.frame).length,
      -colorRuns(graph.runtime, node.frame), ratingSpace(graph.runtime, node.frame).emptyReceivers];
    return node.edges.map(e => bestPublic(e.to, remaining - 1)).sort(compare).at(-1)!;
  }
  const candidates = example.alternatives.filter(a => !a.neutral);
  for (let h = 1; h <= example.horizon.pours!; h++) {
    const values = candidates.map(a => ({ a, score: bestPublic(a.successor, h - 1) }));
    const best = values.map(v => v.score).sort(compare).at(-1)!;
    const selected = values.filter(v => compare(v.score, best) === 0);
    assert.equal(selected.every(v => v.a.regret === 0), h === example.horizon.pours);
  }
});

test('classic comparisons use the same measurements and bind actual controls by structure', () => {
  const design: RatingInput['design'] = { role: 'challenge', family: 'same-name', purpose: { event: 'sort', description: 'Test automatic comparisons.' } };
  const classic = { ...tinyKey, id: 'classic-control', locked: [], hidden: [], triggers: [] };
  const unrelated = engineFixture('unrelated-control', [['coral','coral','coral'],['coral'],[]]);
  const inputs = [tinyKey, classic, unrelated].map(puzzle => ({ puzzle, design })), set = ratingComparisonSet(inputs);
  const reports = inputs.map(input => extractUnlockRating(input, set));
  const pairs = pairedRatingComparisons(reports);
  assert.equal(pairs.length, 1); assert.equal(pairs[0].original, tinyKey.id); assert.equal(pairs[0].reference, classic.id);
  assert.equal(pairs[0].originalEvidenceSha256, reports[0].evidenceSha256);
  assert.equal(pairs[0].referenceEvidenceSha256, reports[1].evidenceSha256);
  const original = reports[0];
  if (original.status !== 'complete' || original.evidence.decisions.status !== 'complete') throw new Error('Expected original evidence');
  const base = original.evidence.ablations.classicBase;
  if (base.status !== 'complete') throw new Error('Expected base evidence');
  const comparison = compareRatingDecisions(original.evidence.decisions, base.decisions);
  if (comparison.status !== 'complete') throw new Error('Expected comparison');
  assert.equal(comparison.shortest.publicProgressHorizonComparable, false);
  assert.equal(comparison.shortest.publicProgressHorizonMedian, null);
  assert.deepEqual(original.evidence.decisionComparisons.classicBase, { definitionSha256: base.definitionSha256, ...comparison });
  const unknown = extractUnlockRating(inputs[0], set, 1);
  assert.equal(pairedRatingComparisons([unknown, reports[1]])[0].status, 'unknown');
});

test('unsolvable graphs block measurements', () => {
  const design: RatingInput['design'] = { role: 'challenge', family: 'unknown', purpose: { event: 'sort', description: 'Test evidence limits.' } };
  const stuck = engineFixture('stuck', [['coral','jade','coral','jade'],['jade','coral','jade','coral']]);
  const graph = buildRatingGraph(stuck); if (graph.status !== 'complete') throw new Error('Expected exhaustive graph');
  assert.equal(analyzeRatingDecisions(graph).status, 'blocked');
  const input = { puzzle: tinyKey, design };
  const r = extractUnlockRating(input, ratingComparisonSet([input]));
  if (r.status !== 'complete') throw new Error('Expected complete evidence');
  assert.equal(r.evidence.decisionComparisons.classicBase.status, 'complete');
});

test('completion does not require an optional milestone and zero-move ranges are finite', () => {
  const { analysis } = measured(engineFixture('optional', [['coral','coral','coral','coral'],[],[]], {
    locked: [2], triggers: [{ id: 'unused', when: { type: 'empty', container: 'b0' }, unlock: ['b2'] }],
  }));
  assert.equal(analysis.shortest.milestones[0].mandatory, false);
  assert.equal(analysis.shortest.milestones[0].minimumSuccessfulPreparation, null);
  assert.deepEqual(analysis.shortest.route.pours, { min: 0, max: 0 });
  assert.deepEqual(analysis.shortest.route.tailAfterLastConsequentialChoice, { min: 0, max: 0 });
});
