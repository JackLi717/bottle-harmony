import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeLevel, encodeLevel } from '../src/game/codec.ts';
import { DEMO_BOARD, DEMO_LEVEL } from '../src/game/demo.ts';
import { initialBoard, parseLevel, validateBoard, type LevelDefinition } from '../src/game/model.ts';
import { applyPour, getLegalPours, getPour, isSolved, type Board } from '../src/game/rules.ts';
import { createSession, moveSession, resetSession, undoSession } from '../src/game/session.ts';
import { createSolver, replaySolution, solveBoard, type SolveResult } from '../src/game/solver.ts';

function definition(board: Board, capacity = 4): LevelDefinition {
  return parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'test', capacity,
    colors: [...new Set(board.flat())], bottles: board.map((layers, i) => ({ id: `b-${i}`, layers })) });
}

test('level JSON round-trips actual arrangement, stable IDs and arbitrary logical colors', () => {
  const level = definition([['tea', 'rose'], ['rose', 'tea'], []], 2);
  assert.deepEqual(decodeLevel(encodeLevel(level)), level);
  const board = initialBoard(level);
  assert.deepEqual(board, level.bottles.map(b => b.layers));
  assert.notEqual(board[0], level.bottles[0].layers);
  assert.ok(Object.isFrozen(level.bottles[0].layers));
});

test('decoding rejects malformed, oversized and unsupported content without trusting metadata', () => {
  for (const json of ['{', 'null', '[]', ' '.repeat(32769)]) assert.throws(() => decodeLevel(json));
  const changes = [
    { version: 2 }, { rules: 'fixed-bottles' }, { id: '' }, { seed: 717 },
    { capacity: 0 }, { capacity: 9 }, { capacity: 2.5 },
    { colors: ['jade', 'jade'] }, { colors: ['jade'] }, { colors: ['jade', 'coral', 'missing'] },
    { bottles: [] }, { bottles: Array(17).fill({ id: 'b', layers: [] }) },
    { bottles: [{ id: 'same', layers: DEMO_BOARD[0] }, { id: 'same', layers: DEMO_BOARD[1] }] },
    { bottles: [{ id: 'b', layers: 'jade' }] },
    { bottles: [{ id: 'b', layers: [], fixed: true }, ...DEMO_LEVEL.bottles] },
    { bottles: [{ id: 'b', layers: ['unknown', 'jade', 'jade', 'jade', 'jade'] }, ...DEMO_LEVEL.bottles] },
  ];
  for (const change of changes) assert.throws(() => decodeLevel(JSON.stringify({ ...DEMO_LEVEL, ...change })));
  assert.throws(() => definition([['jade', 'jade'], ['coral'], []], 2));
  assert.ok(validateBoard([[], []], 4).length);
});

test('rules use supplied uniform capacity, conserve colors and reject noninteger indexes or forged amounts', () => {
  const board: Board = [['tea', 'rose', 'rose'], ['tea', 'tea'], ['rose'], []];
  const pour = getPour(board, 0, 2, 3)!;
  assert.equal(pour.amount, 2);
  const next = applyPour(board, pour, 3);
  assert.deepEqual(next, [['tea'], ['tea', 'tea'], ['rose', 'rose', 'rose'], []]);
  assert.equal(getPour(board, 0.5, 1, 3), null);
  assert.equal(getPour(board, 0, 3, NaN), null);
  assert.throws(() => applyPour(board, { ...pour, amount: 1 }, 3));
  assert.equal(isSolved([[], []], 3), false);
  assert.equal(isSolved([['tea', 'tea', 'tea'], ['rose', 'rose', 'rose'], []], 3), true);
});

test('sessions commit before animation, keep frozen history, undo completion and reset freely', () => {
  const original = createSession(definition([['jade', 'jade', 'jade'], ['jade'], []]));
  assert.equal(undoSession(original), original);
  assert.equal(moveSession(original, 0, 0), null);
  const accepted = moveSession(original, 1, 0)!;
  assert.equal(accepted.session.status, 'solved');
  assert.equal(accepted.session.history.length, 1);
  assert.equal(accepted.event.sourceId, 'b-1');
  assert.equal(accepted.event.targetId, 'b-0');
  assert.deepEqual(accepted.event.before, original.board);
  assert.deepEqual(accepted.event.after, accepted.session.board);
  assert.ok(Object.isFrozen(accepted.session.board[0]));
  assert.equal(moveSession(accepted.session, 0, 2), null);
  assert.deepEqual(undoSession(accepted.session), original);
  assert.deepEqual(resetSession(accepted.session), original);
  assert.deepEqual(original.board, [['jade', 'jade', 'jade'], ['jade'], []]);
});

test('stalled sessions preserve the board rather than imposing a failure penalty', () => {
  const current = createSession(definition([['a', 'b'], ['b', 'a']], 2));
  assert.equal(current.status, 'stalled');
  assert.equal(moveSession(current, 0, 1), null);
  assert.deepEqual(resetSession(current), current);
});

test('solver validates, distinguishes exhausted searches from budgets, and releases cancellable tasks', () => {
  assert.equal(solveBoard([[], []]).status, 'invalid');
  assert.equal(solveBoard(DEMO_BOARD, { maxStates: 0 }).status, 'invalid');
  assert.equal(solveBoard(DEMO_BOARD, { maxMilliseconds: Infinity }).status, 'invalid');
  const limited = solveBoard(DEMO_BOARD, { maxStates: 1 });
  assert.ok(limited.status === 'limitReached');
  assert.equal(limited.reason, 'states');
  assert.equal(limited.stats.visitedStates, 1);
  const timeout = solveBoard(DEMO_BOARD, { maxMilliseconds: Number.MIN_VALUE });
  assert.ok(timeout.status === 'limitReached');
  assert.equal(timeout.reason, 'time');
  const task = createSolver(DEMO_BOARD);
  assert.equal(task.step(1), null);
  const cancelled = task.cancel();
  assert.ok(cancelled.status === 'limitReached');
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(task.step(), cancelled);
  assert.throws(() => createSolver(DEMO_BOARD).step(0));
  const exhausted = solveBoard([['b', 'c', 'a', 'b'], ['b', 'c', 'd', 'd'], ['d', 'a', 'd', 'a'], ['c', 'c', 'b', 'a'], []]);
  assert.equal(exhausted.status, 'unsolvable');
  assert.ok(exhausted.stats.expandedStates > 1);
  assert.equal(exhausted.stats.expandedStates, exhausted.stats.visitedStates);
});

test('incremental and synchronous searches yield the same shortest replayable route without mutating input', () => {
  const board: string[][] = DEMO_BOARD.map(b => [...b]);
  const task = createSolver(board);
  board[0][0] = 'changed-after-start';
  let result: SolveResult | null = null;
  let slices = 0;
  while (!result && slices++ < 10000) result = task.step(1, 0.05);
  assert.ok(result?.status === 'solved');
  const synchronous = solveBoard(DEMO_BOARD);
  assert.ok(synchronous.status === 'solved');
  assert.deepEqual(result.route, synchronous.route);
  assert.equal(result.route.length, 7);
  assert.ok(slices > 1);
  assert.ok(isSolved(replaySolution(DEMO_BOARD, result.route)));
  assert.throws(() => replaySolution(DEMO_BOARD, result.route.slice(0, -1)));
  assert.throws(() => replaySolution(DEMO_BOARD, [{ ...result.route[0], color: 'forged' }]));
  const complete = replaySolution(DEMO_BOARD, result.route);
  assert.throws(() => replaySolution(DEMO_BOARD, [...result.route, getLegalPours(complete)[0]]));
  const alreadySolved = solveBoard(complete, { maxStates: 1 });
  assert.ok(alreadySolved.status === 'solved');
  assert.equal(alreadySolved.route.length, 0);
});

test('five-color seven-bottle fixture is validated by a full replay', () => {
  const colors = ['jade', 'coral', 'amber', 'azure', 'violet'];
  const board: Board = [...colors.map((_, i) => Array.from({ length: 4 }, (_, j) => colors[(i + j) % colors.length])), [], []];
  const level = definition(board);
  const result = solveBoard(initialBoard(level), { maxMilliseconds: 2000 });
  assert.ok(result.status === 'solved');
  assert.equal(result.route.length, 16);
  const final = replaySolution(board, result.route);
  for (const color of colors) assert.equal(final.flat().filter(c => c === color).length, 4);
  assert.deepEqual(initialBoard(level), board);
});

/** Independent exhaustive BFS: no symmetry pruning or production predecessor logic. */
function exhaustiveDistance(board: Board): number | null {
  const queue = [{ board, distance: 0 }];
  const seen = new Set([JSON.stringify(board)]);
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (isSolved(item.board, 2)) return item.distance;
    for (const pour of getLegalPours(item.board, 2)) {
      const next = applyPour(item.board, pour, 2), key = JSON.stringify(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ board: next, distance: item.distance + 1 });
    }
  }
  return null;
}

test('symmetry pruning preserves solvability and shortest distance across all 90 balanced three-color arrangements', () => {
  let checked = 0;
  const visit = (prefix: string[], counts: number[]) => {
    if (prefix.length < 6) {
      for (let i = 0; i < 3; i++) if (counts[i] < 2) {
        const next = [...counts]; next[i]++;
        visit([...prefix, ['a', 'b', 'c'][i]], next);
      }
      return;
    }
    const board = [prefix.slice(0, 2), prefix.slice(2, 4), prefix.slice(4, 6), []];
    const expected = exhaustiveDistance(board);
    for (const algorithm of ['bfs', 'astar'] as const) {
      const result = solveBoard(board, { capacity: 2, maxMilliseconds: 2000, algorithm });
      if (expected === null) assert.equal(result.status, 'unsolvable');
      else {
        assert.ok(result.status === 'solved');
        assert.equal(result.route.length, expected);
        replaySolution(board, result.route, 2);
      }
    }
    checked++;
  };
  visit([], [0, 0, 0]);
  assert.equal(checked, 90);
});
