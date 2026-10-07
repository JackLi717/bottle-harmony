import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { evaluateLoad, evaluateLoadForTarget } from '../src/game/difficultyLoad.ts';
import { decodeMainlineCatalog, encodeMainlineCatalog, parseProductionRecords, type ProductionRecord } from '../src/game/mainlineCatalog.ts';
import { makeCandidate, makeLayeredCandidate, GENERATOR_ID, LAYERED_GENERATOR_ID, PRODUCTION_COLORS, hasDiverseStart, parseGeneratedContent, structureKey, contentMetrics } from '../src/game/generation.ts';
import { createProductionPlan, productionSummary } from '../src/game/productionPlan.ts';
import { initialBoard } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { encodePlayableMainline, decodePlayableMainline } from '../src/game/mainlinePlayable.ts';

const [command, ...args] = process.argv.slice(2);
const values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].slice(2), value = args[i + 1];
  if (!args[i].startsWith('--') || !['output', 'input', 'checkpoint', 'max-candidates'].includes(name) || !value || values.has(name)) throw new Error('Invalid argument');
  values.set(name, value);
}
async function boundedRead(path: string) {
  if ((await stat(path)).size > 32000000) throw new Error('File exceeds byte limit');
  return readFile(path, 'utf8');
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, typeof value === 'string' ? value : JSON.stringify(value), { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
const options = { maxSolveStates: 100000, maxWork: 200000, maxMilliseconds: 60000 };
const plan = createProductionPlan();
if (command === 'verify') {
  const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
  const catalog = decodeMainlineCatalog(await boundedRead(input));
  for (const [index, record] of catalog.entries.entries()) {
    const actual = evaluateLoad(record.content.level, options);
    if (JSON.stringify(actual) !== JSON.stringify(record.rating)) throw new Error(`Recomputed evidence mismatch at ${index + 1}`);
    if ((index + 1) % 50 === 0) console.log(`independent verification ${index + 1}/1000`);
  }
  const playable = encodePlayableMainline(catalog);
  decodePlayableMainline(playable);
  await atomic(resolve('builds/mainline-play.json'), playable);
  console.log(JSON.stringify({ verified: 1000, id: catalog.id, ...productionSummary(), bytes: (await stat(input)).size }));
} else if (command === 'build') {
  const output = resolve(values.get('output') ?? 'builds/mainline-catalog.json');
  const checkpoint = resolve(values.get('checkpoint') ?? 'builds/mainline-checkpoint.json');
  if (!checkpoint.startsWith(`${resolve('builds')}/`) || checkpoint === output) throw new Error('Checkpoint must be a separate file inside builds');
  const maximum = Number(values.get('max-candidates') ?? 1000000);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1000000) throw new Error('Invalid candidate budget');
  let cursor = 0, accepted: ProductionRecord[] = [];
  let proposalSchedule: { from: number; thinking: 'balanced' | 'layered' }[] = [{ from: 0, thinking: 'layered' }];
  let rejected: Record<string, number> = {};
  try {
    const saved = JSON.parse(await boundedRead(checkpoint));
    if (saved.format !== 'bottle-harmony-production-checkpoint' || saved.plan !== productionSummary().plan || JSON.stringify(saved.options) !== JSON.stringify(options)
      || !Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor > 1000000) throw new Error('Incompatible checkpoint');
    cursor = saved.cursor; accepted = saved.records.length ? [...parseProductionRecords(saved.records)] : []; rejected = saved.rejected;
    proposalSchedule = saved.proposalSchedule ?? [{ from: 0, thinking: 'balanced' }];
    if (!Array.isArray(proposalSchedule) || !proposalSchedule.length || proposalSchedule[0].from !== 0
      || proposalSchedule.some((s, i) => !Number.isInteger(s.from) || s.from < 0 || s.from > cursor || (i > 0 && s.from <= proposalSchedule[i - 1].from)
        || !['balanced', 'layered'].includes(s.thinking))) throw new Error('Invalid proposal schedule');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const seen = new Set(accepted.map(r => r.content.structureKey));
  const quota = productionSummary().ranks as Record<string, number>;
  const counts = () => Array.from({ length: 8 }, (_, i) => accepted.filter(r => r.rating.evidence.rank === i + 1).length);
  const save = () => atomic(checkpoint, { format: 'bottle-harmony-production-checkpoint', plan: productionSummary().plan, options, proposalSchedule, cursor, rejected, records: accepted });
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
  while (accepted.length < 1000 && cursor < maximum) {
    const rankCounts = counts(), target = rankCounts.findIndex((count, i) => count < quota[String(i + 1)]) + 1;
    const needed = plan.filter(s => s.rank === target), offset = rankCounts[target - 1];
    const slot = needed[offset];
    const seed = (20261007 + cursor) >>> 0;
    const teaching = target === 1 && offset < 3;
    const minimum = slot.preferredColorsMinimum ?? 4, maximumColors = slot.preferredColorsMaximum ?? 8;
    const count = teaching ? 2 + (cursor % 2) : minimum + ((cursor * 7 + offset) % (maximumColors - minimum + 1));
    const emptyBottles = target <= 2 ? 2 : 1;
    const config = { colors: PRODUCTION_COLORS.slice(0, Math.min(count, 12 - emptyBottles)), emptyBottles: emptyBottles as 1 | 2, minSolutionMoves: 1, maxSolutionMoves: 60, mixing: target >= 3 ? 'diverse' as const : 'relaxed' as const };
    const schedule = proposalSchedule.findLast(s => s.from <= cursor)!;
    const generator = !teaching && (target <= 2 || (slot.role === 'thinking' && schedule.thinking === 'layered')) ? LAYERED_GENERATOR_ID : GENERATOR_ID;
    const level = (generator === LAYERED_GENERATOR_ID ? makeLayeredCandidate : makeCandidate)(seed, 0, config);
    if (target >= 3 && !hasDiverseStart(level)) { reject('mixing'); cursor++; continue; }
    const key = structureKey(level);
    if (seen.has(key)) { reject('duplicate'); cursor++; continue; }
    const solved = solveBoard(initialBoard(level), { maxStates: options.maxSolveStates, maxMilliseconds: options.maxMilliseconds });
    if (solved.status !== 'solved') {
      if (solved.status === 'limitReached' && solved.reason === 'time') { await save(); throw new Error(`Time budget: resume candidate ${cursor}`); }
      reject(solved.status); cursor++; continue;
    }
    if (solved.route.length > slot.maxSolutionMoves || solved.route.length < 1 || contentMetrics(level, solved.route.length).mixedBottles < 2) { reject('moves'); cursor++; continue; }
    const rating = evaluateLoadForTarget(level, target, options);
    if (rating === 'above-target') { reject('above-target'); cursor++; continue; }
    if (rating.evidence.reason === 'policy-time' || rating.evidence.reason === 'solver-time') { await save(); throw new Error(`Rating time budget: resume candidate ${cursor}`); }
    const actual = rating.evidence.rank;
    if (!actual || !rating.score) { reject(rating.evidence.reason ?? 'unrated'); cursor++; continue; }
    // Requested slots influence proposals only; each accepted label is proven.
    // Keep this pass focused, so ordinary candidates respect their preferred size.
    if (actual !== target) { reject(`rank-${actual}`); cursor++; continue; }
    const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1, origin: { generator, seed, candidateIndex: 0, config }, level, structureKey: key, solution: solved.route, metrics: contentMetrics(level, solved.route.length) });
    accepted.push({ content, rating }); seen.add(key); cursor++;
    if (accepted.length % 10 === 0) { await save(); console.log(JSON.stringify({ accepted: accepted.length, cursor, ranks: counts() })); }
  }
  await save();
  if (accepted.length !== 1000) throw new Error(`Candidate budget exhausted: ${accepted.length}/1000, checkpoint retained`);
  const pools = Array.from({ length: 8 }, (_, i) => accepted.filter(r => r.rating.evidence.rank === i + 1));
  // Rank-four has five closing nodes plus ordinary thinking. Take the lowest
  // scores for its five closing nodes; all challenge-only pools ascend by score.
  for (let i = 3; i < 8; i++) pools[i].sort((a, b) => a.rating.score!.total - b.rating.score!.total || a.content.level.id.localeCompare(b.content.level.id));
  const rankFourClosing = pools[3].splice(0, 5);
  const entries = plan.map(slot => ({ number: slot.number, ...(slot.role === 'challenge' && slot.rank === 4 ? rankFourClosing.shift()! : pools[slot.rank - 1].shift()!) }));
  const json = encodeMainlineCatalog({ id: 'mainline-1000-v1', entries });
  await atomic(output, json);
  await atomic(resolve('builds/mainline-production-summary.json'), { ...productionSummary(), cursor, rejected, bytes: Buffer.byteLength(json), colors: Array.from({ length: 11 }, (_, i) => ({ colors: i + 1, count: entries.filter(e => e.content.level.colors.length === i + 1).length })) });
  console.log(`Produced 1000 source-bound, replay-validated, graded and deduplicated levels: ${output}`);
} else throw new Error('Use build or verify');
