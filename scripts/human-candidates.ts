import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { evaluateLoad } from '../src/game/difficultyLoad.ts';
import { evaluateHumanDifficulty, HUMAN_MODEL } from '../src/game/humanDifficulty.ts';
import { contentMetrics, GENERATOR_ID, hasDiverseStart, makeCandidate, parseGeneratedContent, PRODUCTION_COLORS, structureKey } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { decodeMainlineCatalog } from '../src/game/mainlineCatalog.ts';
import { solveBoard } from '../src/game/solver.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';

const input = resolve(process.argv[2] ?? 'assets/levels/mainline-catalog.json');
const output = resolve(process.argv[3] ?? 'builds/human-candidates.json');
const catalog = decodeMainlineCatalog(await readFile(input, 'utf8'));
const seen = new Set(catalog.entries.map(entry => entry.content.structureKey));
const records = [];
const targets = [
  { colors: 5, desired: 60, minimum: 28, maximum: 36, initialSeed: 3000000 },
  { colors: 6, desired: 90, minimum: 34, maximum: 44, initialSeed: 4000000 },
] as const;
for (const target of targets) {
  let accepted = 0;
  for (let seed = target.initialSeed; seed < target.initialSeed + 100000 && accepted < target.desired; seed++) {
    const config = { colors: PRODUCTION_COLORS.slice(0, target.colors), emptyBottles: 1 as const,
      minSolutionMoves: 1, maxSolutionMoves: 60, mixing: 'diverse' as const };
    const level = makeCandidate(seed, 0, config);
    if (!hasCleanStart(level) || !hasDiverseStart(level)) continue;
    const key = structureKey(level);
    if (seen.has(key)) continue;
    const solved = solveBoard(initialBoard(level), { maxStates: 100000, maxMilliseconds: 60000 });
    if (solved.status === 'limitReached' && solved.reason === 'time') throw new Error(`Time budget at seed ${seed}`);
    if (solved.status !== 'solved' || solved.route.length > 60) continue;
    const rating = evaluateLoad(level, { maxSolveStates: 100000, maxWork: 200000, maxMilliseconds: 60000 });
    if (rating.evidence.reason === 'policy-time' || rating.evidence.reason === 'solver-time') throw new Error(`Rating time budget at seed ${seed}`);
    if (rating.evidence.status !== 'rated') continue;
    const human = evaluateHumanDifficulty(level, rating.evidence.referenceSolution, rating.evidence.rank!,
      { maxSolveStates: 100000, maxMilliseconds: 60000 });
    if (human.reason === 'time') throw new Error(`Human score time budget at seed ${seed}`);
    if (human.status !== 'rated' || human.score!.total < target.minimum || human.score!.total > target.maximum) continue;
    const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1,
      origin: { generator: GENERATOR_ID, seed, candidateIndex: 0, config }, level, structureKey: key,
      solution: solved.route, metrics: contentMetrics(level, solved.route.length) });
    records.push({ content, rating, human }); seen.add(key); accepted++;
    if (accepted % 15 === 0) console.log(`candidate ${target.colors} colors ${accepted}/${target.desired} at seed ${seed}`);
  }
  if (accepted !== target.desired) throw new Error(`Only ${accepted}/${target.desired} candidates at ${target.colors} colors`);
}
const result = { format: 'bottle-harmony-human-candidates', version: 1, model: HUMAN_MODEL, records };
await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.${process.pid}.tmp`;
try { await writeFile(temporary, JSON.stringify(result), { flag: 'wx' }); await rename(temporary, output); }
finally { await unlink(temporary).catch(() => {}); }
console.log(`Produced ${records.length} independently solvable, graded candidate records: ${output}`);
