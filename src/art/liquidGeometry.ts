export type Point = { x: number; y: number };

// Interior silhouette, including the shoulder and neck. Coordinates belong to
// the reusable 100 × 180 bottle design, independent of screen resolution.
export const INTERIOR: Point[] = [
  { x: 38, y: 34 }, { x: 62, y: 34 }, { x: 62, y: 42 },
  { x: 73, y: 57 }, { x: 75, y: 66 }, { x: 75, y: 154 },
  { x: 71, y: 162 }, { x: 29, y: 162 }, { x: 25, y: 154 },
  { x: 25, y: 66 }, { x: 27, y: 57 }, { x: 38, y: 42 },
];
export const LAYER_AREA = (50 * 96 - 32) / 4;

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

export function clipBelow(points: Point[], line: number): Point[] {
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

export function rotatedInterior(degrees: number): Point[] {
  'worklet';
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return INTERIOR.map(point => ({
    x: 50 + (point.x - 50) * cos - (point.y - 90) * sin,
    y: 90 + (point.x - 50) * sin + (point.y - 90) * cos,
  }));
}

/** Horizontal liquid surface in world coordinates; preserves volume on tilt. */
export function liquidPolygon(layers: number, degrees: number): Point[] {
  'worklet';
  if (layers <= 0.0001) return [];
  const points = rotatedInterior(degrees);
  const desiredArea = Math.max(0, Math.min(4, layers)) * LAYER_AREA;
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

export function liquidPath(layers: number, degrees: number): string {
  'worklet';
  const polygon = liquidPolygon(layers, degrees);
  if (!polygon.length) return '';
  return polygon.map((p, index) => `${index ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z';
}
