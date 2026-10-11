import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';
import { UNLOCK_STAGE_CALIBRATION } from '../src/game/unlockStageCalibration.ts';
import { extractUnlockRating, ratingComparisonSet, sha256, type RatingInput } from '../scripts/lib/unlockRatingEvidence.ts';
import { acceptSingleKey, validateDifficultyTarget } from '../scripts/lib/unlockSingleKeyAcceptance.ts';
import { proveSingleKeyDisclosure, PUBLIC_DISCLOSURE_BUDGET, validateDisclosureBudget } from '../scripts/lib/unlockPublicDisclosure.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';

const target = { min: 1, max: 7 };
const input = (puzzle: SortingPuzzle): RatingInput => ({ puzzle, design: { role: 'challenge', family: 'test', purpose: { event: 'key', description: 'Single-key acceptance regression.' } } });
function rate(puzzle: SortingPuzzle, maxStates = 250000, maxStageWork = 2000000) {
  const i = input(puzzle); return extractUnlockRating(i, ratingComparisonSet([i]), maxStates, 4000000, maxStageWork);
}
const keys = UNLOCK_STAGE_CALIBRATION.filter(e => e.variant === 'key').map(e => e.puzzle);
const reports = keys.map(p => rate(p));
const balanced = engineFixture('accept-balanced', [['coral', 'coral'], ['coral'], ['coral'], []], {
  locked: [2], triggers: [{ id: 'my-key', when: { type: 'empty', container: 'b0' }, unlock: ['b2'] }],
});
const balancedReport = rate(balanced);

function replayWorlds(puzzle: SortingPuzzle, proof: ReturnType<typeof proveSingleKeyDisclosure>) {
  const unknown = puzzle.containers.filter(c => proof.locked.includes(c.id)).flatMap(c => c.units);
  const colors = new Map(puzzle.units.map(u => [u.id, u.color]));
  const pools = new Map(puzzle.colors.map(color => [color, unknown.filter(u => colors.get(u) === color).sort()]));
  for (const world of proof.worlds) {
    assert.equal(world.status, 'pass'); assert.ok(world.continuation);
    const used = new Map<string, number>();
    const containers = puzzle.containers.map(c => {
      const i = proof.locked.indexOf(c.id); if (i < 0) return c;
      return { ...c, units: world.contents[i].map(color => { const n = used.get(color) ?? 0; used.set(color, n + 1); return pools.get(color)![n]; }) };
    });
    const runtime = compileSortingPuzzle({ ...puzzle, containers });
    replayEngineRoute(runtime, initialEngineState(runtime), [...proof.prefix, ...world.continuation]);
  }
}

test('all necessary gates pass on three paired keys without requiring every legal move to stay solvable', () => {
  assert.deepEqual(reports.map(r => r.status === 'complete' ? r.evidence.stageDifficulty.rank : null), [2, 4, 5]);
  for (const [i, puzzle] of keys.entries()) {
    const before = JSON.stringify(reports[i]), accepted = acceptSingleKey(puzzle, reports[i], { target });
    assert.equal(accepted.status, 'pass'); assert.equal(accepted.label, '通过');
    assert.equal(accepted.checks.length, 7); assert.ok(accepted.checks.every(c => c.status === 'pass'));
    assert.equal('score' in accepted, false); assert.equal(JSON.stringify(reports[i]), before);
    const r = reports[i]; assert.equal(r.status, 'complete'); if (r.status !== 'complete') throw new Error('Missing evidence');
    assert.equal(r.evidence.admission.fixedLayoutAllActionsSafe, false);
    const stage = r.evidence.stageDifficulty; assert.equal(stage.status, 'rated'); if (stage.status !== 'rated') throw new Error('Missing stage');
    assert.deepEqual(accepted.publicInformation?.prefix, stage.witness.route.slice(0, stage.witness.splitPour!));
    assert.equal(accepted.publicInformation?.worlds.length, 12);
    replayWorlds(puzzle, accepted.publicInformation!);
  }
});

test('one explicit batch target filters ranks; missing targets stay unknown and invalid intervals are rejected', () => {
  assert.deepEqual(keys.map((p, i) => acceptSingleKey(p, reports[i], { target: { min: 4, max: 6 } }).status), ['fail', 'pass', 'pass']);
  const missing = acceptSingleKey(balanced, balancedReport, { target: null });
  assert.equal(missing.status, 'unknown'); assert.equal(missing.label, '未知');
  assert.deepEqual(missing.reasons.map(r => r.code), ['missing-difficulty-target']);
  for (const t of [{ min: 0, max: 7 }, { min: 1, max: 8 }, { min: 5, max: 4 }, { min: NaN, max: 7 }, { min: 1.5, max: 7 }]) assert.throws(() => validateDifficultyTarget(t));
  assert.equal(acceptSingleKey(keys[0], reports[0], { target: { min: 4, max: 6 } }).label, '不通过');
});

test('graph, stage and public-proof limits remain unknown, never success or unsolvability', () => {
  for (const r of [rate(balanced, 1), rate(keys[0], 250000, 1)]) {
    const p = r.puzzleId === balanced.id ? balanced : keys[0];
    const result = acceptSingleKey(p, r, { target });
    assert.equal(result.status, 'unknown'); assert.ok(result.checks.some(c => c.status === 'unknown'));
  }
  for (const override of [{ maxWorlds: 1 }, { maxStatesPerWorld: 1 }, { maxTotalStates: 1 }, { maxMilliseconds: 0.000001 }]) {
    const result = acceptSingleKey(keys[0], reports[0], { target, disclosureBudget: { ...PUBLIC_DISCLOSURE_BUDGET, ...override } });
    assert.equal(result.status, 'unknown'); assert.equal(result.checks.find(c => c.check === 'public-information')?.status, 'unknown');
  }
  const r = reports[0]; assert.equal(r.status, 'complete'); if (r.status !== 'complete' || r.evidence.stageDifficulty.status !== 'rated') throw new Error('Missing stage');
  const route = r.evidence.stageDifficulty.witness.route;
  assert.equal(proveSingleKeyDisclosure(keys[0], route, { ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: 12 }).status, 'pass');
  assert.equal(proveSingleKeyDisclosure(keys[0], route, { ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: 11 }).reason, 'public-world-budget');
  for (const invalid of [0, -1, NaN, 1.5]) assert.throws(() => validateDisclosureBudget({ ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: invalid }));
});

test('proved failures override missing targets or limited computations, while unsupported scope stays unknown', () => {
  const unsolvable = engineFixture('accept-unsolvable', [['coral', 'jade', 'coral', 'jade'], ['jade', 'coral', 'jade', 'coral'], [], []], {
    locked: [2, 3], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2', 'b3'] }],
  });
  const rejected = acceptSingleKey(unsolvable, rate(unsolvable), { target: null });
  assert.equal(rejected.status, 'fail'); assert.ok(rejected.reasons.some(r => r.code === 'unsolvable'));
  const optional = engineFixture('accept-optional', [['coral', 'coral', 'coral', 'coral'], [], [], []], {
    locked: [2], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2'] }],
  });
  const bypass = acceptSingleKey(optional, rate(optional), { target });
  assert.equal(bypass.status, 'fail'); assert.ok(bypass.reasons.some(r => r.code === 'optional-key'));
  const badVisual = engineFixture('accept-cross-row', [['coral'], ['coral', 'coral', 'coral'], ['jade', 'jade'], ['jade', 'jade'], [], []], {
    locked: [2, 3], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2', 'b3'] }],
  });
  const limited = acceptSingleKey(badVisual, rate(badVisual, 1), { target: null });
  assert.equal(limited.status, 'fail'); assert.ok(limited.reasons.some(r => r.code === 'fixed-template-mismatch'));
  const back = engineFixture('accept-back-loaded', [['coral', 'coral'], ['coral', 'coral'], [], []], {
    locked: [1], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b1'] }],
  });
  assert.ok(acceptSingleKey(back, rate(back), { target }).reasons.some(r => r.code === 'rhythm-back-loaded'));
  for (const puzzle of [UNLOCK_STAGE_CALIBRATION[0].puzzle, { ...balanced, hidden: [balanced.units[0].id] }]) {
    const out = acceptSingleKey(puzzle, rate(puzzle), { target });
    assert.equal(out.status, 'unknown'); assert.equal(out.reasons[0].code, 'outside-single-key-scope');
  }
});

test('group disclosures include all concealed counts and stable IDs, with independently replayed continuations', () => {
  const group = engineFixture('accept-group', [['coral'], ['coral', 'coral', 'coral'], [], ['jade', 'jade'], ['jade', 'jade'], []], {
    locked: [3, 4], triggers: [{ id: 'other-key', when: { type: 'empty', container: 'b0' }, unlock: ['b3', 'b4'] }],
  });
  const result = acceptSingleKey(group, rate(group), { target });
  assert.equal(result.status, 'pass'); assert.equal(result.publicInformation?.worlds.length, 5);
  assert.deepEqual(result.publicInformation!.worlds.map(w => w.contents.map(c => c.length)), [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]);
  replayWorlds(group, result.publicInformation!);
  const triple = engineFixture('accept-triple', [['coral'], ['coral', 'coral', 'coral'], [], [], ['jade'], ['jade'], ['jade', 'jade'], []], {
    locked: [4, 5, 6], triggers: [{ id: 'triple-key', when: { type: 'empty', container: 'b0' }, unlock: ['b4', 'b5', 'b6'] }],
  });
  const graph = buildRatingGraph(triple); assert.equal(graph.status, 'complete'); if (graph.status !== 'complete') throw new Error('Missing graph');
  const proof = proveSingleKeyDisclosure(triple, graph.route); assert.equal(proof.status, 'pass'); assert.equal(proof.worlds.length, 15); replayWorlds(triple, proof);
  const ids = new Map(group.containers.map((c, i) => [c.id, `vessel-${i}`]));
  const renamed: SortingPuzzle = { ...group, containers: group.containers.map(c => ({ ...c, id: ids.get(c.id)! })), locked: group.locked.map(id => ids.get(id)!),
    goal: { type: 'sort', containers: group.containers.map(c => ids.get(c.id)!) },
    triggers: [{ id: 'renamed-key', when: { type: 'empty', container: ids.get('b0')! }, unlock: group.locked.map(id => ids.get(id)!) }] };
  const renamedGraph = buildRatingGraph(renamed); assert.equal(renamedGraph.status, 'complete'); if (renamedGraph.status !== 'complete') throw new Error('Missing graph');
  const renamedProof = proveSingleKeyDisclosure(renamed, renamedGraph.route); assert.equal(renamedProof.status, 'pass'); replayWorlds(renamed, renamedProof);
});

test('a full-truth solution cannot substitute for all public-information worlds', () => {
  const catalog = JSON.parse(readFileSync(new URL('../assets/levels/mainline-catalog.json', import.meta.url), 'utf8'));
  const record = catalog.records.find((r: { number: number }) => r.number === 635);
  const puzzle = engineFixture('accept-unsafe-hidden-order', record.content.level.bottles.map((b: { layers: string[] }) => b.layers), {
    locked: [4], triggers: [{ id: 'key-a', when: { type: 'empty', container: 'b0' }, unlock: ['b4'] }],
  });
  const graph = buildRatingGraph(puzzle); assert.equal(graph.status, 'complete'); if (graph.status !== 'complete') throw new Error('Missing graph');
  assert.notEqual(graph.shortestMoves, null);
  const result = proveSingleKeyDisclosure(puzzle, graph.route);
  assert.equal(result.status, 'fail'); assert.equal(result.reason, 'public-world-unsolvable');
});

test('acceptance evidence binds target, budget, definition and unchanged rating evidence; stale inputs throw', () => {
  const first = acceptSingleKey(balanced, balancedReport, { target });
  assert.deepEqual(acceptSingleKey(balanced, { ...balancedReport, classicReferences: {}, acceptance: first }, { target }), first);
  const { method, definitionSha256, ratingEvidenceSha256, target: t, disclosureBudget, evidenceSha256, limits: _limits, ...evidence } = first;
  assert.equal(evidenceSha256, sha256({ binding: { method, definitionSha256, ratingEvidenceSha256, target: t, disclosureBudget }, evidence }));
  assert.notEqual(first.evidenceSha256, acceptSingleKey(balanced, balancedReport, { target: { min: 1, max: 6 } }).evidenceSha256);
  assert.notEqual(first.evidenceSha256, acceptSingleKey(balanced, balancedReport, { target, disclosureBudget: { ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: 2 } }).evidenceSha256);
  assert.throws(() => acceptSingleKey({ ...balanced, id: 'changed' }, balancedReport, { target }), /definition differs/);
  assert.throws(() => acceptSingleKey(balanced, { ...balancedReport, evidenceSha256: 'tampered' }, { target }), /hash differs/);
});
