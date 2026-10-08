import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hasDiverseStart } from '../src/game/generation.ts';
import { parseHumanDifficultyReport } from '../src/game/humanDifficulty.ts';
import { decodeMainlineSelectionSource, encodeMainlineCatalog, parseProductionRecords, type MainlineEntry } from '../src/game/mainlineCatalog.ts';
import { analyzeLevelFeatures, type LevelFeatureReport } from '../src/game/levelFeatures.ts';
import { buildFeatureDistribution } from '../src/game/featureDistribution.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { hasCleanStart, hasVariedStart } from '../src/game/startQuality.ts';
import { selectMountainLevels, type WaveCandidate } from '../src/game/waveSelection.ts';
import { createProductionPlan, productionSummary } from '../src/game/productionPlan.ts';

const [input, output, ...candidatePaths] = process.argv.slice(2);
if (!input || !output || !candidatePaths.length) throw new Error('Usage: replan-mainline <source catalog> <output catalog> <candidate pools...>');
if (resolve(input) === resolve(output) || resolve(output).startsWith(resolve('assets') + '/')) throw new Error('Produce a reviewable build outside runtime assets first');
const rawInput = await readFile(resolve(input), 'utf8'), original = decodeMainlineSelectionSource(rawInput);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function atomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + process.pid + '.tmp';
  try { await writeFile(temporary, value, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
const byKey = new Map(original.entries.map(entry => [entry.content.structureKey, entry]));
const sources = [{ path: resolve(input), sha256: hash(rawInput) }];
for (const path of candidatePaths) {
  const raw = await readFile(resolve(path), 'utf8'), data = JSON.parse(raw);
  if (!Array.isArray(data.records) || !data.records.length) throw new Error('Invalid candidate pool ' + path);
  sources.push({ path: resolve(path), sha256: hash(raw) });
  for (let start = 0; start < data.records.length; start += 1000) {
    const rows = data.records.slice(start, start + 1000).filter((row: MainlineEntry) => {
      const level = row.content.level;
      return row.content.origin.generator !== 'layered-shuffle-v1' && level.colors.length >= 4
        && hasCleanStart(level) && hasVariedStart(level)
        && (row.human.score!.total < 35 && !['D3', 'D4'].includes(row.rating.evidence.tier!) || hasDiverseStart(level));
    }).map((row: MainlineEntry) => ({ ...row, content: { ...row.content, origin: { ...row.content.origin,
      config: { ...row.content.origin.config, mixing: hasDiverseStart(row.content.level) ? 'diverse' : 'relaxed' } } } }));
    if (!rows.length) continue;
    const parsed = parseProductionRecords(rows.map((r: MainlineEntry) => ({ content: r.content, rating: r.rating })));
    parsed.forEach((record, index) => {
      let human;
      try { human = parseHumanDifficultyReport(rows[index].human, record.content.level, record.rating.evidence.rank!, record.rating.evidence.metrics.shortestMoves!); }
      catch (error) { throw new Error(`Invalid human binding in ${path}, ${record.content.level.id}`, { cause: error }); }
      const level = record.content.level;
      if (record.content.origin.generator === 'layered-shuffle-v1' || level.colors.length < 4 || !hasCleanStart(level)
        || !hasVariedStart(level) || record.content.solution.length > 60 || human.score!.total >= 35 && !hasDiverseStart(level)) return;
      if (!byKey.has(record.content.structureKey)) byKey.set(record.content.structureKey, { ...record, human, number: 0 });
    });
  }
}
const cachePath = resolve(dirname(output), 'pool-features.json');
const cache: Record<string, { fingerprint: string; features: LevelFeatureReport; optionalReserve: boolean | null }> = {};
try { Object.assign(cache, JSON.parse(await readFile(cachePath, 'utf8'))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
let baseline: Map<string, LevelFeatureReport> = new Map();
try {
  const data = JSON.parse(await readFile('builds/level-features/mainline-features.json', 'utf8'));
  if (data.sourceSha256 === hash(rawInput)) baseline = new Map(data.records.map((r: { report: LevelFeatureReport }) => [r.report.structureKey, r.report]));
} catch { /* A missing or differently bound report is recomputed. */ }
const candidates: WaveCandidate[] = [];
let analyzed = 0, unknownFeatures = 0, unknownReserves = 0;
for (const entry of byKey.values()) {
  const fingerprint = hash(JSON.stringify({ content: entry.content, human: entry.human, rank: entry.rating.evidence.rank }));
  const key = entry.content.structureKey;
  if (cache[key]?.fingerprint !== fingerprint) {
    let features = baseline.get(key) ?? analyzeLevelFeatures(entry.content.level, entry.content.solution, entry.human,
      entry.rating.evidence.rank!, { earlyProbe: { maxStates: 100000, maxMilliseconds: 4000 }, lateProbe: { maxStates: 100000, maxMilliseconds: 4000 } });
    if (features.early.status !== 'complete' || features.late.status !== 'complete') features = analyzeLevelFeatures(entry.content.level,
      entry.content.solution, entry.human, entry.rating.evidence.rank!, { earlyProbe: { maxStates: 1000000, maxMilliseconds: 60000 }, lateProbe: { maxStates: 1000000, maxMilliseconds: 60000 } });
    let optionalReserve: boolean | null = false;
    if (entry.content.origin.config.emptyBottles === 2) {
      const smaller = parseLevel({ ...entry.content.level, bottles: entry.content.level.bottles.slice(0, -1) });
      const result = solveBoard(initialBoard(smaller), { maxStates: 1000000, maxMilliseconds: 60000 });
      if (result.status === 'solved') replaySolution(initialBoard(smaller), result.route, 4);
      optionalReserve = result.status === 'solved' ? true : result.status === 'unsolvable' ? false : null;
    }
    cache[key] = { fingerprint, features, optionalReserve };
  }
  const checked = cache[key];
  if (checked.features.early.status !== 'complete' || checked.features.late.status !== 'complete') unknownFeatures++;
  else if (checked.optionalReserve === null) unknownReserves++;
  else candidates.push({ entry, features: checked.features, optionalReserve: checked.optionalReserve });
  analyzed++;
  if (analyzed % 50 === 0) {
    await atomic(cachePath, JSON.stringify(cache));
    console.log(JSON.stringify({ analyzed, total: byKey.size, usable: candidates.length, unknownFeatures, unknownReserves }));
  }
  await new Promise<void>(done => setImmediate(done));
}
await atomic(cachePath, JSON.stringify(cache));
const selection = selectMountainLevels(candidates, original.entries.slice(0, 3).map(e => e.content.structureKey));
const catalog = { id: 'mainline-1000-v5', entries: selection.entries };
const catalogJson = encodeMainlineCatalog(catalog);
await atomic(resolve(output), catalogJson);
const plan = createProductionPlan(), originalKeys = new Set(original.entries.map(e => e.content.structureKey));
const report = { format: 'bottle-harmony-mountain-selection', version: 1, catalogId: catalog.id, ...productionSummary(),
  catalogSha256: hash(catalogJson), sources, candidates: candidates.length, unknownFeatures, unknownReserves, swaps: selection.swaps,
  retainedBoards: selection.entries.filter(e => originalKeys.has(e.content.structureKey)).length,
  distribution: buildFeatureDistribution(selection.featureRows),
  records: selection.featureRows.map((row, index) => ({ ...row, design: selection.entries[index].design,
    optionalReserve: candidates.find(c => c.entry.content.structureKey === row.report.structureKey)!.optionalReserve })),
  cycles: Array.from({ length: 50 }, (_, i) => {
    const rows = selection.entries.slice(i * 20, i * 20 + 20), scores = rows.map(e => e.human.score!.total);
    return { cycle: i + 1, from: i * 20 + 1, to: i * 20 + 20, scores,
      subpeak: scores[9], peak: scores[19], valley: Math.min(...scores),
      mean: scores.reduce((sum, x) => sum + x, 0) / 20,
      drops: [i ? selection.entries[i * 20 - 1].human.score!.total - scores[0] : null, scores[9] - scores[10]],
      roles: plan.slice(i * 20, i * 20 + 20).map(s => s.waveRole) };
  }) };
await atomic(resolve(dirname(output), 'selection-report.json'), JSON.stringify(report));
console.log(JSON.stringify({ output, candidates: candidates.length, retained: report.retainedBoards, swaps: selection.swaps,
  unknownFeatures, unknownReserves, adjacency: { same: report.distribution.adjacency.samePrimaryPairs,
    longest: report.distribution.adjacency.longestPrimaryRun, similar: report.distribution.adjacency.similarPairs.length } }));
