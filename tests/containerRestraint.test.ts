import assert from 'node:assert/strict';
import test from 'node:test';
import { containerRestraintState } from '../src/art/containerRestraintState.ts';
import { createEngineSession, evaluateEngineGoal, moveEngineSession, undoEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { ENGINE_EXAMPLES, engineFixture } from '../src/game/engineExamples.ts';

const visible = (s: ReturnType<typeof createEngineSession>) => visibleEngineState(s.runtime, s.state, s.known, s.seen);

test('disclosure and transfer permissions choose the fixture independently of fixed position', () => {
  const c = { locked: false, count: 0, fixed: false, canSource: true, canReceive: true };
  assert.equal(containerRestraintState(c), 'none');
  assert.equal(containerRestraintState({ ...c, fixed: true }), 'fixed');
  for (const fixed of [false, true]) {
    assert.equal(containerRestraintState({ ...c, fixed, canSource: false }), 'receive-only');
    assert.equal(containerRestraintState({ ...c, fixed, canSource: false, canReceive: false }), 'sealed');
    assert.equal(containerRestraintState({ ...c, fixed, locked: true, count: null, canSource: false, canReceive: false }), 'concealed');
    assert.equal(containerRestraintState({ ...c, fixed, locked: true, count: 4, canSource: false, canReceive: false }), 'relocked');
  }
  const session = createEngineSession(engineFixture('fixed-is-not-source-disabled', [['coral'], []], { fixed: [0] }), 'fixed');
  assert.equal(containerRestraintState(visible(session)[0]), 'fixed');
  assert.ok(moveEngineSession(session, { type: 'transfer', source: 'b0', target: 'b1' }));
});

test('collecting target stays receive-only while accepting all twelve portions and through undo', () => {
  let session = createEngineSession(ENGINE_EXAMPLES[3], 'fixture-collect');
  for (let source = 0; source < 3; source++) {
    assert.equal(containerRestraintState(visible(session)[3]), 'receive-only');
    session = moveEngineSession(session, { type: 'transfer', source: `b${source}`, target: 'b3' })!.session;
    assert.equal(moveEngineSession(session, { type: 'transfer', source: 'b3', target: 'b6' }), null);
  }
  assert.equal(evaluateEngineGoal(session.runtime, session.state), true);
  session = undoEngineSession(session);
  assert.equal(visible(session)[3].count, 8);
  assert.equal(containerRestraintState(visible(session)[3]), 'receive-only');
});

test('rainbow target keeps an open inlet and a source restraint for the entire ordered route', () => {
  let session = createEngineSession(ENGINE_EXAMPLES[4], 'fixture-rainbow');
  for (const source of [0, 1, 2, 0, 1, 2]) {
    session = moveEngineSession(session, { type: 'transfer', source: `b${source}`, target: 'b3' })!.session;
    assert.equal(containerRestraintState(visible(session)[3]), 'receive-only');
    assert.equal(moveEngineSession(session, { type: 'transfer', source: 'b3', target: 'b0' }), null);
  }
  assert.equal(evaluateEngineGoal(session.runtime, session.state), true);
  assert.equal(containerRestraintState(visible(undoEngineSession(session))[3]), 'receive-only');
});
