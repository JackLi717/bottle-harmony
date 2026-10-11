import assert from 'node:assert/strict';
import { parentPort } from 'node:worker_threads';
import { evaluatePostKeyCandidate, type PostKeyOrigin, type PostKeyRecord } from './unlockPostKeyGeneration.ts';
if (!parentPort) throw new Error('Post-key generation worker requires a parent');
parentPort.on('message', (message: PostKeyOrigin | { verify: PostKeyRecord }) => {
  try {
    if ('verify' in message) {
      const record = message.verify; let recomputed = null;
      for (let retry = 0; retry < 3 && !recomputed; retry++) {
        let timedOut = false;
        recomputed = evaluatePostKeyCandidate(record.source.origin, (stage, status, reason) => {
          if (stage === 'acceptance' && status === 'unknown' && reason === 'public-time-budget') timedOut = true;
        }, record.source.overlay);
        if (!recomputed && !timedOut) break;
      }
      assert.ok(recomputed, `Independent verification failed: ${record.puzzle.id}`);
      assert.deepEqual(recomputed, record, 'Independently regenerated evidence differs');
      parentPort!.postMessage({ verified: { puzzle: record.puzzle.id, status: 'pass', sourceSha256: record.sourceSha256, acceptanceSha256: record.acceptance.evidenceSha256 } }); return;
    }
    const origin = message;
    const counts: Record<string, number> = {};
    const record = evaluatePostKeyCandidate(origin, (stage, status, reason) => {
      if (stage === 'public-proof' || stage === 'acceptance') console.log(`${origin.seed}: ${stage} ${status} ${reason ?? ''}`);
      const key = `${stage}:${status}:${reason ?? 'none'}`; counts[key] = (counts[key] ?? 0) + 1;
    });
    parentPort!.postMessage({ record, counts });
  } catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
});
