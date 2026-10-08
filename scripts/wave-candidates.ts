import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { evaluateLoad } from '../src/game/difficultyLoad.ts';
import { evaluateHumanDifficulty } from '../src/game/humanDifficulty.ts';
import { ANCHORED_GENERATOR_ID, contentMetrics, GENERATOR_ID, hasDiverseStart, makeAnchoredCandidate, makeCandidate, parseGeneratedContent, PRODUCTION_COLORS, structureKey } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { hasCleanStart, hasVariedStart } from '../src/game/startQuality.ts';

const output = process.argv[2] ?? 'builds/wave-selection/high-candidates.json';
const count = Number(process.argv[3] ?? 160);
const minimumScore = Number(process.argv[4] ?? 58), startingSeed = Number(process.argv[5] ?? 8000000);
if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(minimumScore) || minimumScore < 58 || minimumScore > 90
  || !Number.isInteger(startingSeed) || startingSeed < 0 || startingSeed + 100000 > 0xffffffff) throw new Error('Invalid candidate settings');
const records: { content: ReturnType<typeof parseGeneratedContent>; rating: ReturnType<typeof evaluateLoad>;
  human: ReturnType<typeof evaluateHumanDifficulty> }[] = [];
let examined = 0, seedOffset = 0;
const rejected = { opening: 0, solve: 0, planning: 0, human: 0, score: 0 };
try {
  const prior = JSON.parse(readFileSync(output, 'utf8'));
  if (prior.minimumScore !== undefined && (prior.minimumScore !== minimumScore || prior.startingSeed !== startingSeed)) throw new Error('Checkpoint settings differ');
  records.push(...prior.records); examined = prior.examined; seedOffset = prior.seedOffset;
  Object.assign(rejected, prior.rejected);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
mkdirSync(dirname(output), { recursive: true });
const save = () => {
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ examined, seedOffset, rejected, minimumScore, startingSeed, records }));
  renameSync(temporary, output);
};
while (records.length < count && seedOffset < 100000) {
  const colors = seedOffset % 2 === 0 ? 8 : 9;
  const seed = startingSeed + seedOffset++;
  const generator = colors === 8 ? GENERATOR_ID : ANCHORED_GENERATOR_ID;
  const config = { colors: PRODUCTION_COLORS.slice(0, colors), emptyBottles: 1 as const,
    minSolutionMoves: 1, maxSolutionMoves: 60, mixing: 'diverse' as const };
  const level = generator === GENERATOR_ID ? makeCandidate(seed, 0, config) : makeAnchoredCandidate(seed, 0, config);
  examined++;
  if (!hasCleanStart(level) || !hasVariedStart(level) || !hasDiverseStart(level)) { rejected.opening++; continue; }
  const solved = solveBoard(initialBoard(level), { maxStates: 100000, maxMilliseconds: 60000 });
  if (solved.status !== 'solved' || solved.route.length > 60) { rejected.solve++; continue; }
  const rating = evaluateLoad(level, { maxSolveStates: 100000, maxWork: 200000, maxMilliseconds: 60000 });
  if (rating.evidence.status !== 'rated') { rejected.planning++; continue; }
  const human = evaluateHumanDifficulty(level, rating.evidence.referenceSolution, rating.evidence.rank!,
    { maxSolveStates: 100000, maxMilliseconds: 60000 });
  if (human.status !== 'rated') { rejected.human++; continue; }
  if (human.score!.total < minimumScore || human.score!.trapPeak < 8) { rejected.score++; continue; }
  const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1,
    origin: { generator, seed, candidateIndex: 0, config }, level, structureKey: structureKey(level),
    solution: solved.route, metrics: contentMetrics(level, solved.route.length) });
  records.push({ content, rating, human });
  save();
  console.log(JSON.stringify({ accepted: records.length, seed, colors, score: human.score!.total,
    rank: rating.evidence.rank, moves: solved.route.length, examined, rejected }));
  await new Promise<void>(done => setImmediate(done));
}
save();
if (records.length < count) throw new Error(`Only ${records.length}/${count} fully rated candidates`);
