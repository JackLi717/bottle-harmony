import { parentPort } from 'node:worker_threads';
import { evaluatePostKeyCandidate, type PostKeyOrigin } from './unlockPostKeyGeneration.ts';
if (!parentPort) throw new Error('Post-key generation worker requires a parent');
parentPort.on('message', (origin: PostKeyOrigin) => {
  try {
    const counts: Record<string, number> = {};
    const record = evaluatePostKeyCandidate(origin, (stage, status, reason) => {
      const key = `${stage}:${status}:${reason ?? 'none'}`; counts[key] = (counts[key] ?? 0) + 1;
    });
    parentPort!.postMessage({ record, counts });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
});
