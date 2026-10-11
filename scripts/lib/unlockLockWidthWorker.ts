import { parentPort } from 'node:worker_threads';
import { evaluateLockStudyOverlay, lockStudyOverlays, type LockStudyBase } from './unlockLockWidthStudy.ts';
if (!parentPort) throw new Error('Lock-width worker requires a parent');
parentPort.on('message', (base: LockStudyBase) => {
  try {
    const overlays = lockStudyOverlays(base), results = overlays.map((overlay, i) => {
      const result = evaluateLockStudyOverlay(base, overlay);
      if ((i + 1) % 5 === 0) parentPort!.postMessage({ progress: { base: base.number, done: i + 1, total: overlays.length } });
      return result;
    });
    parentPort!.postMessage({ record: { base, results } });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
});
