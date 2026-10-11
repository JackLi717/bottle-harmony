import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState, transitionEngine, visibleEngineState, evaluateEngineGoal, validateEngineState, type EngineFrame } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { evaluateDoubleKey, doubleKeyClassicReferences } from '../scripts/lib/unlockDoubleKeyAcceptance.ts';
import { proveDoubleKeyDisclosure } from '../scripts/lib/unlockDoubleKeyDisclosure.ts';
import { unlockQualityBounds } from '../scripts/lib/unlockSequentialKeys.ts';
import { DOUBLE_KEY_SAMPLES } from '../scripts/lib/unlockDoubleKeySamples.ts';
import { PUBLIC_DISCLOSURE_BUDGET } from '../scripts/lib/unlockPublicDisclosure.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';

const target = { min: 1, max: 7 }, budget = { ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: 2048 };
const results = DOUBLE_KEY_SAMPLES.map(s => evaluateDoubleKey(s.puzzle, { target, disclosureBudget: budget }));
const tiny = DOUBLE_KEY_SAMPLES[0].puzzle;

test('three fixed samples pass all necessary gates; no scores, weights or missing-target defaults', () => {
  for (const r of results) { assert.equal(r.status, 'pass'); assert.equal(r.label, '通过'); assert.ok(r.checks.every(c => c.status === 'pass')); assert.ok(!('score' in r)); }
  const missing = evaluateDoubleKey(tiny, { target: null }); assert.equal(missing.label, '未知'); assert.deepEqual(missing.reasons.map(r => r.code), ['missing-difficulty-target']);
  const below = evaluateDoubleKey(tiny, { target: { min: 4, max: 6 } }); assert.equal(below.label, '不通过'); assert.ok(below.reasons.some(r => r.code === 'difficulty-outside-target'));
  for (const target of [{ min: 0, max: 7 }, { min: 3, max: 2 }, { min: 1, max: 8 }]) assert.throws(() => evaluateDoubleKey(tiny, { target }));
});

test('all public worlds independently replay; second preparations depend only on first public observation', () => {
  for (const [j, r] of results.entries()) {
    const puzzle = DOUBLE_KEY_SAMPLES[j].puzzle, proof = r.publicInformation!;
    assert.equal(proof.status, 'pass'); assert.equal(proof.worlds.length, [30,1020,60][j]);
    assert.equal(proof.certificates.length, proof.worlds.length);
    assert.deepEqual(proof.branches.flatMap(b => b.worlds).sort((a,b) => a-b), proof.worlds.map((_,i) => i));
    assert.ok(new Set(proof.branches.map(b => JSON.stringify(b.middle))).size > 1, 'Newly visible colors allow different public preparations');
    const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
    const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
    const hiddenIds = new Set(locked.flatMap(c => c.units));
    let automaticSecond = false;
    for (const cert of proof.certificates) {
      const world = proof.worlds[cert.world], used = new Map<string, number>();
      const pools = new Map(puzzle.colors.map(color => [color, puzzle.units.filter(u => hiddenIds.has(u.id) && u.color === color).map(u => u.id).sort()]));
      const units = world.contents.map(s => s.map(color => { const i = used.get(color) ?? 0; used.set(color, i + 1); return pools.get(color)![i]; }));
      const frame: EngineFrame = { state: { ...initial.state, contents: puzzle.containers.map((c, i) => { const n = locked.findIndex(l => l.id === c.id); return n < 0 ? initial.state.contents[i] : units[n]; }) }, known: initial.known };
      validateEngineState(runtime, frame.state, frame.known); replayEngineRoute(runtime, frame, cert.route);
      let opened = frame, prefixLength = 0;
      for (const a of proof.prefix) { if (evaluateEngineGoal(runtime, opened.state)) break; const next = transitionEngine(runtime, opened.state, opened.known, a); assert.ok(next.accepted); opened = { state: next.state, known: next.known }; prefixLength++; }
      const observed = sha256({ visible: visibleEngineState(runtime, opened.state, opened.known), fired: [...opened.state.fired].sort() });
      assert.equal(observed, world.observation);
      const branch = proof.branches.find(b => b.observation === observed)!; assert.ok(branch.worlds.includes(cert.world));
      const common = [...proof.prefix.slice(0, prefixLength), ...branch.middle!];
      assert.deepEqual(cert.route.slice(0, common.length), common.slice(0, cert.route.length));
      if (opened.state.fired.includes('second')) automaticSecond = true;
    }
    assert.ok(automaticSecond, 'Do not exclude worlds with an initially empty concealed second key');
  }
});

test('cover counts use bottles and floor on odd boards; hard quality failures override unknown computation', () => {
  const eight = DOUBLE_KEY_SAMPLES[1].puzzle;
  assert.equal(unlockQualityBounds(eight).covered, 4); assert.ok(unlockQualityBounds(eight).checks.every(c => c.status === 'pass'));
  const odd = { ...eight, colors: eight.colors.filter(c => c !== 'azure'), units: eight.units.filter(u => u.color !== 'azure'),
    containers: eight.containers.filter(c => c.id !== 'b3'), goal: { type: 'sort' as const, containers: eight.containers.filter(c => c.id !== 'b3').map(c => c.id) } };
  assert.equal(unlockQualityBounds(odd).maxCovered, 3); assert.equal(unlockQualityBounds(odd).checks[0].status, 'fail');
  const rejected = evaluateDoubleKey(odd, { target: null, maxStates: 1 }); assert.equal(rejected.status, 'fail'); assert.ok(rejected.reasons.some(r => r.code === 'cover-exceeds-half'));
  const many = { ...tiny, triggers: Array.from({ length: 5 }, (_, i) => ({ id: `key-${i}`, when: { type: 'empty' as const, container: 'b1' }, unlock: ['b3','b4'] })) };
  const excessive = evaluateDoubleKey(many, { target: null, maxStates: 1 }); assert.equal(excessive.status, 'fail'); assert.ok(excessive.reasons.some(r => r.code === 'keys-exceed-four'));
});

test('unsupported order stays unknown; actual unsolvability and optional keys are proved failures', () => {
  const parallel = { ...tiny, triggers: tiny.triggers.map((t,i) => i ? { ...t, when: { type: 'empty' as const, container: 'b5' } } : t) };
  assert.equal(evaluateDoubleKey(parallel, { target }).status, 'unknown');
  const optional = engineFixture('two-key-optional', [['jade','jade'],['coral','coral'],['coral','coral'],['jade','jade'],['amber','amber','amber','amber'],[]], { locked: [3,4], triggers: tiny.triggers });
  const bypass = evaluateDoubleKey(optional, { target }); assert.equal(bypass.status, 'fail'); assert.ok(bypass.reasons.some(r => r.code === 'optional-key'));
  const stuck = engineFixture('two-key-stuck', [['coral','jade','coral','jade'],['jade','coral','jade','coral'],['azure','azure','azure','azure'],['amber','rose','amber','rose'],['rose','amber','rose','amber'],['mint','mint','mint','mint']], {
    locked: [3,4], triggers: [{ id:'first', when:{type:'empty',container:'b0'},unlock:['b3'] }, { id:'second', when:{type:'empty',container:'b3'},unlock:['b4'] }],
  });
  const blocked = evaluateDoubleKey(stuck, { target: null }); assert.equal(blocked.status, 'fail'); assert.ok(blocked.reasons.some(r => r.code === 'unsolvable'));
});

test('graph, policy and all public proof budgets remain unknown, never high difficulty or failure', () => {
  for (const opts of [{ maxStates: 1 }, { maxEdges: 1 }, { maxWork: 1 }]) {
    const r = evaluateDoubleKey(tiny, { target, ...opts }); assert.equal(r.status, 'unknown'); assert.equal(r.difficulty?.rank, null);
  }
  for (const override of [{ maxWorlds: 1 }, { maxStatesPerWorld: 1 }, { maxTotalStates: 1 }, { maxMilliseconds: 0.000001 }]) {
    const r = evaluateDoubleKey(tiny, { target, disclosureBudget: { ...budget, ...override } }); assert.equal(r.status, 'unknown'); assert.equal(r.publicInformation?.status, 'unknown');
  }
  const full = results[1], exact = proveDoubleKeyDisclosure(DOUBLE_KEY_SAMPLES[1].puzzle, full.difficulty!, { ...budget, maxWorlds: 1020 }); assert.equal(exact.status, 'pass');
  assert.equal(proveDoubleKeyDisclosure(DOUBLE_KEY_SAMPLES[1].puzzle, full.difficulty!, { ...budget, maxWorlds: 1019 }).status, 'unknown');
  const forged = structuredClone(results[0].difficulty!); assert.ok(forged.status === 'rated'); forged.witness.openedFrames.reverse();
  assert.throws(() => proveDoubleKeyDisclosure(tiny, forged, budget));
});

test('a true complete route does not prove a safe public second-key strategy', () => {
  // Known one-spare hidden-order counterexample, with one mandatory first key
  // added without adding working capacity: it swaps its full color with the spare.
  const unsafe = engineFixture('two-key-unsafe-hidden-order', [['coral','amber','rose','jade'],['amber','jade','coral','violet'],['azure','amber','rose','rose'],['azure','coral','jade','rose'],['jade','azure','violet','azure'],['coral','violet','violet','amber'],[],['mint','mint','mint','mint']], {
    locked:[0,4], triggers:[{ id:'first', when:{type:'empty',container:'b7'}, unlock:['b0'] }, { id:'second', when:{type:'empty',container:'b0'}, unlock:['b4'] }],
  });
  const r = evaluateDoubleKey(unsafe, { target, disclosureBudget: { ...budget, maxWorlds: 16384 } });
  assert.equal(r.difficulty?.status, 'rated'); assert.equal(r.status, 'fail'); assert.equal(r.publicInformation?.status, 'fail');
  assert.deepEqual(r.difficulty?.stageRanks, [1,2,4]); assert.equal(r.difficulty?.rank, 4);
  assert.ok(r.reasons.some(r => r.code === 'no-common-second-preparation' || r.code === 'paired-second-preparation-unsafe'));
});

test('evidence binds the definition, three-task certificate, target, limits and classic raw references', () => {
  const r = results[0];
  const { method, definitionSha256, target, budgets, evidenceSha256, limits: _limits, ...evidence } = r;
  assert.equal(evidenceSha256, sha256({ binding: { method, definitionSha256, target, budgets }, evidence }));
  const references = doubleKeyClassicReferences(tiny, r);
  assert.equal(references.acceptanceEvidenceSha256, r.evidenceSha256);
  assert.equal(references.stages[0].status, 'not-applicable'); assert.equal(references.stages[1].status, 'not-applicable');
  assert.ok(references.base.human?.score !== undefined); assert.ok(references.stages[2].reference?.human?.score !== undefined);
  assert.throws(() => doubleKeyClassicReferences({ ...tiny, id: 'different' }, r));
  const changed = structuredClone(r); changed.difficulty!.rank = 7;
  assert.throws(() => doubleKeyClassicReferences(tiny, changed));
  const prior = JSON.parse(readFileSync(new URL('../assets/levels/unlock-post-key-20.json', import.meta.url), 'utf8'));
  assert.equal(prior.entries.length, 20); assert.equal(prior.method, 'classic-key-postchallenge-v3');
});
