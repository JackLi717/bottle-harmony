import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMainline, moveMainline, nextMainline, selectMainline, editMainline, visibleSession, type MainlineState } from '../src/game/mainline.ts';
import { decodeMainline, encodeMainline } from '../src/game/mainlineCodec.ts';
import { parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import type { PlayableMainline } from '../src/game/mainlinePlayable.ts';
import { boardLayout, fitBoard } from '../src/ui/boardLayout.ts';
import { makeLayeredCandidate, parseGeneratedContent, PRODUCTION_COLORS, structureKey, contentMetrics } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { decodeContentPool, encodeContentPool } from '../src/game/contentCodec.ts';
import { evaluateLoad, evaluateLoadForTarget } from '../src/game/difficultyLoad.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/production-depth.json', import.meta.url), 'utf8'));
const records = parseProductionRecords(fixture.records);
const catalog: PlayableMainline = { id: 'core-mainline-fixture', entries: records.map((r, i) => ({ number: i + 1, level: r.content.level, solution: r.content.solution,
  rank: r.rating.evidence.rank!, tier: r.rating.evidence.tier!, score: r.rating.score!.total })) };
function complete(state: MainlineState) {
  const entry = catalog.entries.find(e => e.level.id === visibleSession(state).level.id)!;
  for (const pour of entry.solution) state = moveMainline(state, pour.source, pour.target)!.state;
  return state;
}
test('mainline requires completion, unlocks sequentially and stops at its final numbered entry', () => {
  let state = createMainline(catalog);
  assert.throws(() => nextMainline(state, catalog));
  assert.throws(() => selectMainline(state, catalog, 2));
  state = complete(state);
  assert.equal(state.completedThrough, 1);
  const undone = editMainline(state, 'undo');
  assert.equal(undone.completedThrough, 1);
  assert.equal(undone.main.status, 'playing');
  state = nextMainline(state, catalog);
  assert.equal(state.current, 2);
  assert.throws(() => selectMainline(state, catalog, 3));
  state = nextMainline(complete(state), catalog);
  state = complete(state);
  assert.equal(state.current, 3);
  assert.equal(state.completedThrough, 3);
  assert.equal(nextMainline(state, catalog), state);
});
test('replay and mainline retain separate boards, undo histories and serialized restoration', () => {
  let state = nextMainline(complete(createMainline(catalog)), catalog);
  const mainMove = catalog.entries[1].solution[0];
  state = moveMainline(state, mainMove.source, mainMove.target)!.state;
  const main = state.main;
  state = selectMainline(state, catalog, 1);
  const replayMove = catalog.entries[0].solution[0];
  state = moveMainline(state, replayMove.source, replayMove.target)!.state;
  state = Object.freeze({ ...state, tutorialDone: true, symbols: true });
  assert.equal(state.main, main);
  const saved = encodeMainline(state, catalog), restored = decodeMainline(saved, catalog);
  assert.deepEqual(restored, state);
  assert.equal(restored.symbols, true);
  assert.deepEqual(editMainline(restored, 'undo').main, main);
  assert.equal(editMainline(restored, 'undo').replay!.history.length, 0);
  const resumed = selectMainline(restored, catalog, 2);
  assert.deepEqual(resumed.main, main);
  assert.equal(resumed.replay, null);
  const completedReplay = complete(selectMainline(nextMainline(complete(createMainline(catalog)), catalog), catalog, 1));
  assert.equal(completedReplay.completedThrough, 1);
  assert.equal(nextMainline(completedReplay, catalog).current, 2);
});
test('progress refuses a skipped unlock, altered catalog, invalid move and locked replay', () => {
  const saved = JSON.parse(encodeMainline(createMainline(catalog), catalog));
  for (const change of [{ current: 3 }, { completedThrough: 3 }, { catalog: 'other' }, { symbols: 'true' },
    { main: { ...saved.main, moves: [[0, 0]] } }, { replay: { levelId: catalog.entries[1].level.id, moves: [] } }]) {
    assert.throws(() => decodeMainline(JSON.stringify({ ...saved, ...change }), catalog));
  }
});
test('wide boards use two rows with six columns and nonoverlapping 44-point hit areas on a small phone', () => {
  for (const stage of [{ width: 304, height: 264, y: 155 }, { width: 412, height: 440, y: 180 }, { width: 752, height: 780, y: 190 }]) {
    for (let count = 8; count <= 12; count++) {
      const layout = boardLayout(count), { scale, minY } = fitBoard(layout, stage, 35);
      assert.equal(new Set(layout.positions.map(p => p.y)).size, 2);
      assert.ok(layout.positions.filter(p => p.y === 14).length <= 6);
      const hit = Math.max(44, layout.slotWidth * scale);
      for (const p of layout.positions) {
        assert.ok((p.x + 50) * scale - hit / 2 >= -0.01);
        assert.ok((p.x + 50) * scale + hit / 2 <= stage.width + 0.01);
      }
      for (let i = 1; i < layout.positions.length; i++) {
        const p = layout.positions[i], previous = layout.positions[i - 1];
        if (p.y === previous.y) assert.ok((p.x - previous.x) * scale >= hit - 0.01);
      }
      assert.ok(stage.y + (stage.height - layout.height * scale) / 2 + minY * scale >= 34.99);
    }
  }
});
test('all levels keep the same large bottle size and six bottles reach the screen edges', () => {
  const stage = { width: 412, height: 500, y: 200 };
  const baseline = fitBoard(boardLayout(4), stage, 35).scale;
  for (let count = 4; count <= 12; count++) {
    const layout = boardLayout(count), { scale } = fitBoard(layout, stage, 35);
    assert.equal(scale, baseline);
    assert.ok(Math.abs(layout.width * scale - stage.width) < 0.01);
    for (const p of layout.positions) {
      assert.ok((p.x + 18) * scale >= 0);
      assert.ok((p.x + 82) * scale <= stage.width);
    }
  }
  const six = boardLayout(12);
  const first = six.positions[0], last = six.positions[5];
  assert.ok((first.x + 18) * baseline < 2);
  assert.ok(stage.width - (last.x + 82) * baseline < 2);
  // Animation headroom must not reduce the resting bottle size.
  assert.equal(fitBoard(six, { ...stage, y: 0 }, 35).scale, baseline);
});
test('layered proposals preserve color quantities and their distinct deterministic source', () => {
  const content = records[0].content;
  assert.throws(() => parseGeneratedContent({ ...content, origin: { ...content.origin, generator: 'layered-shuffle-v1' } }));
  for (let count = 6; count <= 10; count++) {
    const config = { colors: PRODUCTION_COLORS.slice(0, count), emptyBottles: 2 as const, minSolutionMoves: 1, maxSolutionMoves: 60 };
    const level = makeLayeredCandidate(2, 0, config);
    assert.deepEqual(level, makeLayeredCandidate(2, 0, config));
    for (const color of level.colors) assert.equal(level.bottles.flatMap(b => b.layers).filter(c => c === color).length, 4);
    const solved = solveBoard(initialBoard(level), { maxMilliseconds: 5000, maxStates: 100000 });
    assert.ok(solved.status === 'solved');
    const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1, origin: { generator: 'layered-shuffle-v1', seed: 2, candidateIndex: 0, config },
      level, structureKey: structureKey(level), solution: solved.route, metrics: contentMetrics(level, solved.route.length) });
    assert.equal(content.origin.generator, 'layered-shuffle-v1');
    assert.deepEqual(decodeContentPool(encodeContentPool([content]))[0], content);
  }
});

test('target screening emits no grade for a proven wrong rank and keeps full accepted evidence identical', () => {
  for (const record of records) {
    const rank = record.rating.evidence.rank!;
    assert.deepEqual(evaluateLoadForTarget(record.content.level, rank), evaluateLoad(record.content.level));
    if (rank > 1) assert.equal(evaluateLoadForTarget(record.content.level, 1), 'above-target');
    const unknown = evaluateLoadForTarget(record.content.level, rank, { maxWork: 1 });
    assert.notEqual(unknown, 'above-target');
    if (unknown !== 'above-target') { assert.equal(unknown.evidence.rank, null); assert.equal(unknown.score, null); }
  }
});
