import assert from 'node:assert/strict';
import test from 'node:test';
import type { ColorId } from '../src/game/rules.ts';
import { completionSymbolOpacity, completionVisible, COMPLETION_DURATION, SYMBOL_FADE_DURATION } from '../src/art/bottleCompletion.ts';
import { liquidFrame } from '../src/art/liquidPresentation.ts';
import { liquidPath, liquidPolygon, type Point } from '../src/art/liquidGeometry.ts';
import { createPourPlan, FLOW_END, FLOW_START, rotateBottlePoint, sourcePose, transferredFraction } from '../src/art/pourGeometry.ts';
import { VESSELS } from '../src/art/vesselDesigns.ts';

const mixed: readonly ColorId[] = ['jade', 'coral', 'amber', 'azure'];

function inside(point: Point, polygon: readonly Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

test('shared liquid frames preserve existing paths and merged same-color rendering with symbols on/off', () => {
  for (const vessel of VESSELS) for (const colors of [mixed, ['jade', 'jade', 'coral', 'coral'] as const]) {
    for (const angle of [-120, -55, 0, 55, 120]) for (const count of [0, .2, 1, 2.5, 4]) {
      for (const symbols of [false, true]) {
        const frame = liquidFrame(colors, count, angle, vessel, symbols);
        frame.forEach((layer, i) => assert.equal(layer.path, colors[i + 1] === colors[i] ? '' : liquidPath(Math.min(i + 1, count), angle, vessel)));
        if (!symbols) assert.ok(frame.every(layer => layer.symbol.opacity === 0));
      }
    }
  }
});

test('symbol bounds remain in their own liquid portion through both tilts of all fifteen cavities', () => {
  for (const vessel of VESSELS) for (const angle of [-155, -120, -80, -35, 0, 35, 80, 120, 155]) {
    for (const count of [.05, .25, .75, 1, 1.5, 2, 3, 3.75, 4]) {
      liquidFrame(mixed, count, angle, vessel, true).forEach(({ symbol }, layer) => {
        assert.ok(Object.values(symbol).every(Number.isFinite));
        assert.equal(symbol.rotation + angle, 0);
        if (count <= layer) { assert.equal(symbol.opacity, 0); return; }
        assert.ok(symbol.opacity > 0 && symbol.opacity <= 1, `${vessel.id}: visible symbol`);
        assert.ok(symbol.size > 0 && symbol.size <= 16);
        const upper = liquidPolygon(Math.min(layer + 1, count), angle, vessel);
        const lower = liquidPolygon(layer, angle, vessel);
        const center = rotateBottlePoint(symbol, angle);
        // The upright glyph's em square fits, not just its anchor; no spill into another color or a stem.
        for (const dx of [-.5, .5]) for (const dy of [-.5, .5]) {
          const corner = rotateBottlePoint({ x: center.x + dx * symbol.size, y: center.y + dy * symbol.size }, -angle);
          assert.ok(inside(corner, upper), `${vessel.id}: ${angle}° / ${count} / ${layer} upper`);
          assert.ok(!inside(corner, lower), `${vessel.id}: ${angle}° / ${count} / ${layer} lower`);
        }
      });
    }
  }
});

test('source and receiver symbols follow continuous multi-portion transfer instead of disappearing for the pour', () => {
  for (const vessel of VESSELS) {
    const plan = createPourPlan({ x: 0, y: 0 }, { x: 220, y: 0 }, 4, 2, -130, 12, 360, 430, vessel);
    for (let step = 0; step <= 50; step++) {
      const progress = step / 50, transferred = transferredFraction(progress) * 2;
      const source = liquidFrame(['jade', 'coral', 'amber', 'amber'], 4 - transferred, sourcePose(plan, progress).angle, vessel, true);
      const receiver = liquidFrame(['amber', 'amber', 'amber', 'amber'], 2 + transferred, 0, vessel, true);
      assert.ok(source[0].symbol.opacity > 0 && source[1].symbol.opacity > 0);
      assert.ok(receiver[0].symbol.opacity > 0 && receiver[1].symbol.opacity > 0);
      if (progress <= FLOW_START) assert.equal(receiver[2].symbol.opacity, 0);
      if (progress >= FLOW_END) {
        assert.equal(source[2].symbol.opacity, 0);
        assert.equal(source[3].symbol.opacity, 0);
        assert.ok(receiver.every(layer => layer.symbol.opacity === 1));
      }
    }
    const full = liquidFrame(mixed, 4, 0, vessel, true)[3].symbol;
    const thin = liquidFrame(mixed, 3.05, 0, vessel, true)[3].symbol;
    assert.ok(thin.size < full.size && thin.opacity < full.opacity);
  }
});

test('symbols fade only after visible same-color completion and return on undo or pouring out', () => {
  for (const count of [0, 1, 3, 3.99]) assert.equal(completionSymbolOpacity(completionVisible(true, count), 1, true), 1);
  assert.equal(completionSymbolOpacity(completionVisible(false, 4), 1, true), 1); // Full mixed cup.
  assert.equal(completionSymbolOpacity(true, 0, true), 1);
  assert.equal(completionSymbolOpacity(true, SYMBOL_FADE_DURATION / COMPLETION_DURATION / 2, true), .5);
  assert.equal(completionSymbolOpacity(true, SYMBOL_FADE_DURATION / COMPLETION_DURATION, true), 0);
  assert.equal(completionSymbolOpacity(true, 1, true), 0); // Restore, background/cancellation, unrelated pours.
  assert.equal(completionSymbolOpacity(true, 0, false), 0); // Reduced motion.
  assert.equal(completionSymbolOpacity(false, 1, true), 1); // Undo/reset or source no longer full.
  assert.equal(completionSymbolOpacity(false, 1, false), 1);
});
