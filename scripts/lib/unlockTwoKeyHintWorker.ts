import { parentPort } from 'node:worker_threads';
import { completeTwoKeyHints } from './unlockTwoKeyCompleteHints.ts';
parentPort!.on('message', ({ record, output }) => {
 try { parentPort!.postMessage({ result: completeTwoKeyHints(record, output) }); }
 catch (e) { parentPort!.postMessage({ error: e instanceof Error ? e.stack : String(e) }); }
});
