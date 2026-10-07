import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeCatalog } from '../src/game/catalog.ts';
import { loadCalibrationSamples } from '../src/game/calibration.ts';
import { DEMO_LEVEL } from '../src/game/demo.ts';
import { evaluateLoad, LOAD_MODEL } from '../src/game/difficultyLoad.ts';
import { createProductionPlan, productionSummary } from '../src/game/productionPlan.ts';

const HELP = `production plan --output builds/production-plan.json
production rate --input assets/levels/starter-catalog.json --output builds/production-difficulty.json
production verify --input assets/levels/starter-catalog.json --report builds/production-difficulty.json
rate/verify options: --max-states, --max-work, --max-ms, --require-rated (true|false).
Reports contain current catalog + eight calibration levels + original demo.
The plan contains requested slots, not generated levels. Failed batches preserve output.`;
async function atomicWrite(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
async function boundedRead(path: string) {
  if ((await stat(path)).size > 32000000) throw new Error('Production input exceeds 32 MB');
  return readFile(path, 'utf8');
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help') { console.log(HELP); return; }
  if (!['plan', 'rate', 'verify'].includes(command)) throw new Error(HELP);
  const allowed = command === 'plan' ? ['--output'] : ['--input', '--output', '--report', '--max-states', '--max-work', '--max-ms', '--require-rated'];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!allowed.includes(key) || !value || value.startsWith('--') || values.has(key)) throw new Error(`Invalid argument ${key}`);
    values.set(key, value);
  }
  if (command === 'plan') {
    const summary = productionSummary();
    const output = resolve(values.get('--output') ?? 'builds/production-plan.json');
    // Avoid replacing playable baseline artifacts with a recipe.
    if (output.startsWith(resolve('assets') + '/')) throw new Error('Production recipes belong outside playable assets');
    await atomicWrite(output, { ...summary, slots: createProductionPlan() });
    console.log(JSON.stringify({ output, total: summary.total, tiers: summary.tiers, ranks: summary.ranks }, null, 2)); return;
  }
  const number = (key: string, fallback: number) => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`Invalid ${key}`);
    return Number(raw);
  };
  const required = values.get('--require-rated') ?? 'false';
  if (!['true', 'false'].includes(required)) throw new Error('--require-rated must be true or false');
  if (command === 'rate' && values.has('--report')) throw new Error('--report is for verify');
  if (command === 'verify' && (values.has('--output') || !values.has('--report'))) throw new Error('verify requires --report and does not write');
  const input = resolve(values.get('--input') ?? 'assets/levels/starter-catalog.json');
  const catalog = decodeCatalog(await boundedRead(input));
  const samples = loadCalibrationSamples(await boundedRead(resolve('assets/levels/calibration.json')));
  const levels = [...catalog.entries.map(entry => entry.content.level), ...samples.map(sample => sample.content.level), DEMO_LEVEL];
  const options = { maxSolveStates: number('--max-states', 100000), maxWork: number('--max-work', 1000000), maxMilliseconds: number('--max-ms', 30000) };
  const records = levels.map(level => evaluateLoad(level, options));
  const unresolved = records.filter(report => report.evidence.status !== 'rated');
  if (required === 'true' && unresolved.length) throw new Error(`${unresolved.length} unresolved levels; no output written`);
  const report = { format: 'bottle-harmony-production-report', version: 1, model: LOAD_MODEL, catalogId: catalog.id, records };
  if (command === 'verify') {
    const saved = JSON.parse(await boundedRead(resolve(values.get('--report')!)));
    if (JSON.stringify(saved) !== JSON.stringify(report)) throw new Error('Production report does not match full recomputation');
    console.log(`Recomputed ${records.length} production ratings and scores`); return;
  }
  const output = resolve(values.get('--output') ?? 'builds/production-difficulty.json');
  if (output === input || output.startsWith(resolve('assets') + '/')) throw new Error('Production reports belong outside playable assets');
  await atomicWrite(output, report);
  const ranks = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, records.filter(record => record.evidence.rank === i + 1).length]));
  console.log(JSON.stringify({ output, rated: records.length - unresolved.length, unresolved: unresolved.length, ranks }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
