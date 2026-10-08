import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeContentPool, encodeContentPool } from '../src/game/contentCodec.ts';
import { generateContent } from '../src/game/generator.ts';
import { ANCHORED_GENERATOR_ID, GENERATOR_ID, LAYERED_GENERATOR_ID, PRODUCTION_COLORS, type GeneratedContent } from '../src/game/generation.ts';

const HELP = `Usage:
  npm run levels:generate -- --seed 717 --colors 3 --count 10 --output builds/levels.json
  npm run levels:verify -- --input builds/levels.json
Generate options: --seed, --colors (2..11; colors + empty bottles <=12), --count (1..1000), --empty-bottles (1..2),
  --min-moves, --max-moves, --max-attempts, --max-states, --max-total-states, --max-ms, --output
  --mixing (relaxed|diverse; diverse requires >=3 colors per initial filled bottle, <=2 layers per color)
  --generator (balanced-shuffle-v1|anchored-shuffle-v1|layered-shuffle-v1)
Generation validates every record before atomically replacing the output. Existing output survives a failed batch.
Verification reconstructs each candidate, replays every move and checks metadata and duplicates.`;

function argumentsMap(command: string | undefined, args: string[]): Map<string, string> {
  const allowed = command === 'generate'
    ? ['seed', 'colors', 'count', 'empty-bottles', 'min-moves', 'max-moves', 'max-attempts', 'max-states', 'max-total-states', 'max-ms', 'output', 'mixing', 'generator']
    : ['input'];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !allowed.includes(key) || !value || value.startsWith('--') || values.has(key)) throw new Error(`Invalid or duplicate argument ${args[i]}`);
    values.set(key, value);
  }
  return values;
}
function integer(values: Map<string, string>, name: string, fallback: number): number {
  const raw = values.get(name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`--${name} must be a nonnegative integer`);
  return Number(raw);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || args.includes('--help')) { console.log(HELP); return; }
  if (command !== 'generate' && command !== 'verify') throw new Error(HELP);
  const values = argumentsMap(command, args);
  if (command === 'verify') {
    const input = values.get('input');
    if (!input) throw new Error('--input is required');
    const path = resolve(input);
    if ((await stat(path)).size > 32000000) throw new Error('Pool file exceeds 32 MB input limit');
    const records = decodeContentPool(await readFile(path, 'utf8'));
    console.log(`Verified ${records.length} distinct records by candidate reconstruction and full legal replay: ${path}`);
    return;
  }
  const colorCount = integer(values, 'colors', 3), count = integer(values, 'count', 10);
  if (colorCount < 2 || colorCount > 11 || count < 1 || count > 1000) throw new Error('--colors must be 2..11 and --count must be 1..1000');
  const seed = integer(values, 'seed', 717);
  if (seed > 0xffffffff) throw new Error('--seed must be an unsigned 32-bit integer');
  const emptyBottles = integer(values, 'empty-bottles', 2);
  if (emptyBottles !== 1 && emptyBottles !== 2) throw new Error('--empty-bottles must be 1 or 2');
  if (colorCount + emptyBottles > 12) throw new Error('Colors plus empty bottles must not exceed 12');
  const mixing = values.get('mixing') ?? 'relaxed';
  if (mixing !== 'relaxed' && mixing !== 'diverse') throw new Error('--mixing must be relaxed or diverse');
  const generator = values.get('generator') ?? GENERATOR_ID;
  if (generator !== GENERATOR_ID && generator !== ANCHORED_GENERATOR_ID && generator !== LAYERED_GENERATOR_ID) throw new Error('Unsupported --generator');
  const records: GeneratedContent[] = [];
  let visitedStates = 0, attempts = 0, elapsedMilliseconds = 0;
  for (let index = 0; index < count; index++) {
    const result = generateContent({ seed: (seed + index) >>> 0,
      colors: PRODUCTION_COLORS.slice(0, colorCount), emptyBottles, mixing, generator,
      minSolutionMoves: integer(values, 'min-moves', 3), maxSolutionMoves: integer(values, 'max-moves', 80),
      maxAttempts: integer(values, 'max-attempts', 64), maxStates: integer(values, 'max-states', 30000),
      maxTotalStates: integer(values, 'max-total-states', 150000), maxMilliseconds: integer(values, 'max-ms', 5000),
      excludedKeys: records.map(record => record.structureKey) });
    if (result.status !== 'generated') throw new Error(`Batch stopped at record ${index + 1}: ${JSON.stringify(result)}. No output was written.`);
    records.push(result.content);
    visitedStates += result.stats.visitedStates; attempts += result.stats.attempts; elapsedMilliseconds += result.stats.elapsedMilliseconds;
  }
  const json = encodeContentPool(records);
  decodeContentPool(json); // Verify the exact serialized artifact before making it available.
  const output = resolve(values.get('output') ?? 'builds/levels.json');
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  const handle = await open(temporary, 'wx');
  try {
    await handle.writeFile(`${json}\n`);
    await handle.close();
    await rename(temporary, output);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  console.log(JSON.stringify({ output, records: records.length, colors: colorCount, seed, mixing, generator, attempts, visitedStates, activeMilliseconds: Math.round(elapsedMilliseconds),
    solutionMoves: records.map(record => record.metrics.solutionMoves) }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
