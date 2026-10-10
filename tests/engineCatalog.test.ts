import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { classicSortingPuzzle } from '../src/game/engineModel.ts';
import { compileSortingPuzzle, initialEngineState, evaluateEngineGoal, listEngineActions, transitionEngine } from '../src/game/engine.ts';
import { createSession, moveSession, undoSession, resetSession } from '../src/game/session.ts';
import type { Board } from '../src/game/rules.ts';
import { TestDatabase } from './helpers/sqlite.ts';
import { oracleApply, oracleMoves, oraclePour, oracleSolved } from './helpers/classicOracle.ts';

test('all 1000 installed classic routes match the independent pre-upgrade oracle step by step', () => {
  const db = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(db);
  let moves = 0, alternatives = 0;
  for (const entry of content.mainline.entries) {
    const runtime = compileSortingPuzzle(classicSortingPuzzle(entry.level));
    let frame = initialEngineState(runtime), board: Board = entry.level.bottles.map(b => b.layers);
    for (const [index, recorded] of entry.solution.entries()) {
      const expected = oraclePour(board, recorded.source, recorded.target, entry.level.capacity);
      assert.ok(expected, `${entry.number}/${index}`); assert.deepEqual(expected, recorded);
      if (index === 0 || index === Math.floor(entry.solution.length / 2)) {
        const oldActions = oracleMoves(board, entry.level.capacity), newActions = listEngineActions(runtime, frame.state, frame.known);
        assert.deepEqual(newActions, oldActions.map(p => ({ type: 'transfer', source: entry.level.bottles[p.source].id, target: entry.level.bottles[p.target].id })));
        alternatives += newActions.length;
      }
      const next = transitionEngine(runtime, frame.state, frame.known, { type: 'transfer', source: entry.level.bottles[recorded.source].id, target: entry.level.bottles[recorded.target].id });
      assert.ok(next.accepted); frame = next; board = oracleApply(board, expected);
      assert.deepEqual(frame.state.contents.map(units => units.map(u => runtime.unitColors.get(u)!)), board);
      assert.equal(evaluateEngineGoal(runtime, frame.state), oracleSolved(board, entry.level.capacity)); moves++;
    }
    assert.equal(evaluateEngineGoal(runtime, frame.state), true, `Level ${entry.number}`);
  }
  assert.ok(moves > 10000); assert.ok(alternatives > 10000); db.native.close();
});

test('all 50 frozen/melted routes use the upgraded session with identical results, undo and reset semantics', () => {
  const db = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(db);
  for (const entry of content.sides.entries) for (const melted of [false, true]) {
    const initial = createSession(entry.level, { bottle: entry.frozenBottle, depth: 1, melted, meltAt: melted ? 0 : null });
    let current = initial, board = initial.board;
    for (const recorded of melted ? entry.meltedRoute : entry.frozenRoute) {
      const floor = !melted && recorded.source === entry.frozenBottle ? 1 : 0;
      const expected = oraclePour(board, recorded.source, recorded.target, entry.level.capacity, floor);
      assert.ok(expected); assert.deepEqual(expected, recorded);
      const result = moveSession(current, recorded.source, recorded.target); assert.ok(result);
      assert.deepEqual(result.event.pour, expected); current = result.session; board = oracleApply(board, expected); assert.deepEqual(current.board, board);
    }
    assert.equal(current.status, 'solved'); assert.equal(oracleSolved(board, entry.level.capacity), true);
    assert.equal(undoSession(current).status, 'playing'); assert.deepEqual(resetSession(current).board, initial.board);
    assert.equal(resetSession(current).solid?.melted, false);
  }
  db.native.close();
});
