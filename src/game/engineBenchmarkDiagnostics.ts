import type { EngineBenchmarkObserver } from './engineBenchmark.ts';

type Counters = { collections: number | null; gcWallMilliseconds: number | null; gcCpuMilliseconds: number | null;
  allocatedBytes: number | null; heapBytes: number | null; readMilliseconds: number };
/** Optional, read-only Hermes 0.17 counters; never required by gameplay or normal measurement. */
export function readHermesCounters(runtime: unknown): Counters {
  const begin = performance.now();
  let values: Record<string, unknown> = {};
  try {
    const candidate = runtime as { getInstrumentedStats?: () => unknown } | null;
    const raw = typeof candidate?.getInstrumentedStats === 'function' ? candidate.getInstrumentedStats() : null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) values = raw as Record<string, unknown>;
  } catch { /* Unsupported statistics remain unknown. */ }
  const number = (key: string) => typeof values[key] === 'number' && Number.isFinite(values[key]) && (values[key] as number) >= 0 ? values[key] as number : null;
  const secondsToMilliseconds = (key: string) => {
    const seconds = number(key), milliseconds = seconds === null ? null : seconds * 1000;
    return milliseconds !== null && Number.isFinite(milliseconds) ? milliseconds : null;
  };
  return { collections: number('js_numGCs'), gcWallMilliseconds: secondsToMilliseconds('js_gcTime'),
    gcCpuMilliseconds: secondsToMilliseconds('js_gcCPUTime'), allocatedBytes: number('js_allocatedBytes'),
    heapBytes: number('js_heapSize'), readMilliseconds: performance.now() - begin };
}
const delta = (before: number | null, after: number | null) => before === null || after === null || after < before ? null : after - before;

export function createEngineBenchmarkDiagnostics(runtime: unknown) {
  const initial = readHermesCounters(runtime);
  let before = initial, inspected = 0, omitted = 0, observerMilliseconds = initial.readMilliseconds, maximumReadMilliseconds = initial.readMilliseconds;
  const events: { label: string; startMilliseconds: number; endMilliseconds: number; durationMilliseconds: number;
    collections: number | null; gcWallMilliseconds: number | null; gcCpuMilliseconds: number | null;
    before: Counters; after: Counters }[] = [];
  function read() {
    const sample = readHermesCounters(runtime);
    observerMilliseconds += sample.readMilliseconds;
    maximumReadMilliseconds = Math.max(maximumReadMilliseconds, sample.readMilliseconds);
    return sample;
  }
  const observer: EngineBenchmarkObserver = {
    beforeSlice() { before = read(); },
    afterSlice(label, startMilliseconds, endMilliseconds) {
      const after = read(), collections = delta(before.collections, after.collections), durationMilliseconds = endMilliseconds - startMilliseconds;
      inspected++;
      if (durationMilliseconds <= 8 && !(collections !== null && collections > 0)) return;
      if (events.length >= 256) { omitted++; return; }
      events.push({ label, startMilliseconds, endMilliseconds, durationMilliseconds, collections,
        gcWallMilliseconds: delta(before.gcWallMilliseconds, after.gcWallMilliseconds),
        gcCpuMilliseconds: delta(before.gcCpuMilliseconds, after.gcCpuMilliseconds), before, after });
    },
  };
  return { observer, report: () => ({
    note: 'Diagnostic only. Counter reads allocate and may affect GC. Durations exclude observer calls; counter deltas can include those calls. No forced collection. Missing counters are null, not zero. Not acceptance timing or proof of exclusive causation.',
    clock: { wallMilliseconds: Date.now(), monotonicMilliseconds: performance.now() }, initial, final: read(),
    inspectedSlices: inspected, observerMilliseconds, maximumReadMilliseconds, omittedEvents: omitted, events,
  }) };
}
