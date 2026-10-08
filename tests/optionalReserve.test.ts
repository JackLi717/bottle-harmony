import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { createProductionPlan } from '../src/game/productionPlan.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { solveBoard, replaySolution } from '../src/game/solver.ts';
import { hasOptionalReserve, oneSpareLevel, OPTIONAL_RESERVE_LEVELS } from '../src/game/optionalReserve.ts';
import { createMainline, editMainline, moveMainline, nextMainline, reserveIsLocked, selectMainline, unlockReserveMainline } from '../src/game/mainline.ts';
import { decodeMainline, encodeMainline } from '../src/game/mainlineCodec.ts';

const catalog = decodePlayableMainline(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));

test('every offered one-spare start is independently solvable and bound to this catalog', () => {
  assert.ok(OPTIONAL_RESERVE_LEVELS.size > 0);
  let twoSpare = 0, solvable = 0, impossible = 0, solvableTeaching = 0;
  for (const entry of catalog.entries) {
    const bottles = entry.level.bottles;
    if (bottles.at(-1)?.layers.length !== 0 || bottles.at(-2)?.layers.length !== 0) {
      assert.equal(hasOptionalReserve(entry), false);
      continue;
    }
    twoSpare++;
    const smaller = parseLevel({ ...entry.level, bottles: bottles.slice(0, -1) });
    const result = solveBoard(initialBoard(smaller), { capacity: 4, maxStates: 100000, maxMilliseconds: 400 });
    if (result.status === 'solved') {
      solvable++;
      if (entry.number <= 3) solvableTeaching++;
      replaySolution(initialBoard(smaller), result.route, 4);
    } else {
      assert.equal(result.status, 'unsolvable', `level ${entry.number} must not be unknown`);
      impossible++;
    }
    const offered = entry.number > 3 && result.status === 'solved';
    assert.equal(hasOptionalReserve(entry), offered, `level ${entry.number}`);
    if (offered) {
      assert.equal(OPTIONAL_RESERVE_LEVELS.get(entry.number), entry.level.id);
      assert.deepEqual(oneSpareLevel(entry), smaller);
      assert.notEqual(createProductionPlan()[entry.number - 1].waveRole, 'recovery');
    }
  }
  assert.equal(twoSpare, solvable + impossible);
  assert.equal(OPTIONAL_RESERVE_LEVELS.size, solvable - solvableTeaching);
});

test('reserve activation preserves accepted moves and undo, survives reset and save, and never carries forward', () => {
  let state = createMainline(catalog);
  for (let number = 1; number <= 3; number++) {
    for (const pour of catalog.entries[number - 1].solution) state = moveMainline(state, pour.source, pour.target)!.state;
    state = nextMainline(state, catalog);
  }
  assert.equal(state.current, 4);
  assert.equal(reserveIsLocked(state, catalog), true);
  const baseLength = state.main.board.length;
  const challenge = solveBoard(state.main.board, { capacity: 4, maxStates: 100000, maxMilliseconds: 400 });
  assert.equal(challenge.status, 'solved');
  if (challenge.status !== 'solved') return;
  const first = challenge.route[0];
  state = moveMainline(state, first.source, first.target)!.state;
  const boardBefore = state.main.board;
  assert.equal(state.main.history.length, 1);
  state = unlockReserveMainline(state, catalog);
  assert.equal(reserveIsLocked(state, catalog), false);
  assert.equal(state.main.board.length, baseLength + 1);
  assert.deepEqual(state.main.board.slice(0, -1), boardBefore);
  assert.deepEqual(state.main.board.at(-1), []);
  assert.equal(state.main.history.length, 1);
  assert.deepEqual(state.main.history[0].at(-1), []);
  assert.deepEqual(decodeMainline(encodeMainline(state, catalog), catalog), state);
  state = editMainline(state, 'undo');
  assert.equal(state.main.history.length, 0);
  assert.equal(state.main.board.length, baseLength + 1);
  state = editMainline(state, 'reset');
  assert.equal(reserveIsLocked(state, catalog), false);

  const replay = selectMainline(state, catalog, 1);
  assert.equal(reserveIsLocked(replay, catalog), false);
  assert.equal(replay.main, state.main);
  assert.equal(selectMainline(replay, catalog, 4).replay, null);

  for (const pour of catalog.entries[3].solution) state = moveMainline(state, pour.source, pour.target)!.state;
  assert.equal(state.main.status, 'solved');
  state = nextMainline(state, catalog);
  assert.equal(state.current, 5);
  assert.equal(reserveIsLocked(state, catalog), hasOptionalReserve(catalog.entries[4]));
  assert.equal(state.main.board.length, catalog.entries[4].level.bottles.length - (hasOptionalReserve(catalog.entries[4]) ? 1 : 0));
  const replayFour = selectMainline(state, catalog, 4);
  assert.equal(reserveIsLocked(replayFour, catalog), true);
  assert.equal(replayFour.main, state.main);

  // Old saves had no reserve flag and represent the original full board.
  const legacy = JSON.parse(encodeMainline(unlockReserveMainline(replayFour, catalog), catalog));
  delete legacy.replay.reserveLocked;
  delete legacy.main.reserveLocked;
  const restoredLegacy = decodeMainline(JSON.stringify(legacy), catalog);
  assert.equal(reserveIsLocked(restoredLegacy, catalog), false);
  assert.equal(restoredLegacy.replay!.board.length, catalog.entries[3].level.bottles.length);
});

test('locked reserve survives restart, and invalid lock flags cannot alter unrelated levels', () => {
  let state = createMainline(catalog);
  for (let number = 1; number <= 3; number++) {
    for (const pour of catalog.entries[number - 1].solution) state = moveMainline(state, pour.source, pour.target)!.state;
    state = nextMainline(state, catalog);
  }
  assert.equal(reserveIsLocked(decodeMainline(encodeMainline(state, catalog), catalog), catalog), true);
  const bad = JSON.parse(encodeMainline(createMainline(catalog), catalog));
  bad.main.reserveLocked = true;
  assert.throws(() => decodeMainline(JSON.stringify(bad), catalog));
});
