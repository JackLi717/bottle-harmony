import assert from 'node:assert/strict';
import test from 'node:test';
import { VESSELS, DEFAULT_VESSEL, vesselCompletionEffect, vesselFor } from '../src/art/vesselDesigns.ts';
import { clipBelow, liquidPolygon, liquidSurface, polygonArea, rotatedInterior } from '../src/art/liquidGeometry.ts';
import { createPourPlan, FLOW_END, FLOW_START, outletPoint, pouringAngle, rotateBottlePoint, sourcePose, bottleBounds } from '../src/art/pourGeometry.ts';
import { boardLayout, bottleHitWidth, fitBoard } from '../src/ui/boardLayout.ts';
import { parseVesselPreference, VESSEL_PREFERENCE_KEY } from '../src/storage/vesselPreference.ts';
import { LANGUAGES, translate } from '../src/i18n/messages.ts';

test('all fifteen glass cavities conserve the same four logical portions under either tilt', () => {
  assert.equal(VESSELS.length, 15);
  assert.equal(new Set(VESSELS.map(item => item.id)).size, 15);
  assert.equal(new Set(VESSELS.map(item => item.shell)).size, 15);
  for (const vessel of VESSELS) {
    assert.ok(vessel.layerArea > 0);
    for (const angle of [-155, -120, -80, -35, 0, 35, 80, 120, 155]) {
      for (const count of [.05, .25, .75, 1, 1.5, 2, 3, 3.75, 4]) {
        const polygon = liquidPolygon(count, angle, vessel);
        assert.ok(polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
        assert.ok(Math.abs(polygonArea(polygon) - count * vessel.layerArea) < .5, `${vessel.id} volume`);
        assert.ok(polygon.every(p => p.y <= vessel.bottomY + .001), `${vessel.id}: no liquid in stem/base`);
      }
    }
    assert.deepEqual(liquidPolygon(0, 80, vessel), []);
    assert.ok(Math.abs(liquidSurface(4, vessel).y - vessel.fillY) < .01);
    let previous = vessel.bottomY;
    for (let n = 1; n <= 4; n++) {
      const surface = liquidSurface(n, vessel);
      assert.ok(surface.y < previous && surface.halfWidth > 0, vessel.id);
      previous = surface.y;
    }
  }
});

test('every vessel pours from its own lip with progressively increasing tilt as it empties', () => {
  for (const vessel of VESSELS) {
    let lastAngle = 180;
    for (const count of [.05, .25, 1, 2, 3, 4]) {
      const angle = pouringAngle(count, vessel);
      assert.ok(angle < lastAngle, vessel.id);
      lastAngle = angle;
      const lip = rotateBottlePoint(outletPoint(1, vessel), angle);
      assert.ok(Math.abs(polygonArea(clipBelow(rotatedInterior(angle, vessel), lip.y)) - count * vessel.layerArea) < 1, vessel.id);
    }
  }
});

test('all fifteen shapes keep six-column touch spacing and continuous mouth alignment on edge pours', () => {
  const layout = boardLayout(12);
  for (const vessel of VESSELS) {
    // Maximum visible width 64; no skin changes board dimensions or shrinks with level size.
    assert.ok(vessel.interior.every(p => p.x >= 18 && p.x <= 82));
    for (const [source, target] of [[layout.positions[0], layout.positions[5]], [layout.positions[11], layout.positions[0]], [layout.positions[3], layout.positions[9]]]) {
      for (const count of [1, 4]) for (const amount of [1, count]) {
        const plan = createPourPlan(source, target, count, amount, -130, 12, layout.width, layout.height, vessel);
        assert.ok(Math.abs(sourcePose(plan, 0).dy + 12) < .000001);
        assert.ok(Math.abs(sourcePose(plan, 1).dy) < .000001);
        for (let frame = 0; frame <= 100; frame++) {
          const p = frame / 100, pose = sourcePose(plan, p), bounds = bottleBounds(pose.angle);
          const top = source.y + pose.dy;
          assert.ok(top + bounds.minY >= plan.minY + 1.99 && top + bounds.maxY <= layout.height - 1.99, vessel.id);
          if (p >= FLOW_START && p <= FLOW_END) {
            assert.ok(Math.abs(pose.outlet.x - (target.x + 50)) < .01, vessel.id);
            assert.ok(target.y + vessel.mouth.y - pose.outlet.y >= 37.99, vessel.id);
          }
        }
        for (const boundary of [.12, .3, FLOW_START, FLOW_END, .76, .92]) {
          const a = sourcePose(plan, boundary - .000001), b = sourcePose(plan, boundary + .000001);
          assert.ok(Math.abs(a.dx - b.dx) < .01 && Math.abs(a.dy - b.dy) < .01 && Math.abs(a.angle - b.angle) < .01, vessel.id);
        }
      }
    }
  }
  const { scale } = fitBoard(layout, { width: 320, height: 290, y: 100 }, 30);
  assert.ok(bottleHitWidth(layout, scale) >= 44);
  assert.ok(bottleHitWidth(layout, scale) < layout.slotWidth * scale);
});

test('wide cups use a halo for cork preference while preserving explicit gold/halo choices', () => {
  for (const vessel of VESSELS) {
    assert.equal(vesselCompletionEffect(vessel, 'gold'), 'gold');
    assert.equal(vesselCompletionEffect(vessel, 'halo'), 'halo');
    assert.equal(vesselCompletionEffect(vessel, 'cork'), vessel.cork ? 'cork' : 'halo');
  }
  for (const id of ['flute', 'tulip', 'martini', 'coupe', 'chalice']) {
    const vessel = vesselFor(id);
    assert.equal(vessel.cork, false);
    assert.ok(vessel.bottomY < 125); // Full liquid bowl remains above the stem.
  }
});

test('style restoration accepts only stable style IDs and remains independent of mainline storage', () => {
  for (const vessel of VESSELS) assert.equal(parseVesselPreference(vessel.id), vessel.id);
  for (const value of [null, undefined, '', 'removed-style', 3, {}, ['royal'], '{"id":"royal"}']) assert.equal(parseVesselPreference(value), DEFAULT_VESSEL.id);
  assert.notEqual(VESSEL_PREFERENCE_KEY, 'bottle-harmony.mainline.v1');
});

test('fifteen style names and accessible choice controls are localized in every supported language', () => {
  for (const language of LANGUAGES) for (const vessel of VESSELS) {
    const name = translate(language.id, vessel.name);
    assert.ok(name.trim().length > 0);
    const choice = translate(language.id, 'styleChoice', { name, n: 15, total: 15 });
    assert.ok(choice.includes(name) && !choice.includes('{'));
    for (const key of ['previousStyle', 'nextStyle', 'swipeStyles'] as const) assert.ok(translate(language.id, key).length);
  }
});
