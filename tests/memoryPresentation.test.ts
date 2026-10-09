import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemory, hiddenMemory, moveMemory, peekMemory, readyMemory, resetMemory, restoreMemory, undoMemory } from '../src/game/memory.ts';
import { memoryDisplay, newlyRevealedMemory } from '../src/ui/memoryPresentation.ts';
import { MEMORY_REVEAL_MS, memoryLayerGeometry, memoryMarkPaint, memoryRevealCover, memoryRevealPath, memoryRevealPose } from '../src/art/memoryPresentation.ts';
import { liquidFrame } from '../src/art/liquidPresentation.ts';
import { LIQUIDS } from '../src/art/palette.ts';
import { createPourPlan, sourcePose } from '../src/art/pourGeometry.ts';
import { liquidSurface, polygonArea } from '../src/art/liquidGeometry.ts';
import { VESSELS } from '../src/art/vesselDesigns.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const source = new TestDatabase('assets/levels/content.sqlite');
const content = new ContentRepository(source);

test('two adaptive memory inks contrast with all eleven liquid gradients', () => {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(i => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a: string, b: string) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  };
  const inks = new Set<string>();
  assert.equal(Object.keys(LIQUIDS).length, 11);
  for (const [color, liquid] of Object.entries(LIQUIDS)) {
    const paint = memoryMarkPaint(color);
    inks.add(paint.ink);
    for (const background of [liquid.main, liquid.dark]) {
      assert.ok(contrast(paint.ink, background) >= 3, `${color}: ink must contrast throughout the liquid body`);
    }
    assert.ok(contrast(paint.ink, paint.backing) >= 10, `${color}: dashed ink stays distinct from its backing`);
  }
  assert.equal(inks.size, 2);
});

test('hidden units stay black throughout source movement, receiver flow and the whole return', () => {
  let state = readyMemory(createMemory(content.memoryPuzzle(2)));
  const route = state.puzzle.solution;
  for (const step of route) {
    const before = state, accepted = moveMemory(before, step.source, step.target)!;
    state = accepted.session;
    assert.equal(newlyRevealedMemory(before, state).length, step === route.at(-1) ? state.puzzle.masks.length : 0);
    const frame = memoryDisplay(state, { before, pour: accepted.event.pour });
    assert.deepEqual(frame.hidden, hiddenMemory(before, frame.units));
    assert.deepEqual(frame.units[step.target], [...before.units[step.target], ...before.units[step.source].slice(-accepted.event.pour.amount)]);
    if (state.judgement === 'hidden') assert.ok(frame.reveals.flat().every(v => !v));
    else assert.ok(frame.reveals.flat().some(Boolean), 'reveal art is prepared while the real colors stay hidden during the return');
  }
  assert.equal(hiddenMemory(state).flat().filter(Boolean).length, 0);
});

test('the final pour starts a reveal after returning home; undo, restore and interruptions retain knowledge without replay', () => {
  let state = readyMemory(createMemory(content.memoryPuzzle(2)));
  for (const step of state.puzzle.solution.slice(0, -1)) state = moveMemory(state, step.source, step.target)!.session;
  const last = state.puzzle.solution.at(-1)!;
  const result = moveMemory(state, last.source, last.target)!.session, learned = newlyRevealedMemory(state, result);
  assert.deepEqual(learned.slice().sort((a,b) => a-b), state.puzzle.masks.slice().sort((a,b) => a-b));
  const atHome = memoryDisplay(result, null, learned);
  assert.equal(atHome.reveals.flat().filter(Boolean).length, learned.length);
  assert.equal(atHome.hidden.flat().filter(Boolean).length, 0, 'real liquid is merged beneath the fading cover');
  const restored = restoreMemory(result.puzzle, { ...result, offset: result.game.historyOffset });
  assert.ok(memoryDisplay(restored, null).reveals.flat().every(v => !v));
  assert.ok(memoryDisplay(undoMemory(result), null).hidden.flat().every(v => !v));
  assert.ok(memoryDisplay(peekMemory(state), null).hidden.flat().every(v => !v));
  assert.deepEqual(newlyRevealedMemory(result, resetMemory(result)), []);
});

test('reveal starts at home, finishes within 380 ms and fades away without moving the vessel', () => {
  assert.equal(MEMORY_REVEAL_MS, 380);
  assert.equal(memoryRevealPose(0).colorOpacity, 0);
  assert.equal(memoryRevealPose(0).glowOpacity, 0);
  assert.equal(memoryRevealPose(1).colorOpacity, 1);
  assert.ok(memoryRevealPose(1).glowOpacity < 1e-8);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const pose = memoryRevealPose(i / 100);
    assert.ok(pose.colorOpacity >= previous && pose.colorOpacity <= 1);
    previous = pose.colorOpacity;
  }
  for (const vessel of VESSELS) {
    const plan = createPourPlan({ x: 0, y: 0 }, { x: 180, y: 0 }, 4, 2, -130, 12, 360, 430, vessel);
    const home = sourcePose(plan, 1);
    assert.equal(home.angle, 0); assert.equal(home.dx, 0); assert.equal(home.dy, 0);
  }
});

test('level 16 uses identical merged liquid paths during and after reveal, with no colored portion overlays', () => {
  let state = readyMemory(createMemory(content.memoryPuzzle(16)));
  for (const step of state.puzzle.solution.slice(0, -1)) state = moveMemory(state, step.source, step.target)!.session;
  const last = state.puzzle.solution.at(-1)!, accepted = moveMemory(state, last.source, last.target)!;
  const learned = newlyRevealedMemory(state, accepted.session);
  const returning = memoryDisplay(accepted.session, { before: state, pour: accepted.event.pour });
  assert.ok(returning.hidden.flat().some(Boolean));
  const revealing = memoryDisplay(accepted.session, null, learned), settled = memoryDisplay(accepted.session, null);
  assert.deepEqual(revealing.board, settled.board);
  assert.deepEqual(revealing.hidden, settled.hidden);
  for (const vessel of VESSELS) for (const [index, colors] of revealing.board.entries()) {
    assert.deepEqual(liquidFrame(colors, colors.length, 0, vessel, true), liquidFrame(settled.board[index], colors.length, 0, vessel, true));
    if (colors.length) assert.equal(liquidFrame(colors, 4, 0, vessel, false).filter(layer => layer.path).length, 1);
  }
});

test('reveal covers join adjacent quarters and preserve the true cavity across all vessels', () => {
  for (const vessel of VESSELS) for (let bits = 1; bits < 16; bits++) {
    const layers = [0, 1, 2, 3].map(i => !!(bits & (1 << i)));
    const path = memoryRevealPath(layers, vessel);
    const runs = layers.filter((value, i) => value && !layers[i - 1]).length;
    assert.equal((path.match(/M/g) ?? []).length, runs);
    const polygons = path.split(' Z').filter(p => p.trim()).map(p => [...p.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) })));
    const area = polygons.reduce((sum, p) => sum + polygonArea(p), 0);
    assert.ok(Math.abs(area - layers.filter(Boolean).length * vessel.layerArea) / vessel.layerArea < .001);
    assert.ok(polygons.flat().every(p => p.y <= vessel.bottomY));
  }
});

test('the prepared black cover is opaque at the exact return frame before any RN color commit', () => {
  assert.deepEqual(memoryRevealCover(.999, 0, 4), { opacity: 0, glow: 0 });
  assert.deepEqual(memoryRevealCover(1, 0, 4), { opacity: 1, glow: 0 });
  assert.deepEqual(memoryRevealCover(1, 0, 0), { opacity: 0, glow: 0 }, 'the empty returning source cannot flash a phantom black portion');
  assert.equal(memoryRevealCover(1, .5, 4).opacity, 1 - memoryRevealPose(.5).colorOpacity);
  assert.equal(memoryRevealCover(1, 1, 4).opacity, 0, 'completion and interruption leave real colors visible');
});

test('larger memory contours cover their actual unit in every vessel and never enter stems', () => {
  const points = (path: string) => [...path.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
  for (const vessel of VESSELS) for (const layer of [0, 1, 2, 3]) {
    const geometry = memoryLayerGeometry(layer, vessel);
    const band = points(geometry.path), mark = points(geometry.mark);
    assert.ok(band.length >= 3 && mark.length >= 3);
    assert.ok(Math.abs(polygonArea(band) - vessel.layerArea) / vessel.layerArea < .001);
    assert.ok(mark.every(p => p.y >= geometry.top && p.y <= geometry.bottom && p.y <= vessel.bottomY));
    assert.ok(polygonArea(mark) / vessel.layerArea > .65, `${vessel.id} layer ${layer}: large readable contour`);
    assert.equal(geometry.top, liquidSurface(layer + 1, vessel).y);
  }
});
