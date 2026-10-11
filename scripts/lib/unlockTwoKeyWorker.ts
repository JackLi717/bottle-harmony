import { parentPort } from 'node:worker_threads';
import { evaluateTwoKeyCandidate } from './unlockTwoKeyGeneration.ts';
parentPort!.on('message', ({ origin, selected }) => {
  try { parentPort!.postMessage({ record: evaluateTwoKeyCandidate(origin, selected, s => console.log(s)) }); }
  catch (e) { parentPort!.postMessage({ error: e instanceof Error ? e.stack : String(e) }); }
});
