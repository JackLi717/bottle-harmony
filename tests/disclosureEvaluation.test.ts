import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compileSortingPuzzle, initialEngineState, transitionEngine, visibleEngineState, evaluateEngineGoal, type EngineFrame } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { evaluateDisclosure, disclosureClassicReferences } from '../scripts/lib/disclosureAcceptance.ts';
import { analyzeDisclosureDifficulty, disclosureProgress } from '../scripts/lib/disclosureStageDifficulty.ts';
import { proveDisclosureRoute, DISCLOSURE_PROOF_BUDGET } from '../scripts/lib/disclosurePublicProof.ts';
import { CLOTH_EVALUATION_SAMPLES, existingRevealEvaluationSamples } from '../scripts/lib/disclosureSamples.ts';
import { concealedInventoryWorlds } from '../scripts/lib/unlockPublicDisclosure.ts';
import { revealWorlds } from '../scripts/lib/progressiveRevealAcceptance.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty } from '../scripts/lib/unlockStageDifficulty.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { UNLOCK_STAGE_CALIBRATION } from '../src/game/unlockStageCalibration.ts';

const target = { min: 1, max: 7 }, reveal = existingRevealEvaluationSamples();
const controls = [...CLOTH_EVALUATION_SAMPLES.map(puzzle => ({ puzzle, kind: 'cloth' as const })), ...reveal.map(puzzle => ({ puzzle, kind: 'reveal' as const }))];
const results = controls.map(({ puzzle, kind }) => evaluateDisclosure(puzzle, kind, { target }));

test('one to four color conditions and existing four reveal definitions receive coupled ranks, no bonus or weighted score', () => {
  for (const [i, result] of results.entries()) {
    assert.equal(result.status, 'pass', JSON.stringify(result.reasons));
    const d = result.difficulty!; assert.equal(d.status, 'rated'); if (d.status !== 'rated') throw Error('Missing rating');
    assert.equal(d.rank, Math.max(...d.stageRanks)); assert.equal(d.rank, 1, 'mechanical controls stay low despite more conditions or unknowns');
    const rt = compileSortingPuzzle(controls[i].puzzle), initial = initialEngineState(rt);
    let frame = initial, startPour = 0;
    for (const s of d.witness.stages) {
      assert.equal(s.startPour, startPour); assert.ok(s.endPour > startPour);
      let boundaries = 0;
      for (const action of d.witness.route.slice(startPour, s.endPour)) {
        const n = transitionEngine(rt, frame.state, frame.known, action); assert.ok(n.accepted);
        if (n.known.length > frame.known.length || n.state.fired.length > frame.state.fired.length) boundaries++;
        frame = { state: n.state, known: n.known };
      }
      assert.deepEqual(frame, s.frame); assert.equal(boundaries, s.goal === 'sort' ? 0 : 1);
      startPour = s.endPour;
    }
    assert.equal(startPour, d.witness.route.length); assert.ok(evaluateEngineGoal(rt, frame.state));
    replayEngineRoute(rt, initial, d.witness.route);
    assert.ok(!('score' in result));
    if (controls[i].kind === 'reveal') assert.equal(result.rhythm?.status, 'not-applicable');
    else assert.equal(result.rhythm?.status, 'pass');
  }
});

test('all inventory worlds independently replay and identical public histories never choose different secret-dependent actions', () => {
  for (const [i, { puzzle, kind }] of controls.entries()) {
    const rt = compileSortingPuzzle(puzzle), initial = initialEngineState(rt);
    const worlds = kind === 'reveal' ? revealWorlds(rt, initial, 2048).map(runtime => ({ runtime, initial }))
      : [...concealedInventoryWorlds(puzzle)].map(w => {
        const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
        const f = { state: { ...initial.state, contents: initial.state.contents.map((s, j) => { const k = locked.findIndex(c => c.id === puzzle.containers[j].id); return k < 0 ? s : w.units[k]; }) }, known: initial.known };
        return { runtime: rt, initial: f };
      });
    const proof = results[i].publicInformation!; assert.equal(proof.worlds, worlds.length); assert.equal(proof.certificates.length, worlds.length);
    const actions = new Map<string, string>();
    for (const c of proof.certificates) {
      const w = worlds[c.world]; let f: EngineFrame = w.initial, history = '';
      for (const a of c.route) {
        history += JSON.stringify(visibleEngineState(w.runtime, f.state, f.known));
        const prior = actions.get(history); if (prior) assert.equal(JSON.stringify(a), prior); else actions.set(history, JSON.stringify(a));
        const n = transitionEngine(w.runtime, f.state, f.known, a); assert.ok(n.accepted); f = n;
      }
      assert.ok(evaluateEngineGoal(w.runtime, f.state)); replayEngineRoute(w.runtime, w.initial, c.route);
    }
  }
});

test('public progress ignores unseen truth; ordinary sorting uses the unchanged seven-policy kernel', () => {
  const p = reveal[3], rt = compileSortingPuzzle(p), initial = initialEngineState(rt);
  const values = revealWorlds(rt, initial, 2048).map(w => disclosureProgress(w, initial, 'reveal'));
  assert.equal(new Set(values).size, 1);
  for (const source of reveal) {
    const plain = { ...source, hidden: [] }, graph = buildRatingGraph(plain);
    const old = analyzeStageDifficulty(graph), current = analyzeDisclosureDifficulty(graph, 'reveal');
    assert.equal(current.status, old.status); assert.equal(current.rank, old.rank);
  }
  const hardGraph = buildRatingGraph(UNLOCK_STAGE_CALIBRATION[2].puzzle);
  const harder = analyzeDisclosureDifficulty(hardGraph, 'reveal');
  assert.equal(harder.status, 'rated'); assert.equal(harder.rank, 4, 'unchanged ordinary planning still distinguishes a harder existing control');
  assert.equal(harder.rank, analyzeStageDifficulty(hardGraph).rank);
  const two = CLOTH_EVALUATION_SAMPLES[1];
  const reordered = evaluateDisclosure({ ...two, triggers: [...two.triggers].reverse() }, 'cloth', { target });
  assert.equal(reordered.status, 'pass'); assert.equal(reordered.difficulty?.rank, results[1].difficulty?.rank);
});

test('graph, strategy and every public-proof limit are unknown, missing/outside targets are explicit, invalid input is rejected', () => {
  const p = reveal[0];
  for (const opts of [{ maxStates: 1 }, { maxEdges: 1 }, { maxWork: 1 }]) {
    const r = evaluateDisclosure(p, 'reveal', { target, ...opts }); assert.equal(r.status, 'unknown'); assert.equal(r.difficulty?.rank, null);
  }
  for (const limits of [{ maxWorlds: 1 }, { maxPhaseStates: 1 }, { maxTotalStates: 1 }, { maxEdges: 1 }, { maxMilliseconds: 0.000001 }]) {
    const r = evaluateDisclosure(p, 'reveal', { target, proofBudget: { ...DISCLOSURE_PROOF_BUDGET, ...limits } });
    assert.equal(r.status, 'unknown'); assert.equal(r.publicInformation?.status, 'unknown');
  }
  assert.equal(evaluateDisclosure(p, 'reveal', { target: null }).status, 'unknown');
  assert.equal(evaluateDisclosure(p, 'reveal', { target: { min: 4, max: 6 } }).status, 'fail');
  assert.throws(() => evaluateDisclosure(p, 'reveal', { target: { min: 0, max: 7 } }));
  assert.throws(() => evaluateDisclosure(p, 'reveal', { target, maxWork: 0 }));
  assert.throws(() => evaluateDisclosure({ ...p, units: [] }, 'reveal', { target }));
  const mixed = { ...p, locked: ['b0'], triggers: [{ id: 'key', when: { type: 'empty' as const, container: 'b1' }, unlock: ['b0'] }] };
  assert.equal(evaluateDisclosure(mixed, 'reveal', { target }).status, 'unknown');
});

test('proven real impossibility, optional cloth, invalid templates and public impossibility never pass', () => {
  const dead = engineFixture('full-no-move', [['jade','coral','amber','jade'], ['coral','amber','jade','coral'], ['amber','jade','coral','amber']], { hidden: [[0,0]] });
  const rejected = evaluateDisclosure(dead, 'reveal', { target: null }); assert.equal(rejected.status, 'fail'); assert.ok(rejected.reasons.some(r => r.code === 'unsolvable'));
  const optional = engineFixture('optional-cloth', [['coral','coral','coral','coral'],['jade','jade'],['jade','jade'],[],[],[],[],[]], {
    locked: [0,3,4,7], triggers: [{ id: 'cloth', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b0','b3','b4','b7'] }],
  });
  const bypass = evaluateDisclosure(optional, 'cloth', { target }); assert.equal(bypass.status, 'fail'); assert.ok(bypass.reasons.some(r => r.code === 'optional-cover'));
  assert.equal(bypass.difficulty?.status, 'rated');
  if (bypass.difficulty?.status !== 'rated') throw Error('Missing true-layout solution');
  const publicFailure = proveDisclosureRoute(optional, 'cloth', bypass.difficulty.witness.route);
  assert.equal(publicFailure.status, 'fail'); assert.equal(publicFailure.reason, 'no-public-policy-for-coupled-route');
  const p = CLOTH_EVALUATION_SAMPLES[0], shifted = { ...p, locked: ['b0','b2','b4','b7'], triggers: [{ ...p.triggers[0], unlock: ['b0','b2','b4','b7'] }] };
  const invalid = evaluateDisclosure(shifted, 'cloth', { target: null, maxStates: 1 }); assert.equal(invalid.status, 'fail'); assert.ok(invalid.reasons.some(r => r.code === 'cloth-template-fail'));
});

test('evidence binds exact definitions, targets, policies and budgets; classic originals stay separate', () => {
  for (const [i, result] of results.entries()) {
    const { method, definitionSha256, target, budgets, evidenceSha256, limits: _limits, ...evidence } = result;
    assert.equal(evidenceSha256, sha256({ binding: { method, definitionSha256, target, budgets }, evidence }));
    const refs = disclosureClassicReferences(controls[i].puzzle, result);
    assert.equal(refs.acceptanceEvidenceSha256, result.evidenceSha256); assert.ok(refs.base.human?.score !== undefined);
    for (const s of refs.stages) if (s.goal !== 'sort') assert.equal(s.reference.status, 'not-applicable');
  }
  const r = structuredClone(results[0]); r.difficulty!.rank = 7;
  assert.throws(() => disclosureClassicReferences(CLOTH_EVALUATION_SAMPLES[0], r));
});

test('CLI rates existing definitions only, rejects output outside builds and returns nonzero for unknown targets', () => {
  const cli = ['--experimental-strip-types', 'scripts/disclosure-rating.ts'];
  assert.notEqual(spawnSync(process.execPath, [...cli, '--kind', 'reveal', '--out', 'assets/levels/no-write']).status, 0);
  const run = spawnSync(process.execPath, [...cli, '--kind', 'reveal', '--min-rank', '1', '--max-rank', '7', '--max-states', '1', '--out', 'builds/disclosure-evaluation/cli-unknown']);
  assert.equal(run.status, 1, run.stderr.toString());
  const summary = JSON.parse(readFileSync('builds/disclosure-evaluation/cli-unknown/summary.json', 'utf8'));
  assert.ok(summary.rows.every((r: { status: string; rank: number | null }) => r.status === 'unknown' && r.rank === null));
  // No evaluator or CLI output touched the frozen internal bank or formal content.
  for (const p of ['assets/levels/content.sqlite', 'assets/levels/progressive-reveal-four.json', 'assets/levels/unlock-two-key-six.json']) {
    assert.ok(readFileSync(p).equals(execFileSync('git', ['show', 'HEAD:' + p], { maxBuffer: 64000000 })));
  }
});
