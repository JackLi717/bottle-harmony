import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeCatalog, encodeCatalog } from '../src/game/catalog.ts';
import { buildCatalog } from '../src/game/catalogBuilder.ts';
import { evaluateDifficulty } from '../src/game/difficulty.ts';

async function main() {
  const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
  if (command === '--help') { console.log('catalog build --seed 20261007 --per-tier 20 --output builds/catalog.json\ncatalog verify --input assets/levels/starter-catalog.json\nBuild budgets: --max-requests, --max-ms, --max-work. Incomplete batches preserve existing output.'); return; }
  if (command !== 'build' && command !== 'verify') throw new Error('Expected build or verify');
  const allowed = command === 'build' ? ['--seed', '--per-tier', '--max-requests', '--max-ms', '--max-work', '--output'] : ['--input'];
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!allowed.includes(key) || !value || value.startsWith('--') || values.has(key)) throw new Error(`Invalid argument ${key}`);
    values.set(key, value);
  }
  if (command === 'verify') {
    const path = resolve(values.get('--input') ?? 'assets/levels/starter-catalog.json');
    if ((await stat(path)).size > 2000000) throw new Error('Catalog exceeds 2 MB');
    const catalog = decodeCatalog(await readFile(path, 'utf8'));
    for (const entry of catalog.entries) {
      const recomputed = evaluateDifficulty(entry.content.level);
      if (JSON.stringify(recomputed) !== JSON.stringify(entry.difficulty)) throw new Error(`Stale rating ${entry.content.level.id}`);
    }
    console.log(`Reconstructed, replayed and re-rated ${catalog.entries.length} unique levels: ${catalog.id}`); return;
  }
  const number = (key: string, fallback: number) => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`Invalid ${key}`);
    return Number(raw);
  };
  const result = buildCatalog({ seed: number('--seed', 20261007), perTier: number('--per-tier', 20), maxRequests: number('--max-requests', 2000), maxMilliseconds: number('--max-ms', 5000), maxWork: number('--max-work', 200000) });
  if (result.status !== 'built') throw new Error(`No output written: ${JSON.stringify(result)}`);
  const output = resolve(values.get('--output') ?? 'builds/catalog.json');
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try { await writeFile(temporary, `${encodeCatalog(result.catalog)}\n`, { flag: 'wx' }); await rename(temporary, output); }
  finally { await unlink(temporary).catch(() => {}); }
  console.log(JSON.stringify({ output, ...result.stats }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
