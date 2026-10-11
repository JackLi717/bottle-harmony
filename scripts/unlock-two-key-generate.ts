import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import { TWO_KEY_RECIPE, twoKeyOrigin, twoKeyDiversity, projectTwoKeyBank, type TwoKeyRecord } from './lib/unlockTwoKeyGeneration.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';
const args = process.argv.slice(2), command = args.shift() ?? 'generate';
assert.ok(['generate', 'verify'].includes(command));
for (let i = 0; i < args.length; i += 2) assert.ok(['--out', '--limit'].includes(args[i]) && args[i + 1]);
const option = (key: string, fallback: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const output = resolve(option('--out', 'builds/unlock-two-key-six')), root = resolve('builds');
assert.ok(relative(root, output) && !relative(root, output).startsWith(`..${sep}`) && relative(root, output) !== '..');
const limit = Number(option('--limit', String(TWO_KEY_RECIPE.maxCandidates))); assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= TWO_KEY_RECIPE.maxCandidates);
mkdirSync(output, { recursive: true }); const lock = `${output}/run.lock`, fd = openSync(lock, 'wx');
const workers = Array.from({ length: 3 }, () => new Worker(new URL('./lib/unlockTwoKeyWorker.ts', import.meta.url)));
const evaluate = (worker: Worker, origin: ReturnType<typeof twoKeyOrigin>, selected?: TwoKeyRecord['source']['overlay']) => new Promise<TwoKeyRecord | null>((done, reject) => {
  const cleanup = () => { worker.off('message', received); worker.off('error', failed); worker.off('exit', exited); };
  const failed = (error: Error) => { cleanup(); reject(error); }, exited = (code: number) => failed(Error(`Generation worker exited ${code}`));
  const received = (row: { record?: TwoKeyRecord | null; error?: string }) => { cleanup(); if (row.error) reject(Error(row.error)); else done(row.record ?? null); };
  worker.once('error', failed); worker.once('exit', exited); worker.once('message', received); worker.postMessage({ origin, selected });
});
const save = (path: string, payload: unknown) => { writeFileSync(path + '.tmp', JSON.stringify(payload) + '\n'); renameSync(path + '.tmp', path); };
try {
 const path = `${output}/checkpoint.json`, state: { recipe: typeof TWO_KEY_RECIPE; next: number; records: TwoKeyRecord[] } = existsSync(path)
  ? JSON.parse(readFileSync(path, 'utf8')) : { recipe: TWO_KEY_RECIPE, next: 0, records: [] };
 assert.deepEqual(state.recipe, TWO_KEY_RECIPE); assert.equal(twoKeyDiversity(state.records).status, 'pass');
 if (command === 'generate') {
  while (state.records.length < TWO_KEY_RECIPE.count && state.next < limit) {
   const start = state.next, results = await Promise.all(workers.slice(0, Math.min(workers.length, limit - start)).map((w, i) => evaluate(w, twoKeyOrigin(start + i))));
   for (const [i, record] of results.entries()) {
    state.next = start + i + 1;
    if (record && twoKeyDiversity([...state.records, record]).status === 'pass') { state.records.push(record); console.log(`accepted ${state.records.length}/6 source ${start + i} ranks ${record.acceptance.difficulty!.stageRanks}`); }
    save(path, state);
    if (state.records.length === TWO_KEY_RECIPE.count) break;
   }
   if (state.next % 30 < workers.length) console.log(`sources ${state.next}; accepted ${state.records.length}`);
  }
 }
 assert.equal(state.records.length, TWO_KEY_RECIPE.count, `Incomplete: ${state.records.length}/6; checkpoint retained at ${state.next}`);
 // Fresh evaluations independently reconstruct every source and rerun full acceptance, not just route replay.
 const checks = [];
 for (let i = 0; i < state.records.length; i += workers.length) {
  const chunk = state.records.slice(i, i + workers.length);
  const fresh = await Promise.all(chunk.map((r, j) => evaluate(workers[j], r.source.origin, r.source.overlay)));
  for (const [j, record] of fresh.entries()) { assert.deepEqual(record, chunk[j]); checks.push({ number: i + j + 1, status: 'pass', evidenceSha256: sha256(record) }); }
 }
 const bank = projectTwoKeyBank(state.records); save(`${output}/play.json`, bank);
 save(`${output}/verification.json`, { method: 'fresh-source-and-full-acceptance-v1', status: 'pass', bankEvidenceSha256: bank.evidenceSha256, checks });
 writeFileSync(`${output}/report.md`, `# 双钥匙内部六题\n\n从完整经典底题选择两把顺序钥匙；两组各锁一瓶，全部满瓶。正式题库不变。\n\n| 题 | 三段档位 | 整题 | 三段整理量 | 经典底题／最终局面 | 隐藏世界 |\n| --- | --- | --- | --- | --- | --- |\n` + state.records.map((r,i) => `| ${i+1} | ${r.acceptance.difficulty!.stageRanks!.join('/')} | ${r.acceptance.difficulty!.rank} | ${r.acceptance.rhythm!.stageWork!.join('/')} | ${bank.entries[i].classicScore}/${bank.entries[i].finalClassicScore} | ${r.acceptance.publicInformation!.worldsCount} |`).join('\n') + '\n');
 console.log(`Verified six puzzles: ${output}`);
} finally { await Promise.all(workers.map(w => w.terminate())); closeSync(fd); unlinkSync(lock); }
