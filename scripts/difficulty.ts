import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeContentPool } from '../src/game/contentCodec.ts';
import { evaluateDifficulty } from '../src/game/difficulty.ts';
import { decodeDifficultyPool, encodeDifficultyPool } from '../src/game/difficultyCodec.ts';
import { DEMO_LEVEL } from '../src/game/demo.ts';

const HELP = `Usage: npm run levels:rate -- --input assets/levels/calibration.json --include-demo --require-rated --output assets/levels/calibration-difficulty.json
  --verify <report.json> recomputes and compares without writing.
  --max-work (1..10000000), --max-states (1..1000000), --max-ms (1..60000)
Default output: builds/difficulty-report.json. Unknown results never receive a tier.
--require-rated preserves existing output when any level cannot be rated.`;

async function main() {
  const args = process.argv.slice(2), values = new Map<string, string>(), flags = new Set<string>();
  if (args.includes('--help')) { console.log(HELP); return; }
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (['--include-demo', '--require-rated'].includes(name)) {
      if (flags.has(name)) throw new Error(`Duplicate ${name}`);
      flags.add(name); continue;
    }
    const value = args[++i];
    if (!['--input', '--output', '--verify', '--max-work', '--max-states', '--max-ms'].includes(name) || !value || value.startsWith('--') || values.has(name)) throw new Error(`Invalid argument ${name}`);
    values.set(name, value);
  }
  if (values.has('--verify') && values.has('--output')) throw new Error('Verify does not write an output');
  const input = resolve(values.get('--input') ?? 'assets/levels/calibration.json');
  if ((await stat(input)).size > 2000000) throw new Error('Input exceeds 2 MB');
  const levels = decodeContentPool(await readFile(input, 'utf8')).map(content => content.level);
  if (flags.has('--include-demo')) levels.push(DEMO_LEVEL);
  if (levels.length > 100) throw new Error('At most 100 levels per difficulty pool');
  const number = (key: string, fallback: number) => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`Invalid ${key}`);
    return Number(raw);
  };
  const reports = levels.map(level => evaluateDifficulty(level, { maxWork: number('--max-work', 1000000), maxSolveStates: number('--max-states', 100000), maxMilliseconds: number('--max-ms', 30000) }));
  if (flags.has('--require-rated') && reports.some(report => report.status !== 'rated')) throw new Error('Incomplete ratings; existing output preserved');
  const json = encodeDifficultyPool(reports, levels);
  if (values.has('--verify')) {
    const path = resolve(values.get('--verify')!);
    if ((await stat(path)).size > 2000000) throw new Error('Report exceeds 2 MB');
    const old = decodeDifficultyPool(await readFile(path, 'utf8'), levels);
    if (JSON.stringify(old) !== JSON.stringify(reports)) throw new Error('Stored difficulty differs from recomputed evidence');
    console.log(`Recomputed and verified ${reports.length} ratings: ${path}`);
  } else {
    const output = resolve(values.get('--output') ?? 'builds/difficulty-report.json');
    if (output === input) throw new Error('Output must not overwrite source levels');
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.tmp`;
    try { await writeFile(temporary, `${json}\n`, { flag: 'wx' }); await rename(temporary, output); }
    finally { await unlink(temporary).catch(() => {}); }
    console.log(`Saved ${reports.length} difficulty reports: ${output}`);
  }
  for (const report of reports) console.log(`${report.levelId}: ${report.tier ?? report.status}, E/C=${report.metrics.spareColorRatio.toFixed(3)}, shortest=${report.metrics.shortestMoves ?? '?'}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
