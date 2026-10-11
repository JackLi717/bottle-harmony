import { parentPort } from 'node:worker_threads';
import { evaluateBatchCandidate, type BatchOrigin } from './unlockBatchGeneration.ts';
if (!parentPort) throw new Error('Generation worker requires a parent');
parentPort.on('message', (origin: BatchOrigin) => {
  try {
    const counts: Record<string, number> = {};
    const record = evaluateBatchCandidate(origin, (stage, status, reason) => {
      const key = `${stage}:${status}:${reason ?? 'none'}`; counts[key] = (counts[key] ?? 0) + 1;
    });
    parentPort!.postMessage({ record, counts });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
});
