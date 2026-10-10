import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRenderEvent, partitionRenderFrames, renderPresentationSegments } from '../scripts/lib/androidRenderMarkers.ts';
const event = { runtime: 'android', runId: 'render_auto_123', label: 'pour:engine-key:classic', uptimeMilliseconds: 150.5, moves: 1, cases: 0 };
test('render events require bounded Android identity, clock, phase and workload counters', () => {
  assert.equal(parseRenderEvent(`I ReactNativeJS: ENGINE_RENDER ${JSON.stringify(event)}`)?.runId, event.runId);
  assert.equal(parseRenderEvent(`'ENGINE_RENDER', '${JSON.stringify(event)}'`)?.runId, event.runId);
  for (const patch of [{ runtime: 'ios' }, { runId: 'player' }, { moves: 361 }, { cases: -1 }, { uptimeMilliseconds: '150' }, { outcome: 'a'.repeat(513) }, { label: 'bad phase' }]) {
    assert.equal(parseRenderEvent('ENGINE_RENDER ' + JSON.stringify({ ...event, ...patch })), null);
  }
  assert.equal(parseRenderEvent('ENGINE_RENDER broken'), null);
});

test('actual presentation never joins operations, idle gaps, windows or mirror switches', () => {
  const frame = (ms: number, window = 'main', flags = 0, displayPresent = String(BigInt(ms) * 1000000n)) => ({
    window, flags, intendedVsync: String(BigInt(ms - 5) * 1000000n), completed: String(BigInt(ms + 100) * 1000000n),
    timelineId: String(ms), milliseconds: 105, displayPresent: displayPresent || undefined,
  });
  const frames = [frame(110), frame(130), frame(160), frame(180), frame(180), frame(175, 'other'),
    frame(190, 'main', 1), frame(195, 'main', 0, ''), frame(320), frame(350), frame(600), frame(630)];
  const markers = [{ label: 'mirror:on', uptimeMilliseconds: 0 }, { label: 'pour:first', uptimeMilliseconds: 100 },
    { label: 'mirror:off', uptimeMilliseconds: 150 }, { label: 'settle:render', uptimeMilliseconds: 200 },
    { label: 'pour:second', uptimeMilliseconds: 300 }, { label: 'settle:render', uptimeMilliseconds: 400 },
    { label: 'pour:cancelled', uptimeMilliseconds: 500 }, { label: 'cancel:render', uptimeMilliseconds: 640 },
    { label: 'pour:wrong-run', uptimeMilliseconds: 650, runId: 'a' }, { label: 'settle:render', uptimeMilliseconds: 700, runId: 'b' },
    { label: 'pour:clipped', uptimeMilliseconds: 800 }, { label: 'settle:render', uptimeMilliseconds: 1000 }];
  const result = renderPresentationSegments(frames, markers, 0, 900);
  assert.deepEqual(result.segments.map(s => [s.phase, s.mirroring, s.intervals]), [
    ['pour:first', 'on', [20]], ['pour:first', 'off', [20]], ['pour:second', 'off', [30]],
  ]);
  assert.equal(result.segments[1].presentedFrames, 3); // two main, one other; duplicate present excluded
  assert.equal(result.segments[1].flaggedFrames, 1);
  assert.equal(result.segments[1].missingPresent, 1);
  assert.equal(result.excluded.length, 3);
  assert.equal(renderPresentationSegments([frame(110, 'main', 0, '')], markers.slice(0, 4), 0, 200).segments[0].intervals.length, 0);
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
