import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { makeCandidate, PRODUCTION_COLORS, structureKey, type GenerationConfig } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { compileSortingPuzzle, initialEngineState } from '../src/game/engine.ts';
import { classicFrameReference } from './lib/unlockClassicReference.ts';
import { acceptProgressiveReveal, completeRevealHints, REVEAL_BUDGET } from './lib/progressiveRevealAcceptance.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';

const args = process.argv.slice(2), command = args.shift() ?? 'generate';
assert.ok(['generate', 'verify'].includes(command));
for (let i = 0; i < args.length; i += 2) assert.ok(['--out', '--limit'].includes(args[i]) && args[i + 1]);
const option = (key: string, fallback: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(option('--out', 'builds/progressive-reveal-four')), root = resolve('builds'), rel = relative(root, out);
assert.ok(rel && rel !== '..' && !rel.startsWith(`..${sep}`));
const limit = Number(option('--limit', '100')); assert.ok(Number.isSafeInteger(limit) && limit > 0 && limit <= 1000);
mkdirSync(out, { recursive: true });
const config: GenerationConfig = { colors: PRODUCTION_COLORS.slice(0, 3), emptyBottles: 2, minSolutionMoves: 1, maxSolutionMoves: 100, mixing: 'diverse' };
const masks: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 1], [1, 2], [2, 1], [2, 2]], [[0, 0], [0, 1], [1, 1], [2, 0], [2, 2]],
];
function evaluate(index: number, number: number) {
  const origin = { generator: 'balanced-shuffle-v1', seed: 51000000, candidateIndex: index, config }, classic = makeCandidate(origin.seed, index, config);
  if (!hasCleanStart(classic)) return null;
  const solved = solveBoard(initialBoard(classic), { maxStates: 100000, maxMilliseconds: 30000 });
  if (solved.status !== 'solved') return null;
  replaySolution(initialBoard(classic), solved.route, 4);
  const mask = masks[number - 1], puzzle = engineFixture(`progressive-v1-${index}-${number}`, initialBoard(classic), { hidden: mask });
  if (new Set(puzzle.units.filter(u => puzzle.hidden.includes(u.id)).map(u => u.color)).size < 2) return null;
  const accepted = acceptProgressiveReveal(puzzle);
  console.log(`candidate ${index}, mask ${number}: ${accepted.status} ${accepted.reason}`);
  if (accepted.status !== 'pass') return null;
  const { policy, ...acceptance } = accepted;
  const { table, closureStates, stats } = completeRevealHints(policy);
  const base = compileSortingPuzzle({ ...puzzle, hidden: [] }), reference = classicFrameReference(base, initialEngineState(base));
  return { number, origin, mask, classic, classicSolution: solved.route, classicStructureKey: structureKey(classic), puzzle,
    acceptance, hints: table, hintClosure: { states: closureStates, evidenceSha256: sha256(table), stats },
    classicReference: { status: reference.status, score: reference.human?.score?.total ?? null, model: reference.model },
    difficulty: { status: 'not-rated', reason: 'independent-reveal-form-validation-no-grade-target' } };
}
type Record = NonNullable<ReturnType<typeof evaluate>>;
const file = `${out}/records.json`, records: Record[] = [];
if (command === 'generate') {
  for (let index = 0; index < limit && records.length < 4; index++) {
    const record = evaluate(index, records.length + 1);
    if (record && !records.some(r => r.classicStructureKey === record.classicStructureKey)) {
      records.push(record); console.log(`accepted ${records.length}/4, ${record.acceptance.worlds} worlds, ${record.hintClosure.states} closure states`);
    }
    writeFileSync(file, JSON.stringify(records) + '\n');
  }
} else {
  const saved: Record[] = JSON.parse(readFileSync(file, 'utf8'));
  for (const record of saved) { const fresh = evaluate(record.origin.candidateIndex, record.number); assert.deepEqual(JSON.parse(JSON.stringify(fresh)), record); records.push(fresh!); }
}
assert.equal(records.length, 4, `Incomplete ${records.length}/4; no playable export`);
assert.equal(new Set(records.map(r => r.classicStructureKey)).size, 4);
const entries = records.map(r => ({ number: r.number, puzzle: r.puzzle, acceptance: r.acceptance, hints: r.hints,
  origin: r.origin, mask: r.mask, classicSolution: r.classicSolution,
  sourceSha256: sha256({ origin: r.origin, classic: r.classic, mask: r.mask }), classicStructureKey: r.classicStructureKey,
  hintClosure: r.hintClosure, classicReference: r.classicReference, difficulty: r.difficulty }));
const payload = { format: 'bottle-harmony-internal-progressive-bank', version: 1, method: 'classic-progressive-reveal-four-v1', budget: REVEAL_BUDGET, entries };
const bank = { ...payload, evidenceSha256: sha256(payload) };
writeFileSync(`${out}/play.json`, JSON.stringify(bank) + '\n');
writeFileSync(`${out}/verification.json`, JSON.stringify({ status: 'pass', mode: command === 'verify' ? 'fresh-source-full-proof-and-hint-closure' : 'generation-proof', bankEvidenceSha256: bank.evidenceSha256,
  checks: records.map(r => ({ number: r.number, worlds: r.acceptance.worlds, certificate: r.acceptance.certificatesSha256, hintClosure: r.hintClosure })) }) + '\n');
writeFileSync(`${out}/report.md`, '# 逐层显色独立四题\n\n完整经典底题加下层遮色，所有库存相容世界使用公开观察策略，无钥匙、无难度档位门槛，正式题库不动。\n\n| 题 | 未知份 | 隐藏世界 | 实际策略步数 | 提示闭包局面 | 经典底题原分 |\n| --- | --- | --- | --- | --- | --- |\n'
  + records.map(r => `| ${r.number} | ${r.puzzle.hidden.length} | ${r.acceptance.worlds} | ${r.acceptance.route.length} | ${r.hintClosure.states} | ${r.classicReference.score ?? r.classicReference.status} |`).join('\n') + '\n');
console.log(`Verified four puzzles: ${out}`);
