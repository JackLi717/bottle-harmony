import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateLoad } from '../src/game/difficultyLoad.ts';
import { evaluateHumanDifficulty, tierForHumanScore } from '../src/game/humanDifficulty.ts';
import { decodeMainlineCatalog, encodeMainlineCatalog, type MainlineEntry, type ProductionRecord } from '../src/game/mainlineCatalog.ts';
import { encodePlayableMainline, decodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { productionSummary } from '../src/game/productionPlan.ts';
import { analyzeLevelFeatures } from '../src/game/levelFeatures.ts';

const [command, ...args] = process.argv.slice(2);
const values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].slice(2), value = args[i + 1];
  if (!args[i].startsWith('--') || !['input', 'output'].includes(name) || !value || values.has(name)) throw new Error('Invalid argument');
  values.set(name, value);
}
async function boundedRead(path: string) {
  if ((await stat(path)).size > 32000000) throw new Error('File exceeds byte limit');
  return readFile(path, 'utf8');
}
async function atomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, value, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
const options = { maxSolveStates: 100000, maxWork: 200000, maxMilliseconds: 60000 };
function rate(record: ProductionRecord) {
  const human = evaluateHumanDifficulty(record.content.level, record.rating.evidence.referenceSolution,
    record.rating.evidence.rank!, { maxSolveStates: 100000, maxMilliseconds: 60000 });
  if (human.status !== 'rated') throw new Error(`Human proxy unknown for ${record.content.level.id}`);
  return { ...record, human };
}
if (command === 'build') {
  const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
  const output = resolve(values.get('output') ?? 'builds/mainline-catalog.json');
  const source = decodeMainlineCatalog(await boundedRead(input));
  const entries: MainlineEntry[] = source.entries.map((entry, index) => ({ ...rate(entry), number: index + 1, design: entry.design }));
  const id = source.id;
  const json = encodeMainlineCatalog({ id, entries });
  await atomic(output, json);
  console.log(JSON.stringify({ output, id, ...productionSummary(),
    tiers: Object.fromEntries(['D1', 'D2', 'D3', 'D4'].map(tier => [tier, entries.filter(e => tierForHumanScore(e.human.score!.total) === tier).length])),
    stageMeans: Array.from({ length: 20 }, (_, i) => Number((entries.slice(i * 50, (i + 1) * 50)
      .reduce((sum, entry) => sum + entry.human.score!.total, 0) / 50).toFixed(2))) }, null, 2));
} else if (command === 'verify') {
  const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
  const raw = await boundedRead(input), catalog = decodeMainlineCatalog(raw);
  for (const entry of catalog.entries) {
    const actual = evaluateLoad(entry.content.level, options);
    if (JSON.stringify(actual) !== JSON.stringify(entry.rating)) throw new Error(`Planning evidence mismatch at ${entry.number}`);
    const human = evaluateHumanDifficulty(entry.content.level, actual.evidence.referenceSolution, actual.evidence.rank!,
      { maxSolveStates: 100000, maxMilliseconds: 60000 });
    if (JSON.stringify(human) !== JSON.stringify(entry.human)) throw new Error(`Human evidence mismatch at ${entry.number}`);
    const features = analyzeLevelFeatures(entry.content.level, entry.content.solution, human, actual.evidence.rank!,
      { earlyProbe: { maxStates: 1000000, maxMilliseconds: 60000 }, lateProbe: { maxStates: 1000000, maxMilliseconds: 60000 } });
    if (features.early.status !== 'complete' || features.late.status !== 'complete'
      || JSON.stringify(features.tags) !== JSON.stringify(entry.design?.tags) || features.primary !== entry.design?.primary)
      throw new Error(`Feature evidence mismatch at ${entry.number}`);
    if (entry.number % 50 === 0) console.log(`independent verification ${entry.number}/1000`);
  }
  const playable = encodePlayableMainline(catalog);
  decodePlayableMainline(playable);
  await atomic(resolve(values.get('output') ?? 'builds/mainline-play.json'), playable);
  console.log(JSON.stringify({ verified: 1000, id: catalog.id, ...productionSummary(),
    catalogSha256: createHash('sha256').update(raw).digest('hex'), bytes: Buffer.byteLength(raw) }));
} else throw new Error('Use build or verify');
