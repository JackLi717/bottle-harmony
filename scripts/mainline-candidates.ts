import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { evaluateLoad } from '../src/game/difficultyLoad.ts';
import { evaluateHumanDifficulty } from '../src/game/humanDifficulty.ts';
import { ANCHORED_GENERATOR_ID, contentMetrics, GENERATOR_ID, hasDiverseStart, makeAnchoredCandidate, makeCandidate, parseGeneratedContent, PRODUCTION_COLORS, structureKey } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';
import { analyzeLevelFeatures, type LevelFeatureReport } from '../src/game/levelFeatures.ts';

const count = Number(process.argv[2] ?? 40);
const colors = Number(process.argv[3] ?? 6);
const spares = Number(process.argv[4] ?? 2) as 1 | 2;
const startingSeed = Number(process.argv[5] ?? 1000000);
const output = process.argv[6] ?? 'builds/mainline-candidates.json';
const generator = process.argv[7] ?? ANCHORED_GENERATOR_ID;
if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(colors) || colors < 3 || colors > 11
  || (spares !== 1 && spares !== 2) || colors + spares > 12
  || !Number.isInteger(startingSeed) || startingSeed < 0 || startingSeed > 0xffffffff
  || (generator !== ANCHORED_GENERATOR_ID && generator !== GENERATOR_ID)) throw new Error('Invalid candidate batch settings');
mkdirSync(dirname(output), { recursive: true });
const temporary = `${output}.${process.pid}.tmp`;
const config = { colors: PRODUCTION_COLORS.slice(0, colors), emptyBottles: spares,
  minSolutionMoves: 1, maxSolutionMoves: 60, mixing: 'relaxed' as const };
const records: { content: ReturnType<typeof parseGeneratedContent>; rating: ReturnType<typeof evaluateLoad>;
  human: ReturnType<typeof evaluateHumanDifficulty>; diverse: boolean; features: LevelFeatureReport }[] = [];
let examined = 0;
for (let seed = startingSeed; seed <= 0xffffffff && seed < startingSeed + 100000 && records.length < count; seed++) {
  examined++;
  const level = generator === ANCHORED_GENERATOR_ID
    ? makeAnchoredCandidate(seed, 0, config) : makeCandidate(seed, 0, config);
  if (!hasCleanStart(level)) continue;
  const filled = level.bottles.filter(bottle => bottle.layers.length);
  if (filled.every(bottle => bottle.layers[0] === bottle.layers[1]) || !filled.some(bottle => new Set(bottle.layers).size === 4)) continue;
  const solved = solveBoard(initialBoard(level), { maxStates: 100000, maxMilliseconds: 60000 });
  if (solved.status !== 'solved' || solved.route.length > 60) continue;
  const rating = evaluateLoad(level, { maxSolveStates: 100000, maxWork: 200000, maxMilliseconds: 60000 });
  if (rating.evidence.status !== 'rated') continue;
  const human = evaluateHumanDifficulty(level, rating.evidence.referenceSolution, rating.evidence.rank!,
    { maxSolveStates: 100000, maxMilliseconds: 60000 });
  if (human.status !== 'rated') continue;
  const diverse = hasDiverseStart(level);
  if ((rating.evidence.tier === 'D3' || rating.evidence.tier === 'D4' || human.score!.total >= 35) && !diverse) continue;
  const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1,
    origin: { generator, seed, candidateIndex: 0,
      config: { ...config, mixing: diverse ? 'diverse' : 'relaxed' } }, level,
    structureKey: structureKey(level), solution: solved.route, metrics: contentMetrics(level, solved.route.length) });
  const features = analyzeLevelFeatures(level, content.solution, human, rating.evidence.rank!);
  records.push({ content, rating, human, diverse, features });
  console.log(records.length, seed, human.score!.total, rating.evidence.rank, solved.route.length,
    filled.filter(bottle => bottle.layers[0] === bottle.layers[1]).length);
  writeFileSync(temporary, JSON.stringify({ examined, records }));
}
if (records.length !== count) { unlinkSync(temporary); throw new Error(`Only ${records.length}/${count} candidates after ${examined} seeds`); }
renameSync(temporary, output);
console.log(JSON.stringify({ output, examined, accepted: records.length }));
