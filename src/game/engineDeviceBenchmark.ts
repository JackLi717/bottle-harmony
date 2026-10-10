import { AppState, Platform } from 'react-native';
import { yieldToHost } from '../runtime/cooperativeWork';
import { benchmarkClassicSolver, benchmarkEngine, benchmarkEngineHints } from './engineBenchmark';
import { benchmarkEngineStorage } from '../storage/engineStorageBenchmark';

let running = false;
/** Fixed test workload; no UI navigation, player sessions or access to the original Play app. */
export async function runDeviceEngineBenchmark(runId: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(runId)) return;
  if (running) { console.info(`ENGINE_DEVICE_ERROR ${runId} A benchmark is already running`); return; }
  running = true;
  let cancelled = false;
  const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancelled = true; });
  const yieldControl = yieldToHost;
  try {
    console.info(`ENGINE_DEVICE_START ${runId} ${AppState.currentState}`);
    const diagnostics = runId.startsWith('diagnostic_')
      ? (await import('./engineBenchmarkDiagnostics')).createEngineBenchmarkDiagnostics((globalThis as { HermesInternal?: unknown }).HermesInternal) : null;
    const engine = await benchmarkEngine(yieldControl, () => cancelled, diagnostics?.observer);
    const hints = await benchmarkEngineHints(yieldControl, () => cancelled);
    const classic = await benchmarkClassicSolver(yieldControl, () => cancelled);
    const storage = await benchmarkEngineStorage(() => cancelled);
    if (cancelled) throw new Error('App left foreground during measurement');
    const encoded = JSON.stringify({ date: new Date().toISOString(), runtime: Platform.OS,
      hermes: !!(globalThis as { HermesInternal?: unknown }).HermesInternal, appState: AppState.currentState, ...engine, hints, classic, storage,
      diagnostics: diagnostics?.report() ?? null });
    // Android log entries have a small byte ceiling. All report fields are ASCII.
    const count = Math.ceil(encoded.length / 2800);
    for (let i = 0; i < count; i++) console.info(`ENGINE_DEVICE_CHUNK ${runId} ${i}/${count} ${encoded.slice(i * 2800, (i + 1) * 2800)}`);
    console.info(`ENGINE_DEVICE_DONE ${runId}`);
  } catch (error) { console.info(`ENGINE_DEVICE_ERROR ${runId} ${String(error)}`); }
  finally { listener.remove(); running = false; }
}
