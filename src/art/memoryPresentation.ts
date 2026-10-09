import { clipBelow, liquidPolygon, liquidSurface, type Point } from './liquidGeometry.ts';
import type { VesselGeometry } from './vesselDesigns.ts';
import type { ColorId } from '../game/rules.ts';

export const MEMORY_UNKNOWN_FILL = '#3D4853';
export const MEMORY_MARK_COLORS = { dark: '#10243A', light: '#FFF6DF' } as const;
const lightMemoryMarks = new Set<ColorId>(['coral', 'indigo', 'cocoa']);

export function memoryMarkPaint(color: ColorId) {
  const light = lightMemoryMarks.has(color);
  return {
    ink: light ? MEMORY_MARK_COLORS.light : MEMORY_MARK_COLORS.dark,
    backing: light ? MEMORY_MARK_COLORS.dark : MEMORY_MARK_COLORS.light,
  };
}
export const MEMORY_REVEAL_MS = 380;

function pathOf(points: readonly Point[]) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z';
}

/** Actual unit boundaries follow the cavity, including curved bottoms and bowls. */
export function memoryLayerGeometry(layer: number, vessel: VesselGeometry) {
  const top = liquidSurface(layer + 1, vessel).y, bottom = liquidSurface(layer, vessel).y;
  const polygon = clipBelow(liquidPolygon(layer + 1, 0, vessel).map(p => ({ x: p.x, y: -p.y })), -bottom)
    .map(p => ({ x: p.x, y: -p.y }));
  // A large contour replaces the small central rectangle. Keep the stroke inside its own unit.
  const inset = Math.min(1.7, (bottom - top) * .11);
  const mark = polygon.map(p => ({ x: 50 + (p.x - 50) * .93, y: top + inset + (p.y - top) * (bottom - top - inset * 2) / (bottom - top) }));
  return { path: pathOf(polygon), mark: pathOf(mark), top, bottom };
}

export function memoryRevealPose(progress: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  const color = Math.max(0, Math.min(1, (p - .08) / .72));
  return { colorOpacity: color * color * (3 - 2 * color), glowOpacity: Math.sin(Math.PI * p) * .5, sweep: p };
}
