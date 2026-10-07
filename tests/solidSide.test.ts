import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeSolidSide } from '../src/game/solidSide.ts';
import { solveBoard } from '../src/game/solver.ts';
import { getSolidPour } from '../src/game/solidRules.ts';
import { createMainline, editMainline, meltSideMainline, moveMainline, nextMainline, selectMainline, selectSideMainline, visibleSession } from '../src/game/mainline.ts';
import { decodeMainline, encodeMainline } from '../src/game/mainlineCodec.ts';
import type { PlayableMainline } from '../src/game/mainlinePlayable.ts';
import { decodePlayableMainline } from '../src/game/mainlinePlayable.ts';

const side = decodeSolidSide(JSON.parse(readFileSync(new URL('../assets/levels/solid-side-50.json', import.meta.url), 'utf8')));
const mainline = decodePlayableMainline(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));

test('all 50 extra puzzles have unique valid structures and independently proven shortest routes in both states', () => {
  assert.equal(side.entries.length, 50);
  assert.deepEqual(side.entries.reduce((counts, entry) => (counts[entry.level.colors.length] = (counts[entry.level.colors.length] ?? 0) + 1, counts), {} as Record<number, number>), { 3: 10, 4: 12, 5: 14, 6: 14 });
  for (const entry of side.entries) {
    assert.equal(entry.afterMainline, entry.number * 20);
    assert.equal(entry.level.bottles.some(bottle => bottle.layers.length === 0), false);
    const board = entry.level.bottles.map(bottle => bottle.layers);
    for (const melted of [false, true]) {
      const result = solveBoard(board, { algorithm: 'astar', capacity: 4,
        solid: { bottle: entry.frozenBottle, depth: 1, melted }, maxStates: 200000, maxMilliseconds: 5000 });
      assert.equal(result.status, 'solved', `side ${entry.number}, melted=${melted}`);
      if (result.status === 'solved') assert.equal(result.route.length, melted ? entry.difficulty.meltedMoves : entry.difficulty.frozenMoves);
    }
  }
});

test('frozen bottom cannot pour, while heating restores ordinary pours', () => {
  const board = [['A', 'A'], ['A'], ['A']];
  assert.equal(getSolidPour(board, 0, 1, 4, { bottle: 0, depth: 1, melted: false })?.amount, 1);
  assert.equal(getSolidPour(board, 0, 1, 4, { bottle: 0, depth: 1, melted: true })?.amount, 2);
  assert.equal(getSolidPour([['A'], ['A']], 0, 1, 4, { bottle: 0, depth: 1, melted: false }), null);
});

test('side level appears after mainline 20, resumes separately and preserves heat through save, undo and reset', () => {
  const source = mainline.entries[0];
  const catalog: PlayableMainline = { id: 'solid-side-test-mainline', entries: Array.from({ length: 21 }, (_, index) => ({
    ...source, number: index + 1, level: { ...source.level, id: `solid-test-main-${index + 1}` },
  })) };
  let state = createMainline(catalog);
  for (let number = 1; number <= 20; number++) {
    for (const move of source.solution) state = moveMainline(state, move.source, move.target)!.state;
    if (number < 20) state = nextMainline(state, catalog, side);
  }
  assert.equal(state.current, 20);
  assert.equal(state.completedThrough, 20);
  state = nextMainline(state, catalog, side);
  assert.equal(state.current, 20);
  assert.equal(visibleSession(state).level.id, side.entries[0].level.id);
  assert.throws(() => nextMainline(state, catalog, side));
  const frozenFirst = side.entries[0].frozenRoute[0];
  state = moveMainline(state, frozenFirst.source, frozenFirst.target)!.state;
  state = meltSideMainline(state);
  assert.equal(state.side!.solid!.melted, true);
  assert.equal(state.side!.solid!.meltAt, 1);
  assert.deepEqual(decodeMainline(encodeMainline(state, catalog, side), catalog, side), state);
  state = editMainline(state, 'undo');
  assert.equal(state.side!.solid!.meltAt, 0);
  assert.deepEqual(decodeMainline(encodeMainline(state, catalog, side), catalog, side), state);
  state = editMainline(state, 'reset');
  assert.equal(state.side!.solid!.melted, false);
  for (const move of side.entries[0].frozenRoute) state = moveMainline(state, move.source, move.target)!.state;
  assert.equal(state.side!.status, 'solved');
  assert.equal(state.sideCompletedThrough, 1);
  const replay = selectMainline(state, catalog, 1);
  assert.equal(visibleSession(replay).level.id, catalog.entries[0].level.id);
  assert.equal(selectMainline(replay, catalog, 20).side!.status, 'solved');
  state = nextMainline(state, catalog, side);
  assert.equal(state.current, 21);
  assert.equal(state.side, null);
  assert.equal(state.completedThrough, 20);
  assert.deepEqual(decodeMainline(encodeMainline(state, catalog, side), catalog, side), state);
  let sideReplay = selectSideMainline(state, side, 1);
  assert.equal(visibleSession(sideReplay).level.id, side.entries[0].level.id);
  sideReplay = meltSideMainline(sideReplay);
  const replayMove = side.entries[0].meltedRoute[0];
  sideReplay = moveMainline(sideReplay, replayMove.source, replayMove.target)!.state;
  assert.deepEqual(decodeMainline(encodeMainline(sideReplay, catalog, side), catalog, side), sideReplay);
  assert.equal(sideReplay.completedThrough, state.completedThrough);
});

test('the original 1000 numbers remain intact and exactly 50 side puzzles appear at twenty-level boundaries', () => {
  const source = mainline.entries[0];
  const catalog: PlayableMainline = { id: 'solid-side-full-cadence', entries: Array.from({ length: 1000 }, (_, index) => ({
    ...source, number: index + 1, level: { ...source.level, id: `solid-cadence-${index + 1}` },
  })) };
  let state = createMainline(catalog);
  for (let number = 1; number <= 1000; number++) {
    assert.equal(state.current, number);
    for (const move of source.solution) state = moveMainline(state, move.source, move.target)!.state;
    assert.equal(state.completedThrough, number);
    if (number % 20 === 0) {
      state = nextMainline(state, catalog, side);
      const extra = side.entries[number / 20 - 1];
      assert.equal(state.side?.level.id, extra.level.id);
      for (const move of extra.frozenRoute) state = moveMainline(state, move.source, move.target)!.state;
      assert.equal(state.sideCompletedThrough, number / 20);
    }
    if (number < 1000) state = nextMainline(state, catalog, side);
  }
  assert.equal(state.current, 1000);
  assert.equal(state.sideCompletedThrough, 50);
  state = nextMainline(state, catalog, side);
  assert.equal(state.side, null);
  assert.equal(nextMainline(state, catalog, side), state);
});
