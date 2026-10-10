import type { VisibleEngineContainer } from '../game/engine.ts';
import type { SortingPuzzle, SortingTrigger } from '../game/engineModel.ts';
import { liquidPolygon, type Point } from './liquidGeometry.ts';
import type { VesselGeometry } from './vesselDesigns.ts';
import { FLOW_END, POUR_DURATION_MS } from './pourGeometry.ts';

export const COVER_FAMILIES = ['wood', 'louver', 'cloth', 'roller'] as const;
export type CoverFamily = typeof COVER_FAMILIES[number];
export type CoverState = 'closed' | 'opening' | 'relocked';
const KEY_FINISHES = [
  { fill: '#83B6A2', edge: '#3E6B5A', light: '#D8EBDD', dark: '#29483E' },
  { fill: '#CED9DF', edge: '#657583', light: '#F8FCFF', dark: '#3F4D58' },
  { fill: '#CB8E68', edge: '#794833', light: '#F6D5BC', dark: '#603A2A' },
] as const;
export function keyIdentity(index: number) { return { ...KEY_FINISHES[index % 3], shape: index % 3, number: index >= 3 ? index + 1 : null }; }
/** Fabric conveys a color achievement; key gates use a rigid shell instead. */
export function coverFamilyForConditions(family: CoverFamily, conditions: readonly SortingTrigger[]): CoverFamily {
  return family === 'cloth' && conditions.some(trigger => trigger.when.type === 'empty') ? 'wood' : family;
}
export const UNLOCK_DURATION_MS = 440;
export const UNIT_REVEAL_MS = 160;
export const CLASSIC_UNKNOWN_FILL = '#62758B';
export type CoverGroup = {
  readonly id: string; readonly indices: readonly number[]; readonly state: CoverState;
  readonly conditions: readonly SortingTrigger[]; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly centers: readonly number[];
};

/** Only public projections enter artwork. Unseen liquid counts never influence its shape. */
export function coverGroups(puzzle: SortingPuzzle, visible: readonly VisibleEngineContainer[], before: readonly VisibleEngineContainer[] | null,
  positions: readonly Point[], family: CoverFamily): readonly CoverGroup[] {
  const groups: CoverGroup[] = [];
  visible.forEach((container, i) => {
    const state: CoverState | null = container.locked ? container.count === null ? 'closed' : 'relocked'
      : before?.[i].locked ? 'opening' : null;
    if (!state) return;
    const conditions = puzzle.triggers.filter(trigger => trigger.unlock.includes(container.id));
    const previous = groups.at(-1), position = positions[i];
    const sameCondition = previous && previous.conditions.map(c => c.id).join('|') === conditions.map(c => c.id).join('|');
    const canJoin = previous && family !== 'cloth' && state !== 'relocked' && sameCondition && previous.state === state
      && previous.indices.length < 3 && previous.indices.at(-1) === i - 1 && previous.y === position.y + 16
      && position.x - positions[i - 1].x <= 134;
    if (canJoin) {
      const indices = [...previous.indices, i], centers = [...previous.centers, position.x + 50 - previous.x];
      groups[groups.length - 1] = { ...previous, id: indices.join('-'), indices, centers, width: position.x + 82 - previous.x };
    } else groups.push({ id: String(i), indices: [i], state, conditions, x: position.x + 18, y: position.y + 16, width: 64, height: 158, centers: [32] });
  });
  return groups;
}

export function unlockFraction(progress: number, state: CoverState): number {
  'worklet';
  if (state !== 'opening') return 0;
  const t = Math.max(0, Math.min(1, (progress - FLOW_END) * POUR_DURATION_MS / UNLOCK_DURATION_MS));
  return 1 - (1 - t) ** 3;
}
export function coverPose(progress: number, state: CoverState) {
  'worklet';
  const open = unlockFraction(progress, state);
  return { open, opacity: open < .9 ? 1 : Math.max(0, (1 - open) / .1), latch: Math.max(0, 1 - open * 5) };
}

/** Sink the key inside the actual cavity floor, independently of fill and tilt. */
export function bottleKeyAnchor(vessel: VesselGeometry) {
  const portion = liquidPolygon(1, 0, vessel);
  const span = (x: number) => {
    const crossings: number[] = [];
    portion.forEach((a, i) => {
      const b = portion[(i + 1) % portion.length];
      if ((a.x > x) !== (b.x > x)) crossings.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
    });
    return crossings.length >= 2 ? { top: Math.min(...crossings), bottom: Math.max(...crossings) } : null;
  };
  const restingY = (scale: number) => {
    const left = span(50 - 10.5 * scale), right = span(50 + 10.5 * scale);
    if (!left || !right) return null;
    const top = Math.max(left.top, right.top) + 6.5 * scale + .4;
    const bottom = Math.min(left.bottom, right.bottom) - 6.5 * scale - .4;
    return bottom >= top ? bottom : null;
  };
  let scale = 0, limit = .9;
  for (let i = 0; i < 16; i++) {
    const middle = (scale + limit) / 2;
    if (restingY(middle) !== null) scale = middle;
    else limit = middle;
  }
  return { x: 50, y: restingY(scale)!, scale };
}

export function bottleKeyPose(anchor: ReturnType<typeof bottleKeyAnchor>, triggered: boolean, progress: number) {
  'worklet';
  // Lie sideways at the floor. Keep the glyph's visual center at the anchor.
  return { opacity: 1 - coverPose(progress, triggered ? 'opening' : 'closed').open,
    matrix: [0, anchor.scale, -anchor.scale, 0, anchor.x + anchor.scale, anchor.y] };
}
export function revealOpacity(progress: number) {
  'worklet';
  return 1 - Math.max(0, Math.min(1, (progress - FLOW_END) * POUR_DURATION_MS / UNIT_REVEAL_MS));
}

/** Stable unit IDs, rather than positions, identify newly disclosed stationary portions. */
export function revealLayers(beforeUnits: readonly string[], beforeColors: readonly (string | null)[], afterUnits: readonly string[], afterColors: readonly (string | null)[]) {
  const disclosed = new Map(afterUnits.map((unit, i) => [unit, afterColors[i]]));
  return beforeUnits.map((unit, i) => beforeColors[i] === null && disclosed.has(unit) && disclosed.get(unit) !== null);
}

export function pourPresentation(before: readonly VisibleEngineContainer[], after: readonly VisibleEngineContainer[], beforeUnits: readonly (readonly string[])[],
  afterUnits: readonly (readonly string[])[], source: number, target: number, amount: number) {
  const revealing = before.map((container, i) => revealLayers(beforeUnits[i], container.colors, afterUnits[i], after[i].colors));
  const containers = after.map((container, i) => {
    if (i === target) return { ...container, colors: [...before[i].colors, ...before[source].colors.slice(-amount)] };
    if (i !== source) return container;
    const next = new Map(afterUnits[i].map((unit, d) => [unit, after[i].colors[d]]));
    return { ...container, colors: before[i].colors.map((color, d) => next.has(beforeUnits[i][d]) ? next.get(beforeUnits[i][d])! : color) };
  });
  return { containers, revealing };
}
