import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineBenchmarkDiagnostics, readHermesCounters } from '../src/game/engineBenchmarkDiagnostics.ts';

test('optional runtime statistics stay unknown when absent, invalid or unsupported', () => {
  for (const runtime of [undefined, {}, { getInstrumentedStats: () => { throw new Error('not supported'); } },
    { getInstrumentedStats: () => ({ js_numGCs: Infinity, js_gcTime: -1, js_heapSize: 'unknown' }) }]) {
    const sample = readHermesCounters(runtime);
    assert.equal(sample.collections, null); assert.equal(sample.gcWallMilliseconds, null); assert.equal(sample.heapBytes, null);
  }
});
test('diagnostics preserve long pauses without GC and distinguish overlapping GC counters', () => {
  let collections = 2, seconds = .1;
  const probe = createEngineBenchmarkDiagnostics({ getInstrumentedStats: () => ({ js_numGCs: collections, js_gcTime: seconds, js_gcCPUTime: seconds / 2 }) });
  probe.observer.beforeSlice(); probe.observer.afterSlice('no-gc', 10, 40);
  probe.observer.beforeSlice(); collections++; seconds = .12; probe.observer.afterSlice('with-gc', 50, 75);
  const report = probe.report();
  assert.equal(report.events[0].durationMilliseconds, 30); assert.equal(report.events[0].collections, 0);
  assert.equal(report.events[1].collections, 1); assert.ok(Math.abs(report.events[1].gcWallMilliseconds! - 20) < .0001);
  assert.equal(report.inspectedSlices, 2);
});
