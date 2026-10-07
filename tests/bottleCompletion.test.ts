import assert from 'node:assert/strict';
import test from 'node:test';
import { completionPose, completionVisible, isBottleComplete, shouldCelebrateCompletion, type CompletionFrame } from '../src/art/bottleCompletion.ts';
import { FLOW_START, FLOW_END, transferredFraction } from '../src/art/pourGeometry.ts';

test('completed bottles keep their effect throughout an unrelated pour', () => {
  const completed = isBottleComplete(['jade', 'jade', 'jade', 'jade']);
  for (let frame = 0; frame <= 100; frame++) assert.equal(completionVisible(completed, 4), true);
  assert.equal(isBottleComplete([]), false);
  assert.equal(isBottleComplete(['jade', 'jade']), false);
  assert.equal(isBottleComplete(['jade', 'jade', 'coral', 'jade']), false);
});

test('completion celebrates once per transition and never replays for an unrelated pour or restored scene', () => {
  const complete: CompletionFrame = { complete: true, scene: 'level-7:0', effect: 'cork', replay: 0, enabled: true };
  assert.equal(shouldCelebrateCompletion(complete, null), false);
  assert.equal(shouldCelebrateCompletion(complete, { ...complete, complete: false }), true);
  assert.equal(shouldCelebrateCompletion(complete, complete), false);
  assert.equal(shouldCelebrateCompletion(complete, { ...complete, scene: 'level-6:0', complete: false }), false);
  assert.equal(shouldCelebrateCompletion({ ...complete, scene: 'level-7:1' }, complete), false);
  assert.equal(shouldCelebrateCompletion({ ...complete, complete: false }, complete), false);
  assert.equal(shouldCelebrateCompletion({ ...complete, enabled: false }, { ...complete, complete: false }), false);
  assert.equal(shouldCelebrateCompletion(complete, { ...complete, enabled: false }), false);
  assert.equal(shouldCelebrateCompletion({ ...complete, replay: 1 }, complete), true);
  assert.equal(shouldCelebrateCompletion({ ...complete, effect: 'halo' }, complete), true);
});

test('completion first radiates light, then inserts and settles its cork', () => {
  assert.equal(completionPose(0).glow, 0);
  assert.equal(completionPose(0).corkOpacity, 0);
  assert.ok(completionPose(0.2).glow > 0.7);
  assert.equal(completionPose(0.2).corkY, -30);
  assert.ok(completionPose(0.5).corkY > -30);
  assert.ok(completionPose(0.72).corkY > 0);
  assert.ok(completionPose(0.86).corkY < 0);
  assert.equal(completionPose(1).glow, 0);
  assert.equal(completionPose(1).corkOpacity, 1);
  assert.ok(Math.abs(completionPose(1).corkY) < 0.000001);
  for (let frame = 0; frame <= 100; frame++) {
    const pose = completionPose(frame / 100);
    assert.ok(pose.glow >= 0 && pose.glow <= 1);
    assert.ok(pose.corkOpacity >= 0 && pose.corkOpacity <= 1);
    assert.ok(pose.corkY >= -30 && pose.corkY <= 3.000001);
  }
  for (const boundary of [0.2, 0.28, 0.32, 0.72, 0.78, 0.86]) {
    const before = completionPose(boundary - 0.000001), after = completionPose(boundary + 0.000001);
    assert.ok(Math.abs(before.corkY - after.corkY) < 0.001);
    assert.ok(Math.abs(before.corkOpacity - after.corkOpacity) < 0.001);
    assert.ok(Math.abs(before.glow - after.glow) < 0.001);
  }
});

test('a recipient gains its completion effect only when liquid actually fills it', () => {
  const completed = isBottleComplete(['jade', 'jade', 'jade', 'jade']);
  for (const progress of [0, FLOW_START, (FLOW_START + FLOW_END) / 2, FLOW_END - 0.001]) {
    assert.equal(completionVisible(completed, 2 + transferredFraction(progress) * 2), false);
  }
  for (const progress of [FLOW_END, 0.9, 1]) assert.equal(completionVisible(completed, 2 + transferredFraction(progress) * 2), true);
});

test('pouring from a completed source removes its effect only after transfer starts', () => {
  assert.equal(completionVisible(true, 4 - transferredFraction(FLOW_START) * 4), true);
  assert.equal(completionVisible(true, 4 - transferredFraction(FLOW_START + 0.001) * 4), false);
  assert.equal(completionVisible(true, 0), false);
});
