import assert from 'node:assert/strict';
import test from 'node:test';
import { getLegalPours, type Board } from '../src/game/rules.ts';
import { createSession, moveSession, resetSession, undoSession } from '../src/game/session.ts';
import { parseLevel } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { advanceStalledNotice, closeStalledNotice, INITIAL_STALLED_NOTICE, showUnsolvableNotice, type NoticeInput } from '../src/ui/stalledNoticePolicy.ts';

const stuck: Board = [['a', 'b'], ['b', 'a']];
const input: NoticeInput = { scope: 'mainline:test', board: stuck, status: 'stalled', entered: true, eligible: true };

test('stalled feedback waits for animation, loading or tutorial to settle and shows only once', () => {
  const waiting = advanceStalledNotice(INITIAL_STALLED_NOTICE, { ...input, eligible: false });
  assert.equal(waiting.reason, null);
  const shown = advanceStalledNotice(waiting, input);
  assert.equal(shown.reason, 'noMoves');
  assert.equal(advanceStalledNotice(shown, { ...input }), shown);
  const dismissed = closeStalledNotice(shown);
  assert.equal(advanceStalledNotice(dismissed, { ...input, eligible: false }).reason, null);
  assert.equal(advanceStalledNotice(dismissed, input).reason, null);
});
test('undo can continue through several stalled boards without repeated popups, then re-arms after play resumes', () => {
  const recovered = closeStalledNotice(advanceStalledNotice(INITIAL_STALLED_NOTICE, input), true);
  const stillStalled = advanceStalledNotice(recovered, { ...input, board: stuck.map(b => [...b]) });
  assert.equal(stillStalled.reason, null);
  const resumed = advanceStalledNotice(stillStalled, { ...input, board: [...stuck, []], status: 'playing' });
  assert.equal(resumed.reason, null);
  assert.equal(advanceStalledNotice(resumed, input).reason, 'noMoves');
});
test('home never shows recovery feedback; re-entry and separate replay or preview sessions each receive their own notice', () => {
  const shown = advanceStalledNotice(INITIAL_STALLED_NOTICE, input);
  const home = advanceStalledNotice(shown, { ...input, entered: false });
  assert.equal(home.reason, null);
  assert.equal(advanceStalledNotice(home, input).reason, 'noMoves');
  const closed = closeStalledNotice(shown);
  assert.equal(advanceStalledNotice(closed, { ...input, scope: 'replay:test' }).reason, 'noMoves');
  assert.equal(advanceStalledNotice(closed, { ...input, scope: 'preview:test' }).reason, 'noMoves');
});
test('completion wins over recovery feedback, including completion after a hint search', () => {
  const shown = advanceStalledNotice(INITIAL_STALLED_NOTICE, input);
  const solved = advanceStalledNotice(shown, { ...input, status: 'solved' });
  assert.equal(solved.reason, null);
  assert.equal(showUnsolvableNotice(solved), solved);
});
test('no empty bottle is not failure, and a budget-limited hint is not proof of an unsolvable board', () => {
  const board: Board = [['a', 'b'], ['b'], ['a']];
  assert.ok(board.every(b => b.length > 0));
  assert.ok(getLegalPours(board, 2).length);
  const playing = advanceStalledNotice(INITIAL_STALLED_NOTICE, { ...input, board, status: 'playing' });
  assert.equal(playing.reason, null);
  assert.equal(solveBoard(board, { capacity: 2, maxStates: 1 }).status, 'limitReached');
  assert.equal(playing.reason, null);
});
test('legal but exhaustively unsolvable boards get a distinct requested explanation, never an automatic no-moves notice', () => {
  const board: Board = [['b', 'c', 'a', 'b'], ['b', 'c', 'd', 'd'], ['d', 'a', 'd', 'a'], ['c', 'c', 'b', 'a'], []];
  assert.ok(getLegalPours(board).length);
  assert.equal(solveBoard(board, { maxMilliseconds: 2000 }).status, 'unsolvable');
  const playing = advanceStalledNotice(INITIAL_STALLED_NOTICE, { ...input, board, status: 'playing' });
  assert.equal(playing.reason, null);
  const requested = showUnsolvableNotice(playing);
  assert.equal(requested.reason, 'unsolvable');
  assert.equal(closeStalledNotice(requested).reason, null);
  assert.equal(advanceStalledNotice(requested, { ...input, board: [...board], status: 'playing' }).reason, null);
});
test('notice actions leave recovery, liquid conservation and session history to existing game rules', () => {
  const initial = createSession(parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'test', capacity: 2,
    colors: ['a','b'], bottles: [...stuck, []].map((layers, i) => ({ id: `b${i}`, layers })) }));
  const moved = moveSession(initial, 0, 2)!.session;
  const shown = advanceStalledNotice(INITIAL_STALLED_NOTICE, input);
  closeStalledNotice(shown, true);
  assert.deepEqual(undoSession(moved), initial);
  assert.deepEqual(resetSession(moved), initial);
  assert.equal(moved.history.length, 1);
  assert.equal(createSession(parseLevel({ ...initial.level, bottles: initial.level.bottles.slice(0, 2) })).history.length, 0);
});
