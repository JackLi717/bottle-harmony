import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { evaluateLoad } from '../src/game/difficultyLoad.ts';
import { HUMAN_MODEL, evaluateHumanDifficulty, tierForHumanScore } from '../src/game/humanDifficulty.ts';
import { decodeMainlineCatalog, encodeMainlineCatalog, parseProductionRecords, type MainlineEntry, type ProductionRecord } from '../src/game/mainlineCatalog.ts';
import { encodePlayableMainline, decodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { challengeTarget, createProductionPlan, productionSummary, PRODUCTION_PLAN } from '../src/game/productionPlan.ts';
import { recordObject } from '../src/game/generation.ts';

const [command, ...args] = process.argv.slice(2);
const values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].slice(2), value = args[i + 1];
  if (!args[i].startsWith('--') || !['input', 'candidates', 'output'].includes(name) || !value || values.has(name)) throw new Error('Invalid argument');
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
type Rated = ReturnType<typeof rate>;
const compare = (a: Rated, b: Rated) => a.human.score!.total - b.human.score!.total || a.content.structureKey.localeCompare(b.content.structureKey);
if (command === 'build') {
  const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
  const output = resolve(values.get('output') ?? 'builds/mainline-catalog.json');
  const source = recordObject(JSON.parse(await boundedRead(input)), ['format', 'version', 'id', 'plan', 'model', 'records'], 'source catalog');
  if (source.format !== 'bottle-harmony-mainline' || !Array.isArray(source.records) || source.records.length !== 1000) throw new Error('Invalid source catalog');
  const originals = parseProductionRecords(source.records.map(row => {
    const value = recordObject(row, ['number', 'content', 'rating', 'human'], 'source entry');
    return { content: value.content, rating: value.rating };
  })).map(rate);
  let entries: MainlineEntry[];
  if (source.plan === PRODUCTION_PLAN) {
    // Rebuild the current baseline without reselecting an already fixed pool.
    entries = originals.map((record, index) => ({ ...record, number: index + 1 }));
  } else {
    const candidatePath = resolve(values.get('candidates') ?? 'builds/human-candidates.json');
    const candidateFile = recordObject(JSON.parse(await boundedRead(candidatePath)), ['format', 'version', 'model', 'records'], 'candidate pool');
    if (candidateFile.format !== 'bottle-harmony-human-candidates' || candidateFile.model !== HUMAN_MODEL || !Array.isArray(candidateFile.records)
      || candidateFile.records.length !== 150) throw new Error('Invalid candidate pool');
    const newcomers = parseProductionRecords(candidateFile.records.map(row => {
      const value = recordObject(row, ['content', 'rating', 'human'], 'candidate');
      return { content: value.content, rating: value.rating };
    })).map(rate);
    const eligible = originals.filter((record, index) => index >= 3 && record.human.score!.total >= 18 && record.human.score!.total <= 30)
      .sort((a, b) => (a.human.score!.trapPeak + a.human.score!.trapRepeat) - (b.human.score!.trapPeak + b.human.score!.trapRepeat)
        || Math.abs(a.human.score!.total - 22) - Math.abs(b.human.score!.total - 22)
        || a.content.structureKey.localeCompare(b.content.structureKey));
    if (eligible.length < 150) throw new Error('Not enough low-risk boards to replace');
    const removed = new Set(eligible.slice(0, 150).map(record => record.content.structureKey));
    const pool = [...originals.filter(record => !removed.has(record.content.structureKey)), ...newcomers].sort(compare);
    if (pool.length !== 1000 || new Set(pool.map(record => record.content.structureKey)).size !== 1000) throw new Error('Candidate pool is incomplete or duplicated');
    const finalFive = pool.splice(-5);
    const challenges: Rated[] = [];
    for (let wave = 1; wave <= 95; wave++) {
      const index = pool.findIndex(record => record.human.score!.total >= challengeTarget(wave)
        && (!challenges.length || record.human.score!.total >= challenges.at(-1)!.human.score!.total));
      if (index < 0) throw new Error(`Challenge candidate gap at wave ${wave}`);
      challenges.push(pool.splice(index, 1)[0]);
    }
    challenges.push(...finalFive);
    if (Number(pool.length) !== 900 || challenges.length !== 100) throw new Error('Incorrect ramp allocation');
    entries = createProductionPlan().map(slot => ({ ...((slot.role === 'challenge')
      ? challenges[slot.wave - 1] : pool[(slot.wave - 1) * 9 + slot.position - 1]), number: slot.number }));
  }
  const json = encodeMainlineCatalog({ id: 'mainline-1000-v3', entries });
  await atomic(output, json);
  console.log(JSON.stringify({ output, id: 'mainline-1000-v3', ...productionSummary(),
    tiers: Object.fromEntries(['D1', 'D2', 'D3', 'D4'].map(tier => [tier, entries.filter(e => tierForHumanScore(e.human.score!.total) === tier).length])),
    stageMeans: Array.from({ length: 20 }, (_, i) => Number((entries.slice(i * 50, (i + 1) * 50)
      .reduce((sum, entry) => sum + entry.human.score!.total, 0) / 50).toFixed(2))) }, null, 2));
} else if (command === 'verify') {
  const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
  const catalog = decodeMainlineCatalog(await boundedRead(input));
  for (const entry of catalog.entries) {
    const actual = evaluateLoad(entry.content.level, options);
    if (JSON.stringify(actual) !== JSON.stringify(entry.rating)) throw new Error(`Planning evidence mismatch at ${entry.number}`);
    const human = evaluateHumanDifficulty(entry.content.level, actual.evidence.referenceSolution, actual.evidence.rank!,
      { maxSolveStates: 100000, maxMilliseconds: 60000 });
    if (JSON.stringify(human) !== JSON.stringify(entry.human)) throw new Error(`Human evidence mismatch at ${entry.number}`);
    if (entry.number % 50 === 0) console.log(`independent verification ${entry.number}/1000`);
  }
  const playable = encodePlayableMainline(catalog);
  decodePlayableMainline(playable);
  await atomic(resolve(values.get('output') ?? 'builds/mainline-play.json'), playable);
  console.log(JSON.stringify({ verified: 1000, id: catalog.id, ...productionSummary(), bytes: (await stat(input)).size }));
} else throw new Error('Use build or verify');
