import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compileSortingPuzzle, createEngineSession, evaluateEngineGoal, initialEngineState, listEngineActions, moveEngineSession,
  resetEngineSession, transitionEngine, undoEngineSession, type EngineFrame } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { makeCandidate, structureKey } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { replaySolution } from '../src/game/solver.ts';
import { generatedRevealTrials } from '../src/game/progressiveRevealGenerated.ts';
import { revealAddress, revealRecoverySteps, revealTableHint, parseRevealHintTable } from '../src/game/progressiveRevealHints.ts';
import { acceptProgressiveReveal, completeRevealHints, REVEAL_BUDGET, replayRevealPolicy, revealWorlds } from '../scripts/lib/progressiveRevealAcceptance.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';

const bank = JSON.parse(readFileSync(new URL('../assets/levels/progressive-reveal-four.json', import.meta.url), 'utf8'));
const records = bank.entries;
const trials = generatedRevealTrials(bank);

test('four independent full classic sources reconstruct, conserve all liquid, replay and bind the exported bank', () => {
  const { evidenceSha256, ...payload } = bank; assert.equal(sha256(payload), evidenceSha256);
  assert.equal(trials.length, 4); assert.equal(new Set(records.map((r: {classicStructureKey: string}) => r.classicStructureKey)).size, 4);
  for (const [i, r] of records.entries()) {
    const classic = makeCandidate(r.origin.seed, r.origin.candidateIndex, r.origin.config);
    assert.equal(structureKey(classic), r.classicStructureKey);
    replaySolution(initialBoard(classic), r.classicSolution, 4);
    const rt = compileSortingPuzzle(trials[i].puzzle);
    assert.deepEqual(trials[i].puzzle, engineFixture(trials[i].puzzle.id, initialBoard(classic), { hidden: r.mask }));
    assert.deepEqual(rt.puzzle.containers.map(c => c.units.map(id => rt.unitColors.get(id))), initialBoard(classic));
    assert.equal(sha256({ origin: r.origin, classic, mask: r.mask }), bank.entries[i].sourceSha256);
    assert.equal(sha256(bank.entries[i].hints), bank.entries[i].hintClosure.evidenceSha256);
  }
});

test('fresh adaptive AND/OR proof and all initial inventory-compatible worlds finish using only public observations', () => {
  for (const [i, trial] of trials.entries()) {
    const accepted = acceptProgressiveReveal(trial.puzzle); assert.equal(accepted.status, 'pass');
    if (accepted.status !== 'pass') throw Error('Expected pass');
    assert.equal(accepted.certificatesSha256, bank.entries[i].acceptance.certificatesSha256);
    const rt = compileSortingPuzzle(trial.puzzle), initial = initialEngineState(rt), worlds = revealWorlds(rt, initial, 720);
    assert.equal(worlds.length, bank.entries[i].acceptance.worlds);
    const moves = new Set(worlds.map(w => {
      const s = createEngineSession(w.puzzle, 'same-observation');
      const hint = revealTableHint(s, { ...trial.revealHints!, binding: w.binding }); assert.equal(hint.status, 'hint');
      return hint.status === 'hint' ? JSON.stringify(hint.action) : '';
    }));
    assert.equal(moves.size, 1, 'Secret true assignment must not choose the first action');
    for (const world of worlds) {
      const replay = replayRevealPolicy(world, initial, trial.revealHints!);
      assert.equal(evaluateEngineGoal(world, replay.frame.state), true);
    }
    const closure = completeRevealHints(accepted.policy); assert.equal(closure.closureStates, bank.entries[i].hintClosure.states);
    assert.equal(sha256(closure.table), bank.entries[i].hintClosure.evidenceSha256);
  }
});

test('every actual legal branch and every stronger undo knowledge set has a finite hint or explicit free recovery', () => {
  for (const trial of trials) {
    const rt = compileSortingPuzzle(trial.puzzle), table = trial.revealHints!, frames: EngineFrame[] = [], seen = new Set<string>();
    const add = (f: EngineFrame) => { const k = revealAddress(rt, f).key; if (!seen.has(k)) { seen.add(k); frames.push(f); } };
    add(initialEngineState(rt));
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const hint = revealTableHint({ ...createEngineSession(trial.puzzle, 'audit'), ...frame }, table);
      if (hint.status === 'hint') {
        const next = transitionEngine(rt, frame.state, frame.known, hint.action); assert.ok(next.accepted);
        assert.ok(evaluateEngineGoal(rt, next.state) || next.known.length > frame.known.length
          || table.states[revealAddress(rt, next).key].distance < table.states[revealAddress(rt, frame).key].distance);
        assert.ok(replayRevealPolicy(rt, frame, table).route.length > 0);
      } else assert.ok(['complete', 'unsolvable', 'recover'].includes(hint.status));
      if (!evaluateEngineGoal(rt, frame.state)) for (const action of listEngineActions(rt, frame.state, frame.known)) {
        const next = transitionEngine(rt, frame.state, frame.known, action); assert.ok(next.accepted); add(next);
      }
      for (const id of trial.puzzle.hidden) if (!frame.known.includes(id)) add({ state: frame.state,
        known: trial.puzzle.units.filter(u => frame.known.includes(u.id) || u.id === id).map(u => u.id) });
    }
  }
});

test('reveals stop at original hidden boundaries, undo retains knowledge and reset restores masks', () => {
  for (const trial of trials) {
    let session = createEngineSession(trial.puzzle, 'knowledge');
    const start = session;
    for (let n = 0; n < 100 && session.known.length === start.known.length; n++) {
      const hint = revealTableHint(session, trial.revealHints!); assert.equal(hint.status, 'hint');
      if (hint.status !== 'hint') break;
      const next = moveEngineSession(session, hint.action); assert.ok(next); session = next.session;
    }
    assert.ok(session.known.length > start.known.length);
    const undone = undoEngineSession(session); assert.ok(undone); assert.deepEqual(undone.known, session.known);
    assert.notEqual(revealTableHint(undone, trial.revealHints!).status, 'complete');
    assert.notEqual(revealRecoverySteps(undone, trial.revealHints!), undefined);
    assert.deepEqual(resetEngineSession(undone).known, start.known);
  }
  const p = engineFixture('same-hidden-boundary', [['jade','jade','coral','coral'], ['jade','jade','coral','coral'], [], []], { hidden: [[0,2]] });
  const s = createEngineSession(p, 'boundary'), moved = moveEngineSession(s, { type:'transfer', source:'b0', target:'b2' });
  assert.ok(moved); assert.equal(moved.session.state.contents[2].length, 1); assert.ok(moved.session.known.includes('u0_2'));
});

test('bounded searches remain unknown, exhausted impossible boards fail and invalid internal projections are rejected', () => {
  const p = trials[0].puzzle;
  assert.equal(acceptProgressiveReveal(p, { ...REVEAL_BUDGET, maxWorlds: 1 }).status, 'unknown');
  assert.equal(acceptProgressiveReveal(p, { ...REVEAL_BUDGET, maxTotalStates: 1 }).status, 'unknown');
  assert.equal(acceptProgressiveReveal(p, { ...REVEAL_BUDGET, maxEdges: 1 }).status, 'unknown');
  assert.equal(acceptProgressiveReveal(p, { ...REVEAL_BUDGET, maxMilliseconds: .000001 }).status, 'unknown');
  const dead = engineFixture('full-no-move', [['jade','coral','amber','jade'], ['coral','amber','jade','coral'], ['amber','jade','coral','amber']], { hidden:[[0,0]] });
  assert.equal(acceptProgressiveReveal(dead).status, 'fail');
  assert.throws(() => parseRevealHintTable({ ...trials[0].revealHints, binding:'wrong' }, compileSortingPuzzle(p)));
  const bad = structuredClone(bank); bad.entries[0].puzzle.locked = ['b0']; assert.throws(() => generatedRevealTrials(bad));
  const unsafe = structuredClone(bank); unsafe.entries[0].acceptance.status = 'unknown'; assert.throws(() => generatedRevealTrials(unsafe));
  const top = structuredClone(bank); top.entries[0].puzzle.hidden.push('u0_3'); assert.throws(() => generatedRevealTrials(top));
});
