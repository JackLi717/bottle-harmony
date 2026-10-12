import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAnalyticsParameters } from '../src/analytics/encoding.ts';

test('app categorical dimensions use nonnumeric strings while metric values and original facts remain intact', () => {
  const facts = { level_number: 1000, colors: 11, stage: 20, since_activation: 0,
    first_clear: 1, first_exposure: 0, unassisted: 1, new_observation: 0,
    foreground_ms: 1234.5, pours: 12, credits_awarded: 2, event_at: 1791763200000 };
  const before = { ...facts };
  assert.deepEqual(encodeAnalyticsParameters('bh_puzzle_complete', facts), {
    ...facts, level_number: 'level_1000', colors: 'colors_11', stage: 'stage_20', since_activation: 'day_0',
    first_clear: 'yes', first_exposure: 'no', unassisted: 'yes', new_observation: 'no',
  });
  assert.deepEqual(facts, before);
  assert.deepEqual(encodeAnalyticsParameters('bh_tutorial', { stage: 'tutorial-start' }), { stage: 'tutorial-start' });
  const encoded = encodeAnalyticsParameters('bh_active_day', facts);
  assert.deepEqual(encodeAnalyticsParameters('bh_active_day', encoded), encoded);
});

test('invalid category values are not silently rounded or relabelled', () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    assert.throws(() => encodeAnalyticsParameters('bh_puzzle_start', { level_number: value }));
  }
  for (const value of [-1, 2, 0.5]) assert.throws(() => encodeAnalyticsParameters('bh_puzzle_complete', { first_clear: value }));
});
