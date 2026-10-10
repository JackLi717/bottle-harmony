import assert from 'node:assert/strict';
import test from 'node:test';
import { VESSELS, vesselAtCapacity } from '../src/art/vesselDesigns.ts';
import { liquidPolygon, polygonArea } from '../src/art/liquidGeometry.ts';
import { liquidFrame } from '../src/art/liquidPresentation.ts';
import { createPourPlan, FLOW_START, FLOW_END, sourcePose } from '../src/art/pourGeometry.ts';
import { completionVisible } from '../src/art/bottleCompletion.ts';

test('all fifteen original four-portion geometries are unchanged and variable capacity preserves fill fraction at every tilt', () => {
  for (const vessel of VESSELS) {
    assert.equal(vesselAtCapacity(vessel, 4), vessel);
    for (const capacity of [5, 6, 12]) {
      const design = vesselAtCapacity(vessel, capacity);
      assert.ok(Math.abs(design.layerArea * capacity - vessel.layerArea * 4) < 1e-9);
      for (const angle of [-110, -45, 0, 45, 110]) for (const count of [1, capacity / 2, capacity]) {
        const area = polygonArea(liquidPolygon(count, angle, design));
        assert.ok(Math.abs(area - count * design.layerArea) < .6, `${vessel.id}/${capacity}/${angle}/${count}`);
      }
      const layers = Array.from({ length: capacity }, (_, i) => ['coral', 'jade'][i % 2]);
      const frame = liquidFrame(layers, capacity, 0, design, true);
      assert.equal(frame.length, capacity); assert.ok(frame.every(layer => layer.path.length > 0 && Number.isFinite(layer.symbol.y)));
      assert.equal(completionVisible(true, capacity - 1, capacity), false); assert.equal(completionVisible(true, capacity, capacity), true);
    }
  }
});

test('different source/receiver capacities keep the same lip alignment during flow', () => {
  for (const vessel of VESSELS) for (const capacity of [5, 6, 12]) {
    const source = vesselAtCapacity(vessel, capacity), receiver = vesselAtCapacity(vessel, 12);
    const plan = createPourPlan({ x: 25, y: 210 }, { x: 250, y: 14 }, capacity, Math.min(4, capacity), -70, 12, 400, 400, source, receiver);
    for (const frame of [FLOW_START, (FLOW_START + FLOW_END) / 2, FLOW_END]) {
      const pose = sourcePose(plan, frame);
      assert.ok(Math.abs(pose.outlet.x - 300) < .01); assert.ok(Number.isFinite(pose.angle));
    }
  }
});
