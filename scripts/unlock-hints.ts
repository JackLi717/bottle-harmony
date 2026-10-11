import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { generatedPostKeyTrials } from '../src/game/unlockGenerated.ts';
import type { SingleKeyHintTable } from '../src/game/unlockHints.ts';
import { completeSingleKeyHints } from './lib/unlockCompleteHints.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';

assert.equal(process.argv.length, 2, 'Unknown hint-generation option');
const bank = JSON.parse(readFileSync('assets/levels/unlock-post-key-20.json', 'utf8'));
const { evidenceSha256, ...bankPayload } = bank;
assert.equal(evidenceSha256, sha256(bankPayload)); generatedPostKeyTrials(bank);
const output = 'builds/unlock-hints'; mkdirSync(output, { recursive: true });
const tables: Record<string, SingleKeyHintTable> = {}, checks: { number: number; [key: string]: unknown }[] = [];

if (isMainThread) {
  const workers = new Set<Worker>(), pending = [...bank.entries], completed = new Map<string, SingleKeyHintTable>();
  try { await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const entry = pending.shift()!;
      const result = await new Promise<{ tables: Record<string, SingleKeyHintTable>; checks: typeof checks }>((resolve, reject) => {
        const worker = new Worker(new URL('./unlock-hints.ts', import.meta.url), { workerData: { number: entry.number } });
        workers.add(worker); worker.once('message', resolve); worker.once('error', reject);
        worker.once('exit', code => { workers.delete(worker); if (code) reject(new Error(`Hint worker exited ${code}`)); });
      });
      completed.set(entry.puzzle.id, result.tables[entry.puzzle.id]); checks.push(...result.checks);
    }
  })); } finally { await Promise.all([...workers].map(worker => worker.terminate())); }
  for (const entry of bank.entries) { const table = completed.get(entry.puzzle.id); assert.ok(table); tables[entry.puzzle.id] = table; }
  checks.sort((a, b) => a.number - b.number);
 } else {
  const entry = bank.entries.find((e: { number: number }) => e.number === workerData.number); assert.ok(entry);
  const { table, check } = completeSingleKeyHints(entry, bank.recipe.disclosure, output);
  tables[entry.puzzle.id] = table; checks.push(check);
  console.log(JSON.stringify(check)); parentPort!.postMessage({ tables, checks });
}

if (isMainThread) {
  const payload = { method: 'single-key-complete-hints-v1', bankEvidenceSha256: bank.evidenceSha256, tables };
  const result = { ...payload, evidenceSha256: sha256(payload) };
  writeFileSync(`${output}/verification.json`, JSON.stringify({ status: 'pass', checks }, null, 2) + '\n');
  writeFileSync(`${output}/hints.json`, JSON.stringify(result) + '\n');
  writeFileSync('assets/levels/unlock-post-key-hints.json.tmp', JSON.stringify(result) + '\n');
  renameSync('assets/levels/unlock-post-key-hints.json.tmp', 'assets/levels/unlock-post-key-hints.json');
}
