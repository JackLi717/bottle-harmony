import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_BOARD } from '../src/game/demo.ts';
import { applyPour, getPour, isSolved, solveDemo, type Board } from '../src/game/rules.ts';
import { clipBelow, LAYER_AREA, liquidPolygon, polygonArea, rotatedInterior } from '../src/art/liquidGeometry.ts';
import { bottleBounds, createPourPlan, FLOW_END, FLOW_START, outletPoint, pouringAngle, rotateBottlePoint, sourcePose } from '../src/art/pourGeometry.ts';

test('pour moves only a contiguous top run, limited by free capacity', () => {
  const board: Board = [['jade', 'coral', 'coral'], ['jade', 'coral', 'coral'], []];
  const pour = getPour(board, 0, 1)!;
  assert.equal(pour.amount, 1);
  assert.deepEqual(applyPour(board, pour), [['jade', 'coral'], ['jade', 'coral', 'coral', 'coral'], []]);
  assert.equal(getPour(board, 0, 2)?.amount, 2);
  assert.deepEqual(board[0], ['jade', 'coral', 'coral']);
});

test('empty sources, full destinations, different colors and same bottle reject', () => {
  const board: Board = [[], ['jade'], ['coral'], ['jade', 'jade', 'jade', 'jade']];
  for (const [source, target] of [[0, 1], [1, 2], [1, 3], [1, 1], [-1, 2], [1, 9]]) {
    assert.equal(getPour(board, source, target), null);
  }
});

test('the demonstration is solvable and every step conserves both colors', () => {
  const route = solveDemo(DEMO_BOARD);
  assert.ok(route?.length);
  let board = DEMO_BOARD;
  for (const pour of route) {
    board = applyPour(board, pour);
    assert.ok(board.every(bottle => bottle.length <= 4));
    for (const color of ['jade', 'coral']) assert.equal(board.flat().filter(c => c === color).length, 4);
  }
  assert.ok(isSolved(board));
  assert.equal(isSolved([['jade'], ['coral']]), false);
});

test('liquid geometry preserves volume across positive and negative tilts', () => {
  for (const angle of [-145, -110, -74, -45, 0, 45, 74, 110, 145]) {
    for (const layers of [0.25, 1, 2.5, 4]) {
      const polygon = liquidPolygon(layers, angle);
      assert.ok(polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      assert.ok(Math.abs(polygonArea(polygon) - layers * LAYER_AREA) < 0.5);
    }
  }
  assert.deepEqual(liquidPolygon(0, 45), []);
});

test('pouring tilt follows the remaining volume to the lower bottle lip', () => {
  let lastAngle = 180;
  for (const layers of [0.05, 0.25, 1, 2, 3, 4]) {
    const angle = pouringAngle(layers);
    assert.ok(angle < lastAngle);
    lastAngle = angle;
    const lip = rotateBottlePoint(outletPoint(1), angle);
    const area = polygonArea(clipBelow(rotatedInterior(angle), lip.y));
    assert.ok(Math.abs(area - layers * LAYER_AREA) < 1);
  }
});

test('every pairing fits the screen headroom and pours vertically into a stationary recipient', () => {
  const positions = [{ x: 38, y: 14 }, { x: 222, y: 14 }, { x: 38, y: 228 }, { x: 222, y: 228 }];
  for (const source of positions) for (const target of positions) {
    if (source === target) continue;
    for (const count of [1, 2, 3, 4]) for (const amount of [1, count]) {
      const plan = createPourPlan(source, target, count, amount);
      for (let frame = 0; frame <= 200; frame++) {
        const progress = frame / 200;
        const pose = sourcePose(plan, progress);
        const bounds = bottleBounds(pose.angle);
        const left = source.x + pose.dx;
        const top = source.y + pose.dy;
        assert.ok(left + bounds.minX >= 1.99 && left + bounds.maxX <= 358.01);
        assert.ok(top + bounds.minY >= plan.minY + 1.99 && top + bounds.maxY <= 428.01);
        const recipientY = target.y;
        assert.ok(recipientY >= 2 && recipientY + 180 <= 428);
        if (progress >= FLOW_START && progress <= FLOW_END) {
          assert.ok(Math.abs(pose.outlet.x - (target.x + 50)) < 0.01);
          assert.ok(recipientY + 28 - pose.outlet.y >= 37.99);
        }
      }
    }
  }
});

test('selected and unselected bottles enter the pour continuously, including upper-row lift', () => {
  for (const source of [{ x: 38, y: 14 }, { x: 222, y: 228 }]) {
    for (const startLift of [0, 12]) {
      const plan = createPourPlan(source, { x: 222, y: 14 }, 4, 1, -130, startLift);
      const initial = sourcePose(plan, 0);
      assert.equal(initial.dx, 0);
      assert.ok(Math.abs(initial.dy + startLift) < 0.000001);
      assert.equal(initial.angle, 0);
      for (const boundary of [0.12, 0.3, FLOW_START, FLOW_END, 0.76, 0.92]) {
        const before = sourcePose(plan, boundary - 0.000001);
        const after = sourcePose(plan, boundary + 0.000001);
        assert.ok(Math.abs(before.dx - after.dx) < 0.01);
        assert.ok(Math.abs(before.dy - after.dy) < 0.01);
        assert.ok(Math.abs(before.angle - after.angle) < 0.01);
      }
      const final = sourcePose(plan, 1);
      assert.equal(final.dx, 0);
      assert.equal(final.dy, 0);
    }
  }
});
