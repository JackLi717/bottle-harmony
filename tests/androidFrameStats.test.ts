import assert from 'node:assert/strict';
import test from 'node:test';
import { androidFrameKey, parseAndroidFrames, presentedFrameIntervals } from '../scripts/lib/androidFrameStats.ts';

test('native frame parsing uses named columns and keeps flagged frames, window identities and incomplete observations', () => {
  const text = `Uptime: 1234 Realtime: 9999\nStats since: 1200000000ns\nWindow: main\n---PROFILEDATA---\nFrameCompleted,Flags,IntendedVsync,FrameTimelineVsyncId,\n1233000000,0,1200000000,7,\n1250000000,1,1210000000,8,\n9223372036854775807,0,1220000000,9,\n---PROFILEDATA---\nWindow: modal\n---PROFILEDATA---\nFlags,IntendedVsync,FrameCompleted,\n0,1200000000,1240000000,\n---PROFILEDATA---`;
  const parsed = parseAndroidFrames(text);
  assert.equal(parsed.uptimeMilliseconds, 1234); assert.equal(parsed.since, '1200000000'); assert.equal(parsed.invalidObservations, 1);
  assert.deepEqual(parsed.frames.map(frame => [frame.window, frame.flags, frame.milliseconds]), [['main', 0, 33], ['main', 1, 40], ['modal', 0, 40]]);
  assert.notEqual(androidFrameKey(parsed.frames[0]), androidFrameKey(parsed.frames[2]));
  assert.throws(() => parseAndroidFrames('---PROFILEDATA---\nFlags,Vsync,\n'), /Unsupported/);
});

test('presentation cadence is separate from pipeline latency, with unavailable and duplicate presents excluded', () => {
  const parsed = parseAndroidFrames(`---PROFILEDATA---\nFlags,IntendedVsync,FrameCompleted,DisplayPresentTime,\n0,1000000000,1200000000,1250000000,\n0,1030000000,1230000000,1280000000,\n0,1040000000,1240000000,1280000000,\n0,1060000000,1260000000,0,\n0,1070000000,1270000000,9223372036854775807,\n---PROFILEDATA---`);
  assert.ok(parsed.frames.every(frame => frame.milliseconds === 200));
  assert.deepEqual(presentedFrameIntervals(parsed.frames), [30]);
  assert.equal(parsed.frames[3].displayPresent, undefined);
  assert.equal(parsed.frames[4].displayPresent, undefined);
  assert.deepEqual(presentedFrameIntervals([{ ...parsed.frames[0], window: 'another' }, parsed.frames[1]]), []);
});
