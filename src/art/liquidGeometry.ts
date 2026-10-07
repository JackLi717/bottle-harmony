import type { Point } from './bottleDesign.ts';
import { DEFAULT_VESSEL, type VesselGeometry } from './vesselDesigns.ts';
export { INTERIOR, LAYER_AREA, type Point } from './bottleDesign.ts';

export function polygonArea(points: Point[]): number {
  'worklet';
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function clipBelow(points: readonly Point[], line: number): Point[] {
  'worklet';
  const output: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aInside = a.y >= line;
    const bInside = b.y >= line;
    if (aInside) output.push(a);
    if (aInside !== bInside) {
      const ratio = (line - a.y) / (b.y - a.y);
      output.push({ x: a.x + ratio * (b.x - a.x), y: line });
    }
  }
  return output;
}

export function rotatedInterior(degrees: number, geometry: VesselGeometry = DEFAULT_VESSEL): Point[] {
  'worklet';
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return geometry.interior.map(point => ({
    x: 50 + (point.x - 50) * cos - (point.y - 90) * sin,
    y: 90 + (point.x - 50) * sin + (point.y - 90) * cos,
  }));
}

/** Horizontal liquid surface in world coordinates; preserves volume on tilt. */
export function liquidPolygon(layers: number, degrees: number, geometry: VesselGeometry = DEFAULT_VESSEL): Point[] {
  'worklet';
  if (layers <= 0.0001) return [];
  const points = rotatedInterior(degrees, geometry);
  const desiredArea = Math.max(0, Math.min(4, layers)) * geometry.layerArea;
  let lo = -100;
  let hi = 280;
  for (let step = 0; step < 18; step++) {
    const mid = (lo + hi) / 2;
    if (polygonArea(clipBelow(points, mid)) > desiredArea) lo = mid;
    else hi = mid;
  }
  const radians = -degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return clipBelow(points, (lo + hi) / 2).map(point => ({
    x: 50 + (point.x - 50) * cos - (point.y - 90) * sin,
    y: 90 + (point.x - 50) * sin + (point.y - 90) * cos,
  }));
}

export function liquidPath(layers: number, degrees: number, geometry: VesselGeometry = DEFAULT_VESSEL): string {
  'worklet';
  const polygon = liquidPolygon(layers, degrees, geometry);
  if (!polygon.length) return '';
  return polygon.map((p, index) => `${index ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z';
}

/** Curved bowls have unequal layer heights; the stem is never part of the cavity. */
export function liquidSurface(layers: number, geometry: VesselGeometry = DEFAULT_VESSEL) {
  'worklet';
  if (layers <= .0001) return { y: geometry.bottomY, halfWidth: 0 };
  const polygon = liquidPolygon(layers, 0, geometry);
  const y = Math.min(...polygon.map(p => p.y));
  const edge = polygon.filter(p => Math.abs(p.y - y) < .01);
  return { y, halfWidth: (Math.max(...edge.map(p => p.x)) - Math.min(...edge.map(p => p.x))) / 2 };
}
