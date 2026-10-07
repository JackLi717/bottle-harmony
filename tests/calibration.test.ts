import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadCalibrationSamples, referenceHint, TRIAL_TIERS } from '../src/game/calibration.ts';
import { initialBoard } from '../src/game/model.ts';
import { moveSession, createSession, undoSession, resetSession } from '../src/game/session.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { applyPour, getLegalPours } from '../src/game/rules.ts';
import { LIQUIDS } from '../src/art/palette.ts';
import { boardLayout, fitBoard } from '../src/ui/boardLayout.ts';
import { bottleBounds, createPourPlan, FLOW_START, FLOW_END, sourcePose } from '../src/art/pourGeometry.ts';

const json = readFileSync(new URL('../assets/levels/calibration.json', import.meta.url), 'utf8');
const samples = loadCalibrationSamples(json);

test('bundled calibration has two samples per provisional tier, all independently solved and playable', () => {
  for (const tier of TRIAL_TIERS) assert.equal(samples.filter(s => s.tier === tier).length, 2);
  for (const { content } of samples) {
    for (const color of content.level.colors) assert.ok(LIQUIDS[color]);
    const solved = solveBoard(initialBoard(content.level), { capacity: content.level.capacity, maxStates: 100000, maxMilliseconds: 5000 });
    assert.equal(solved.status, 'solved');
    assert.ok(solved.status === 'solved');
    assert.equal(solved.route.length, content.solution.length);
    let session = createSession(content.level);
    for (const pour of content.solution) {
      const moved = moveSession(session, pour.source, pour.target);
      assert.ok(moved);
      assert.deepEqual(moved.event.pour, pour);
      session = moved.session;
    }
    assert.equal(session.status, 'solved');
    const undone = undoSession(session);
    assert.equal(undone.history.length, content.solution.length - 1);
    assert.equal(undone.status, 'playing');
    assert.deepEqual(resetSession(undone).board, initialBoard(content.level));
    assert.equal(resetSession(undone).history.length, 0);
  }
});

test('calibration rejects missing/replaced fixtures and requires diverse starts for D3/D4 only', () => {
  const pool = JSON.parse(json);
  assert.throws(() => loadCalibrationSamples(JSON.stringify({ ...pool, records: pool.records.slice(1) })));
  assert.throws(() => loadCalibrationSamples(JSON.stringify({ ...pool, records: [...pool.records.slice(1), pool.records[1]] })));
  pool.records[4].origin.config.mixing = 'relaxed';
  assert.throws(() => loadCalibrationSamples(JSON.stringify(pool)));
  for (const sample of samples) {
    assert.equal(sample.content.origin.config.mixing, sample.tier === 'D3' || sample.tier === 'D4' ? 'diverse' : 'relaxed');
    if (sample.tier === 'D3' || sample.tier === 'D4') for (const { layers } of sample.content.level.bottles) {
      if (!layers.length) continue;
      assert.ok(new Set(layers).size >= 3);
      for (const color of sample.content.level.colors) assert.ok(layers.filter(c => c === color).length <= 2);
    }
  }
});

test('reference hints follow exact verified states, including undo, and never trust move count', () => {
  for (const { content } of samples) {
    let session = createSession(content.level);
    for (const expected of content.solution) {
      const hint = referenceHint(content, session.board);
      assert.deepEqual(hint, expected);
      session = moveSession(session, hint!.source, hint!.target)!.session;
    }
    assert.equal(referenceHint(content, session.board), null);
    assert.deepEqual(referenceHint(content, undoSession(session).board), content.solution.at(-1));
    const initial = initialBoard(content.level);
    const referenceStates = [initial];
    for (const pour of content.solution) referenceStates.push(applyPour(referenceStates.at(-1)!, pour));
    const other = getLegalPours(initial).map(pour => applyPour(initial, pour)).find(board => !referenceStates.some(state => JSON.stringify(state) === JSON.stringify(board)));
    assert.ok(other);
    assert.equal(referenceHint(content, other), null);
    assert.ok(replaySolution(initial, content.solution));
  }
});

test('multi-bottle pour geometry contains all pairs and aligns streams through twelve bottles', () => {
  for (let count = 4; count <= 12; count++) {
    const layout = boardLayout(count);
    assert.equal(layout.positions.length, count);
    for (const source of layout.positions) for (const target of layout.positions) {
      if (source === target) continue;
      for (let layers = 1; layers <= 4; layers++) for (let amount = 1; amount <= layers; amount++) {
        const plan = createPourPlan(source, target, layers, amount, -130, 12, layout.width, layout.height);
        for (let frame = 0; frame <= 100; frame++) {
          const progress = frame / 100, pose = sourcePose(plan, progress), bounds = bottleBounds(pose.angle);
          const left = source.x + pose.dx, top = source.y + pose.dy;
          assert.ok(left + bounds.minX >= 1.99 && left + bounds.maxX <= layout.width - 1.99);
          assert.ok(top + bounds.minY >= plan.minY + 1.99 && top + bounds.maxY <= layout.height - 1.99);
          if (progress >= FLOW_START && progress <= FLOW_END) {
            assert.ok(Math.abs(pose.outlet.x - (target.x + 50)) < 0.01);
            assert.ok(target.y + 28 - pose.outlet.y >= 37.99);
          }
        }
        assert.ok(Math.abs(sourcePose(plan, 0).dy + 12) < 0.000001);
        assert.ok(Math.abs(sourcePose(plan, 1).dy) < 0.000001);
      }
    }
  }
});

test('small phone and tablet layouts keep touch targets, slots and moving art inside the safe screen', () => {
  for (const stage of [{ width: 276, height: 264, y: 155 }, { width: 331, height: 350, y: 155 }, { width: 680, height: 700, y: 180 }]) {
    const safeTop = 35;
    for (let count = 4; count <= 7; count++) {
      const layout = boardLayout(count);
      const { scale, minY } = fitBoard(layout, stage, safeTop);
      assert.ok(100 * scale >= 44);
      assert.ok(layout.width * scale <= stage.width);
      assert.ok(layout.height * scale <= stage.height);
      assert.ok(stage.y + (stage.height - layout.height * scale) / 2 + minY * scale >= safeTop - 0.01);
      for (let i = 0; i < layout.positions.length; i++) for (let j = i + 1; j < layout.positions.length; j++) {
        const a = layout.positions[i], b = layout.positions[j];
        assert.ok(Math.abs(a.x - b.x) >= 100 || Math.abs(a.y - b.y) >= 180);
      }
    }
  }
  assert.throws(() => boardLayout(13));
});
