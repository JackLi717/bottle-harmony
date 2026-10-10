import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRenderEvent, partitionRenderFrames } from '../scripts/lib/androidRenderMarkers.ts';
const event = { runtime: 'android', runId: 'render_auto_123', label: 'pour:engine-key:classic', uptimeMilliseconds: 150.5, moves: 1, cases: 0 };
test('render events require bounded Android identity, clock, phase and workload counters', () => {
  assert.equal(parseRenderEvent(`I ReactNativeJS: ENGINE_RENDER ${JSON.stringify(event)}`)?.runId, event.runId);
  assert.equal(parseRenderEvent(`'ENGINE_RENDER', '${JSON.stringify(event)}'`)?.runId, event.runId);
  for (const patch of [{ runtime: 'ios' }, { runId: 'player' }, { moves: 361 }, { cases: -1 }, { uptimeMilliseconds: '150' }, { outcome: 'a'.repeat(513) }, { label: 'bad phase' }]) {
    assert.equal(parseRenderEvent('ENGINE_RENDER ' + JSON.stringify({ ...event, ...patch })), null);
  }
  assert.equal(parseRenderEvent('ENGINE_RENDER broken'), null);
});
test('mirroring intervals stay independent from automatic phase boundaries, with mismatched clocks rejected', () => {
  const frame = (ms: number) => ({ window: 'test', flags: 0, intendedVsync: String(BigInt(ms) * 1000000n), completed: String(BigInt(ms + 10) * 1000000n), timelineId: String(ms), milliseconds: 10 });
  const groups = partitionRenderFrames([frame(160), frame(130), frame(180)], [
    { label: 'mirror:on', uptimeMilliseconds: 100 },
    { label: event.label, uptimeMilliseconds: 120, runId: event.runId },
    { label: 'mirror:off', uptimeMilliseconds: 150 },
    { label: 'settle:render', uptimeMilliseconds: 170, runId: event.runId },
  ], 100, 200);
  assert.deepEqual(groups.map(g => [g.phase, g.mirroring, g.frames.length]), [[event.label, 'on', 1], [event.label, 'off', 1], ['settle:render', 'off', 1]]);
  assert.throws(() => partitionRenderFrames([frame(130)], [{ label: event.label, uptimeMilliseconds: 9999, runId: event.runId }], 100, 200), /clock/);
});
