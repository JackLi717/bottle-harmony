import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineSession, evaluateEngineGoal, moveEngineSession, resetEngineSession, undoEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { engineFixture, ENGINE_EXAMPLES } from '../src/game/engineExamples.ts';
import { unlockArtExample, unlockKeyPairsExample } from '../src/game/unlockArtExamples.ts';
import { bottleKeyAnchor, bottleKeyPose, CLASSIC_UNKNOWN_FILL, COVER_FAMILIES, coverFamilyForConditions, coverGroups, coverPose, keyIdentity, pourPresentation, revealOpacity, UNIT_REVEAL_MS, UNLOCK_DURATION_MS } from '../src/art/unlockPresentation.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { FLOW_END, POUR_DURATION_MS } from '../src/art/pourGeometry.ts';
import { VESSELS } from '../src/art/vesselDesigns.ts';
import { liquidFrame } from '../src/art/liquidPresentation.ts';
import { LIQUIDS } from '../src/art/palette.ts';
import { liquidPolygon, type Point } from '../src/art/liquidGeometry.ts';
const visible = (s: ReturnType<typeof createEngineSession>) => visibleEngineState(s.runtime, s.state, s.known, s.seen);

test('keys rest inside every cavity floor and bottom portion, without sliding or following the final poured liquid', () => {
  const inside = (point: Point, polygon: readonly Point[]) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  for (const vessel of VESSELS) {
    const anchor = bottleKeyAnchor(vessel), initial = bottleKeyPose(anchor, false, 0);
    assert.ok(Object.values(anchor).every(Number.isFinite));
    assert.ok(anchor.scale > 0 && anchor.scale <= .9);
    assert.ok(anchor.scale > .66, `${vessel.id}: horizontal key remains legible`);
    // Include the full head/shaft and stroke, rather than checking only the center.
    for (const x of [-6.5, 6.5]) for (const y of [-9.5, 11.5]) {
      const [a,b,c,d,tx,ty] = initial.matrix;
      const corner = { x: tx + a * x + c * y, y: ty + b * x + d * y };
      assert.ok(inside(corner, vessel.interior), `${vessel.id}: key stays in glass cavity`);
      assert.ok(inside(corner, liquidPolygon(1, 0, vessel)), `${vessel.id}: key stays in bottom portion`);
    }
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      assert.deepEqual(bottleKeyPose(anchor, false, p), initial);
      const triggered = bottleKeyPose(anchor, true, p);
      assert.deepEqual(triggered.matrix, initial.matrix, 'Even the final emptying move only fades the fixed key');
      if (p <= FLOW_END) assert.equal(triggered.opacity, 1);
    }
    assert.equal(bottleKeyPose(anchor, true, 1).opacity, 0);
  }
});

test('three material/shape key pairs open only their mapped group; cloth never mislabels a key gate as a color achievement', () => {
  const p = unlockKeyPairsExample();
  let s = createEngineSession(p, 'pairs');
  assert.equal(new Set(p.triggers.map((_, i) => keyIdentity(i).fill)).size, 3);
  assert.equal(new Set(p.triggers.map((_, i) => keyIdentity(i).shape)).size, 3);
  for (let pair = 0; pair < 3; pair++) {
    const source = pair * 2;
    const next = moveEngineSession(s, { type: 'transfer', source: `b${source}`, target: `b${source + 1}` })!;
    assert.deepEqual(next.events.filter(e => e.type === 'unlock').flatMap(e => e.triggers), [p.triggers[pair].id]);
    const open = visible(next.session);
    for (let i = 6; i < 12; i++) assert.equal(open[i].locked, i >= 8 + pair * 2);
    assert.equal(coverFamilyForConditions('cloth', [p.triggers[pair]]), 'wood');
    s = next.session;
  }
  const color = unlockArtExample(1, 'color').triggers;
  assert.equal(coverFamilyForConditions('cloth', color), 'cloth');
  for (const family of ['wood','louver','roller'] as const) assert.equal(coverFamilyForConditions(family, p.triggers), family);
  // Additional pairs keep an explicit identity even after material/shape reuse.
  assert.equal(keyIdentity(3).number, 4); assert.equal(keyIdentity(4).number, 5);
  const route = [[0,1],[2,3],[4,5],[6,0],[7,2],[6,2],[7,0],[8,4],[9,6],[8,6],[9,4],[10,7],[11,8],[10,8],[11,7]];
  const initial = createEngineSession(p, 'full-pair-route');
  const final = replayEngineRoute(initial.runtime, initial, route.map(([source,target]) => ({ type:'transfer', source:`b${source}`, target:`b${target}` })));
  assert.equal(evaluateEngineGoal(initial.runtime, final.state), true);
});

test('every one/two/three-bottle sample opens atomically with either condition; undo keeps contents visible and reset covers again', () => {
  for (const count of [1,2,3] as const) for (const condition of ['key','color'] as const) for (const family of COVER_FAMILIES) {
    const initial = createEngineSession(unlockArtExample(count, condition), 'art');
    assert.ok(initial.runtime.puzzle.colors.every(color => LIQUIDS[color]), 'All sample colors must have renderer materials');
    const before = visible(initial), layout = boardLayout(12);
    const closed = coverGroups(initial.runtime.puzzle, before, null, layout.positions, family);
    assert.equal(closed.length, family === 'cloth' ? count : 1);
    assert.ok(closed.every(g => g.state === 'closed'));
    const result = moveEngineSession(initial, { type: 'transfer', source: 'b0', target: 'b1' })!;
    assert.ok(result); assert.equal(result.events.filter(e => e.type === 'unlock').length, 1);
    const after = visible(result.session);
    const opening = coverGroups(initial.runtime.puzzle, after, before, layout.positions, family);
    assert.equal(opening.length, closed.length); assert.ok(opening.every(g => g.state === 'opening'));
    assert.deepEqual(opening.map(g => g.indices), closed.map(g => g.indices));
    assert.deepEqual(coverGroups(initial.runtime.puzzle, after, null, layout.positions, family), []);
    const undone = undoEngineSession(result.session), relocked = coverGroups(initial.runtime.puzzle, visible(undone), null, layout.positions, family);
    assert.equal(relocked.length, count); assert.ok(relocked.every(g => g.state === 'relocked'));
    for (const i of closed.flatMap(g => g.indices)) {
      assert.equal(visible(undone)[i].locked, true); assert.ok(visible(undone)[i].colors.every(c => c !== null));
    }
    assert.deepEqual(coverGroups(initial.runtime.puzzle, visible(resetEngineSession(undone)), null, layout.positions, family), closed);
  }
});

test('cross-row, nonadjacent, differing conditions and mixed knowledge never become a shared opaque shell', () => {
  const p = engineFixture('split', [['coral'], ['coral','coral','coral'], [], [], [], []], { locked: [2,3,5], triggers: [
    { id: 'a', when: { type: 'empty', container: 'b0' }, unlock: ['b2','b3'] },
    { id: 'b', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b5'] },
  ]});
  const s = createEngineSession(p, 'split'), v = visible(s), positions = boardLayout(6).positions;
  for (const family of COVER_FAMILIES) {
    const groups = coverGroups(p, v, null, positions, family);
    assert.equal(groups.length, 3); assert.deepEqual(groups.map(g => g.indices), [[2],[3],[5]]);
    const mixed = v.map((c,i) => i === 3 ? { ...c, count: 0, colors: [] } : c);
    assert.equal(coverGroups(p, mixed, null, positions, family).find(g => g.indices.includes(3))?.state, 'relocked');
  }
});

test('all 4–12 bottle covers remain within screen slots for every vessel and do not depend on hidden liquid inventory', () => {
  for (let count = 4; count <= 12; count++) {
    const board: string[][] = Array.from({length: count}, () => []); board[0] = ['coral']; board[1] = ['coral','coral','coral'];
    const p = engineFixture('bounds', board, { locked: Array.from({length: count - 2}, (_, i) => i + 2),
      triggers: [{ id: 'key', when: {type: 'empty', container: 'b0'}, unlock: Array.from({length: count - 2}, (_,i) => 'b' + (i + 2)) }] });
    const s = createEngineSession(p, 'bounds'), v = visible(s), layout = boardLayout(count);
    for (const family of COVER_FAMILIES) {
      const groups = coverGroups(p, v, null, layout.positions, family);
      assert.deepEqual(groups.flatMap(g => g.indices), Array.from({length: count - 2}, (_,i) => i + 2));
      for (const g of groups) {
        assert.ok(g.x >= 0 && g.x + g.width <= layout.width + .000001);
        assert.ok(g.height + g.y < layout.positions[g.indices[0]].y + 180);
        assert.ok(g.indices.length <= (family === 'cloth' ? 1 : 3));
        assert.ok(g.indices.every(i => layout.positions[i].y === layout.positions[g.indices[0]].y));
      }
      assert.deepEqual(coverGroups(p, v.map(c => c.count === null ? {...c, colors: [null,null,null]} : c), null, layout.positions, family), groups);
      for (const vessel of VESSELS) assert.ok(Math.max(...vessel.interior.map(p => p.x)) - Math.min(...vessel.interior.map(p => p.x)) <= 64);
    }
  }
});

test('cover and unit disclosure wait for flow end, finish during the existing return, remain finite and monotone', () => {
  assert.ok(UNLOCK_DURATION_MS < (1 - FLOW_END) * POUR_DURATION_MS);
  assert.ok(UNIT_REVEAL_MS < UNLOCK_DURATION_MS);
  assert.notEqual(CLASSIC_UNKNOWN_FILL, '#111820');
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000, pose = coverPose(p, 'opening');
    assert.ok(pose.open >= previous && pose.open <= 1); previous = pose.open;
    assert.ok(Number.isFinite(pose.opacity) && pose.opacity >= 0 && pose.opacity <= 1);
    if (p <= FLOW_END) { assert.equal(pose.open, 0); assert.equal(revealOpacity(p), 1); }
    for (const state of ['closed','relocked'] as const) assert.deepEqual(coverPose(p, state), { open: 0, opacity: 1, latch: 1 });
  }
  assert.equal(coverPose(1,'opening').opacity, 0); assert.equal(revealOpacity(1), 0);
});

test('same-color boundary reveals exactly the stable remaining unit, not deeper unknowns or moved portions', () => {
  const p = engineFixture('boundary-art', [['jade','coral','coral'], [], [], []], { hidden: [[0,0],[0,1]] });
  const before = createEngineSession(p,'boundary');
  const after = moveEngineSession(before, {type:'transfer', source:'b0', target:'b1'})!.session;
  assert.equal(after.state.contents[0].length, 2);
  const frame = pourPresentation(visible(before), visible(after), before.state.contents, after.state.contents, 0, 1, 1);
  assert.deepEqual(frame.containers[0].colors, [null,'coral','coral']);
  assert.deepEqual(frame.revealing[0], [false,true,false]);
  assert.deepEqual(frame.containers[1].colors, ['coral']);
  assert.deepEqual(frame.revealing[1], []);
  const undone = undoEngineSession(after);
  assert.deepEqual(visible(undone)[0].colors, [null,'coral','coral']);
  assert.deepEqual(visible(resetEngineSession(undone))[0].colors, [null,null,'coral']);
  for (const vessel of VESSELS) for (const angle of [0,-70,70]) {
    const layers = liquidFrame(['unit-0','unit-1','unit-2'], 2.5, angle, vessel, true);
    assert.equal(layers.length, 3); assert.ok(layers.every(l => l.path.length > 0));
  }
});

test('ordinary and already seen boards never replay opening on subsequent moves or restoration', () => {
  for (const p of ENGINE_EXAMPLES.slice(3)) {
    const s = createEngineSession(p,'plain'); assert.deepEqual(coverGroups(p, visible(s), null, boardLayout(p.containers.length).positions, 'wood'), []);
  }
  const s = createEngineSession(unlockArtExample(3,'key'),'restore');
  const after = moveEngineSession(s,{type:'transfer',source:'b0',target:'b1'})!.session;
  assert.deepEqual(coverGroups(after.runtime.puzzle,visible(after),null,boardLayout(12).positions,'roller'), []);
});
