import type { ColorId } from '../game/rules.ts';
import { clipBelow, liquidPolygon, type Point } from './liquidGeometry.ts';
import type { VesselGeometry } from './vesselDesigns.ts';

export type LiquidSymbolPose = { x: number; y: number; size: number; opacity: number; rotation: number };
export type LiquidLayerFrame = { path: string; symbol: LiquidSymbolPose };

function pathOf(points: readonly Point[]) {
  'worklet';
  return points.length ? points.map((p, index) => `${index ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z' : '';
}

/** Fit an upright glyph inside the actual horizontal color band, including tilted wedges. */
function symbolInBand(lower: readonly Point[], upper: readonly Point[], degrees: number, fraction: number): LiquidSymbolPose {
  'worklet';
  const hidden = { x: 50, y: 90, size: .01, opacity: 0, rotation: -degrees };
  if (!upper.length || fraction <= .0001) return hidden;
  const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const toWorld = (p: Point) => ({ x: 50 + (p.x - 50) * cos - (p.y - 90) * sin, y: 90 + (p.x - 50) * sin + (p.y - 90) * cos });
  const worldUpper = upper.map(toWorld);
  const top = Math.min(...worldUpper.map(p => p.y));
  const bottom = lower.length ? Math.min(...lower.map(toWorld).map(p => p.y)) : Math.max(...worldUpper.map(p => p.y));
  // Reflect for the shared horizontal clip, keeping only this portion above the lower surface.
  const band = clipBelow(worldUpper.map(p => ({ x: p.x, y: -p.y })), -bottom).map(p => ({ x: p.x, y: -p.y }));
  if (band.length < 3 || bottom - top < .0001) return hidden;
  const y = (top + bottom) / 2;
  const crossings: number[] = [];
  for (let i = 0; i < band.length; i++) {
    const a = band[i], b = band[(i + 1) % band.length];
    if ((a.y > y) !== (b.y > y)) crossings.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
  }
  crossings.sort((a, b) => a - b);
  let width = 0, x = 50;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    if (crossings[i + 1] - crossings[i] > width) {
      width = crossings[i + 1] - crossings[i];
      x = (crossings[i + 1] + crossings[i]) / 2;
    }
  }
  if (width <= .0001) return hidden;
  // Distance to every band edge bounds a circle entirely within the same color.
  let radius = Infinity;
  for (let i = 0; i < band.length; i++) {
    const a = band[i], b = band[(i + 1) % band.length];
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared)) : 0;
    radius = Math.min(radius, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return {
    x: 50 + (x - 50) * cos + (y - 90) * sin,
    y: 90 - (x - 50) * sin + (y - 90) * cos,
    size: Math.max(.01, Math.min(16, radius * 1.35)),
    opacity: Math.min(1, fraction * 4), rotation: -degrees,
  };
}

/** Static and pouring liquid paths/symbols share each cumulative volume boundary.
 * With symbols off, only the already merged color surfaces need geometry work. */
export function liquidFrame(colors: readonly ColorId[], visibleLayers: number, degrees: number, vessel: VesselGeometry, symbols: boolean): LiquidLayerFrame[] {
  'worklet';
  const count = Math.max(0, Math.min(4, visibleLayers));
  let lower: Point[] = [];
  return colors.map((color, layer) => {
    const surface = colors[layer + 1] !== color;
    const upper = symbols || surface
      ? count <= layer && symbols ? lower : liquidPolygon(Math.min(layer + 1, count), degrees, vessel)
      : [];
    const symbol = symbols ? symbolInBand(lower, upper, degrees, Math.max(0, Math.min(1, count - layer)))
      : { x: 50, y: 90, size: .01, opacity: 0, rotation: 0 };
    lower = upper;
    return { path: surface ? pathOf(upper) : '', symbol };
  });
}
