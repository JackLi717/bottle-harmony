import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hasDiverseStart, parseGeneratedContent } from '../src/game/generation.ts';
import { decodeMainlineCatalog, encodeMainlineCatalog, parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import { analyzeLevelFeatures, FEATURE_MODEL } from '../src/game/levelFeatures.ts';

const [sourcePath, candidatePath, numberRaw, outputPath] = process.argv.slice(2);
const number = Number(numberRaw);
if (!sourcePath || !candidatePath || !outputPath || !Number.isInteger(number) || number < 4 || number > 1000)
  throw new Error('Usage: replace-mainline-score-matched <catalog> <candidate file> <level number> <output>');
const catalog = decodeMainlineCatalog(await readFile(resolve(sourcePath), 'utf8'));
const candidates = JSON.parse(await readFile(resolve(candidatePath), 'utf8'));
if (!Array.isArray(candidates.records) || candidates.records.length !== 1) throw new Error('Expected exactly one independently rated candidate');
const { content, rating, human } = candidates.records[0];
const diverse = hasDiverseStart(content.level);
const normalized = parseGeneratedContent({ ...content, origin: { ...content.origin,
  config: { ...content.origin.config, mixing: diverse ? 'diverse' : 'relaxed' } } });
const [record] = parseProductionRecords([{ content: normalized, rating }]);
const old = catalog.entries[number - 1];
if (human.status !== 'rated' || human.score?.total !== old.human.score?.total) throw new Error('Replacement must retain this slot score');
const features = analyzeLevelFeatures(record.content.level, record.content.solution, human, record.rating.evidence.rank!,
  { earlyProbe: { maxStates: 1000000, maxMilliseconds: 60000 }, lateProbe: { maxStates: 1000000, maxMilliseconds: 60000 } });
if (features.early.status !== 'complete' || features.late.status !== 'complete') throw new Error('Replacement feature evidence is incomplete');
const design = { ...old.design!, featureModel: FEATURE_MODEL, tags: features.tags, primary: features.primary };
const entries = catalog.entries.map((entry, index) => index === number - 1 ? { ...record, human, number, design } : entry);
const json = encodeMainlineCatalog({ id: catalog.id, entries });
const output = resolve(outputPath), temporary = `${output}.${process.pid}.tmp`;
await mkdir(dirname(output), { recursive: true });
try { await writeFile(temporary, json, { flag: 'wx' }); await rename(temporary, output); }
finally { await unlink(temporary).catch(() => {}); }
console.log(JSON.stringify({ output, number, score: human.score.total, colors: normalized.level.colors.length,
  bottles: normalized.level.bottles.length, levelId: normalized.level.id }));
