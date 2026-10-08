import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeMainlineCatalog, encodeMainlineCatalog, parseProductionRecords, type MainlineEntry } from '../src/game/mainlineCatalog.ts';
import { createProductionPlan } from '../src/game/productionPlan.ts';
import { measureStartVariety } from '../src/game/startQuality.ts';
import { analyzeLevelFeatures } from '../src/game/levelFeatures.ts';

const [input, output, ...candidatePaths] = process.argv.slice(2);
if (!input || !output || candidatePaths.length === 0)
  throw new Error('Usage: refresh-opening-mix <catalog> <output> <candidate files...>');
const catalog = decodeMainlineCatalog(await readFile(resolve(input), 'utf8'));
const plan = createProductionPlan();
const candidates: Omit<MainlineEntry, 'number'>[] = [];
for (const path of candidatePaths) {
  const pool = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!Array.isArray(pool.records)) throw new Error(`Invalid candidate file ${path}`);
  const records = parseProductionRecords(pool.records.map((row: MainlineEntry) => ({ content: row.content, rating: row.rating })));
  for (let index = 0; index < records.length; index++) {
    const human = pool.records[index].human;
    const start = measureStartVariety(records[index].content.level);
    if (human?.status === 'rated' && start.bottomPairs > 0 && start.bottomPairs < start.filled && start.fourColors > 0)
      candidates.push({ ...records[index], human });
  }
}
const used = new Set(catalog.entries.map(entry => entry.content.structureKey));
const entries = [...catalog.entries];
const replaced: { number: number; score: number; colors: number; bottomPairs: number }[] = [];
for (let target = 6; target <= 98; target += 4) {
  const positions = Array.from({ length: 5 }, (_, offset) => target + offset - 2)
    .filter(number => number >= 4 && number <= 100 && plan[number - 1].role === 'ordinary'
      && plan[number - 1].waveRole !== 'recovery' && !replaced.some(row => Math.abs(row.number - number) < 3))
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  let choice: { number: number; index: number } | undefined;
  for (const number of positions) {
    const score = entries[number - 1].human.score!.total;
    const index = candidates.findIndex(row => row.human.score?.total === score && !used.has(row.content.structureKey));
    if (index >= 0) { choice = { number, index }; break; }
  }
  if (!choice) continue;
  const candidate = candidates[choice.index];
  const start = measureStartVariety(candidate.content.level);
  const features = analyzeLevelFeatures(candidate.content.level, candidate.content.solution, candidate.human, candidate.rating.evidence.rank!,
    { earlyProbe: { maxStates: 1000000, maxMilliseconds: 60000 }, lateProbe: { maxStates: 1000000, maxMilliseconds: 60000 } });
  if (features.early.status !== 'complete' || features.late.status !== 'complete') throw new Error('Opening replacement lacks complete feature evidence');
  entries[choice.number - 1] = { ...candidate, number: choice.number,
    design: { ...entries[choice.number - 1].design!, tags: features.tags, primary: features.primary } };
  used.add(candidate.content.structureKey);
  replaced.push({ number: choice.number, score: candidate.human.score!.total,
    colors: candidate.content.level.colors.length, bottomPairs: start.bottomPairs });
}
if (replaced.length < 10 || replaced.filter(row => row.number <= 43).length < 5)
  throw new Error(`Insufficient early structural mix: ${JSON.stringify(replaced)}`);
const json = encodeMainlineCatalog({ id: catalog.id, entries });
const destination = resolve(output), temporary = `${destination}.${process.pid}.tmp`;
await mkdir(dirname(destination), { recursive: true });
try { await writeFile(temporary, json, { flag: 'wx' }); await rename(temporary, destination); }
finally { await unlink(temporary).catch(() => {}); }
console.log(JSON.stringify({ output: destination, replaced }, null, 2));
