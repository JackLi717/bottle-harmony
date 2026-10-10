import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleCooperativeWork, yieldToHost } from '../src/runtime/cooperativeWork.ts';

test('cooperative work yields and cancelling a queued task prevents stale work', async () => {
  const events: string[] = [];
  const cancel = scheduleCooperativeWork(() => { events.push('stale'); });
  cancel();
  scheduleCooperativeWork(() => { events.push('scheduled'); });
  events.push('synchronous');
  assert.deepEqual(events, ['synchronous']);
  assert.equal(await yieldToHost(), undefined);
  assert.deepEqual(events, ['synchronous', 'scheduled']);
});
