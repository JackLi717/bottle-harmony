import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateHumanDifficulty } from '../src/game/humanDifficulty.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';

const calibration = JSON.parse(readFileSync(new URL('../assets/levels/calibration.json', import.meta.url), 'utf8')).records;
function shortest(level: ReturnType<typeof parseLevel>) {
  const result = solveBoard(initialBoard(level), { maxStates: 100000, maxMilliseconds: 60000 });
  assert.equal(result.status, 'solved');
  if (result.status !== 'solved') throw new Error('Missing route');
  return result.route;
}

test('equal-length C06 and C07 receive distinct decision-risk scores', () => {
  const easy = parseLevel(calibration[5].level), hard = parseLevel(calibration[6].level);
  const a = shortest(easy), b = shortest(hard);
  assert.equal(a.length, b.length);
  const easyReport = evaluateHumanDifficulty(easy, a, 1);
  const hardReport = evaluateHumanDifficulty(hard, b, 5);
  assert.equal(easyReport.status, 'rated'); assert.equal(hardReport.status, 'rated');
  assert.ok(hardReport.score!.trapPeak > easyReport.score!.trapPeak);
  assert.ok(hardReport.score!.total > easyReport.score!.total);
});

test('score is unchanged by bottle permutation and logical color names', () => {
  const level = parseLevel(calibration[6].level), route = shortest(level);
  const renamed = parseLevel({ ...level, id: 'renamed-human-calibration', colors: level.colors.map((_, i) => `c${i}`),
    bottles: [...level.bottles].reverse().map(bottle => ({ ...bottle,
      layers: bottle.layers.map(color => `c${level.colors.indexOf(color)}`) })) });
  const first = evaluateHumanDifficulty(level, route, 5);
  const second = evaluateHumanDifficulty(renamed, shortest(renamed), 5);
  assert.deepEqual(second, first);
});

test('incomplete alternative search never becomes a high score', () => {
  const level = parseLevel(calibration[6].level);
  const report = evaluateHumanDifficulty(level, shortest(level), 5, { maxSolveStates: 1 });
  assert.equal(report.status, 'unknown');
  assert.equal(report.score, null);
});
