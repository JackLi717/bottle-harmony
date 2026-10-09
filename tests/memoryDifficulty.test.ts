import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { answerAssignments, evaluateMemoryDifficulty, hiddenAssignments, memoryLoad, ratingBoard, type MemoryRating } from '../src/game/memoryDifficulty.ts';
import { canonicalRatingBoard, ratingAnswer, ratingApply, ratingKey, ratingLowerBound, ratingMoves, ratingSolved, searchRatingBoard, type RatingBoard } from '../src/game/memoryRatingSearch.ts';
import { initialUnits, memoryPour, transferUnits, unitColors } from '../src/game/memory.ts';
import { selectMemoryCalibration } from '../scripts/memory-calibration-lib.ts';
import type { MemoryBank } from '../scripts/memory-bank-lib.ts';

const bank = JSON.parse(readFileSync('assets/levels/memory-100.json', 'utf8')) as MemoryBank;
const budget = { maxStates: 300000, maxMilliseconds: 10000 };

test('offline transitions match shared black rules along every stored route and all outgoing choices', () => {
  for (const puzzle of bank.records) {
    const colors = unitColors(puzzle), knowledge = colors.map((_, id) => puzzle.masks.includes(id) ? -1 : 0);
    let units = initialUnits(puzzle), board = ratingBoard(puzzle);
    for (const reference of puzzle.solution) {
      assert.equal(ratingAnswer(board), false, `Early answer ${puzzle.number}`);
      const actual = ratingMoves(board);
      const expected = [];
      for (let source = 0; source < units.length; source++) for (let target = 0; target < units.length; target++) {
        const move = memoryPour(units, colors, knowledge, source, target);
        if (move) expected.push({ source, target, amount: move.amount, code: board[source].at(-1)! });
      }
      assert.deepEqual(actual, expected);
      const move = actual.find(m => m.source === reference.source && m.target === reference.target)!;
      assert.equal(move.amount, reference.amount);
      board = ratingApply(board, move); units = transferUnits(units, reference);
      assert.deepEqual(board, units.map(b => b.map(id => puzzle.level.colors.indexOf(colors[id]) * 2 + (knowledge[id] < 0 ? 1 : 0))));
    }
    assert.ok(ratingSolved(board)); assert.ok(ratingAnswer(board));
  }
});

test('forgotten black labels cannot change public legal choices; visible-to-black bridges remain legal', () => {
  const first = [[0, 3], [2, 1], [], []], swapped = [[0, 1], [2, 3], [], []];
  const publicMoves = (board: RatingBoard) => ratingMoves(board).map(({ source, target, amount }) => ({ source, target, amount }));
  assert.deepEqual(publicMoves(first), publicMoves(swapped));
  const visibleOnBlack = [[0, 0], [3], [], []];
  assert.ok(ratingMoves(visibleOnBlack).some(m => m.source === 0 && m.target === 1 && m.amount === 2));
  assert.equal(ratingAnswer([[0, 0, 0, 3], [2, 2, 2, 1], [], []]), true);
  assert.equal(ratingSolved([[0, 0, 0, 3], [2, 2, 2, 1], [], []]), false);
  assert.deepEqual(ratingMoves([[0, 0, 0, 3], [2, 2, 2, 1], [], []]), []);
});

test('A* bound and automatic-answer stopping agree with an independent exhaustive small graph', () => {
  for (const start of [ratingBoard(bank.records[0]), [[1, 0, 3, 2], [2, 3, 0, 1], [], []]]) {
    const boards: RatingBoard[] = [start], index = new Map([[ratingKey(start), 0]]), predecessors: number[][] = [[]];
    for (let i = 0; i < boards.length; i++) {
      for (const move of ratingMoves(boards[i])) {
        const next = ratingApply(boards[i], move), key = ratingKey(next);
        let target = index.get(key);
        if (target === undefined) { target = boards.length; index.set(key, target); boards.push(next); predecessors.push([]); }
        predecessors[target].push(i);
      }
    }
    assert.ok(boards.length > 100);
    const distances = boards.map(() => Infinity), queue: number[] = [];
    boards.forEach((b, i) => { if (ratingSolved(b)) { distances[i] = 0; queue.push(i); } });
    for (let i = 0; i < queue.length; i++) for (const parent of predecessors[queue[i]]) {
      if (!Number.isFinite(distances[parent])) { distances[parent] = distances[queue[i]] + 1; queue.push(parent); }
    }
    boards.forEach((b, i) => assert.ok(ratingLowerBound(b) <= distances[i], `Nonadmissible lower bound at ${i}`));
    for (let i = 0; i < boards.length; i += Math.max(1, Math.floor(boards.length / 40))) {
      const solved = searchRatingBoard(boards[i], budget);
      if (Number.isFinite(distances[i])) {
        assert.equal(solved.status, 'solved'); assert.equal(solved.route.length, distances[i]);
        if (distances[i] > 0) assert.equal(searchRatingBoard(boards[i], budget, distances[i] - 1).status, 'beyondBound');
      } else assert.equal(solved.status, 'unsolvable');
    }
  }
});

test('deducible color has zero memory load and genuine bridges shorten puzzle 35', () => {
  const teaching = evaluateMemoryDifficulty(bank.records[0], budget);
  assert.equal(teaching.status, 'rated'); assert.equal(teaching.memory!.total, 0);
  assert.equal(hiddenAssignments(ratingBoard(bank.records[1])), 2);
  assert.equal(hiddenAssignments([[1, 1, 1, 1], [3, 3, 3, 3]]), 70);
  assert.equal(answerAssignments([[1, 1, 3, 3], [3, 3, 1, 1]], [[1, 1, 1, 1], [3, 3, 3, 3]]), 2);
  const bridge = evaluateMemoryDifficulty(bank.records[34], budget);
  assert.equal(bridge.status, 'rated'); assert.equal(bridge.bridgeComparison!.savedMoves, 1);
  assert.ok(bridge.memory!.bridgeTransfers > 0);
  assert.ok(bridge.decisions.some(d => d.safeBridges > 0));
  assert.equal(bridge.combined, Math.round(.6 * bridge.memory!.total + .4 * bridge.sorting!.total));
});

test('renaming colors and bottles, reordering masks or lengthening a reference cannot inflate a rating', () => {
  const puzzle = bank.records[12], original = evaluateMemoryDifficulty(puzzle, budget);
  const labels = new Map(puzzle.level.colors.map((c, i) => [c, `renamed${i}`]));
  const reverse = puzzle.level.bottles.map((b, index) => ({ b, index })).reverse();
  const changed = { ...puzzle, masks: puzzle.masks.map(id => {
    const target = reverse.findIndex(b => b.index === Math.floor(id / 4));
    return reverse.slice(0, target).reduce((n, item) => n + item.b.layers.length, 0) + id % 4;
  }).reverse(),
    solution: [...puzzle.solution, ...puzzle.solution], level: { ...puzzle.level,
      colors: [...puzzle.level.colors].reverse().map(c => labels.get(c)!),
      bottles: reverse.map(({ b }, i) => ({ id: `newBottle${i}`, layers: b.layers.map(c => labels.get(c)!) })) } };
  assert.deepEqual(canonicalRatingBoard(ratingBoard(changed)), original.canonicalBoard);
  assert.deepEqual(evaluateMemoryDifficulty(changed, budget), original);
});

test('state budget exhaustion never becomes a high difficulty or impossibility rating', () => {
  const report = evaluateMemoryDifficulty(bank.records[34], { maxStates: 1, maxMilliseconds: 10000 });
  assert.equal(report.status, 'unknown'); assert.equal(report.reason, 'states');
  assert.equal(report.sorting, null); assert.equal(report.combined, null);
  const partial = evaluateMemoryDifficulty(bank.records[34], { maxStates: 600, maxMilliseconds: 10000 });
  assert.equal(partial.status, 'unknown'); assert.equal(partial.shortestMoves, 20);
  assert.equal(partial.memory!.total, 60); assert.ok(partial.decisions.some(d => d.unknown));
  assert.equal(partial.sorting, null); assert.equal(partial.combined, null);
  assert.throws(() => searchRatingBoard([[0]], { maxStates: 0 }), /budget/);
  assert.throws(() => memoryLoad(ratingBoard(bank.records[0]), []), /Incomplete/);
});

test('twenty-puzzle recipe preserves teaching, variation, recovery and rising challenges, excluding unknowns', () => {
  const base = evaluateMemoryDifficulty(bank.records[0], budget);
  const pool: MemoryRating[] = [base, evaluateMemoryDifficulty(bank.records[1], budget), evaluateMemoryDifficulty(bank.records[2], budget)];
  for (let m = 20; m <= 90; m += 3) for (let s = 8; s <= 35; s += 3) {
    const number = pool.length + 1, id = `synthetic-${number}`;
    pool.push({ ...base, number, id, key: id, memory: { ...base.memory!, informationBits: m / 5, total: m, bridgeTransfers: 1 },
      sorting: { choices: s, space: 0, operations: 0, total: s }, combined: Math.round(.6 * m + .4 * s) });
  }
  const unknown: MemoryRating = { ...pool[4], id: 'unknown-perfect', status: 'unknown', key: 'unknown', combined: null };
  const selected = selectMemoryCalibration([...pool, unknown]);
  assert.equal(selected.length, 20); assert.equal(new Set(selected.map(r => r.id)).size, 20);
  assert.deepEqual(selected.slice(0, 3).map(r => r.sourceNumber), [1, 2, 3]);
  assert.ok(!selected.some(r => r.id === unknown.id));
  assert.deepEqual(selectMemoryCalibration([...pool].reverse()), selected);
  assert.equal(selected.filter(r => r.role === 'sorting-variation').length, 3);
  assert.equal(selected.filter(r => r.bridgeFocus).length, 2);
  for (let i = 0; i < selected.length; i++) if (selected[i].role === 'recovery') {
    const challenge = selected.slice(0, i).reverse().find(r => r.role === 'peak' || r.role === 'subpeak')!;
    assert.ok(selected[i].combined <= challenge.combined - 10);
  }
  const challenges = selected.filter(r => r.role === 'peak' || r.role === 'subpeak');
  challenges.slice(1).forEach((r, i) => assert.ok(r.combined >= challenges[i].combined + 4));
  assert.throws(() => selectMemoryCalibration(pool.filter(r => r.number > 3)), /position 1/);
});
