import { clipBelow, LAYER_AREA, polygonArea, rotatedInterior, type Point } from './liquidGeometry.ts';

export const STAGE_WIDTH = 360;
export const STAGE_HEIGHT = 430;
export const POUR_DURATION_MS = 1900;
export const STREAM_FADE_FRACTION = .025;
export const FLOW_START = 0.34;
export const FLOW_END = 0.72;
const MARGIN = 2;

export type PourPlan = {
  source: Point;
  target: Point;
  direction: number;
  sourceCount: number;
  amount: number;
  outlet: Point;
  minY: number;
  startLift: number;
  angles: number[];
  width: number;
  height: number;
};

function clamp(value: number, lo: number, hi: number) {
  'worklet';
  return Math.max(lo, Math.min(hi, value));
}

function ease(value: number) {
  'worklet';
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function transferredFraction(progress: number) {
  'worklet';
  return clamp((progress - FLOW_START) / (FLOW_END - FLOW_START), 0, 1);
}

export function streamOpacity(progress: number) {
  'worklet';
  return clamp(Math.min((progress - FLOW_START) / STREAM_FADE_FRACTION, (FLOW_END + STREAM_FADE_FRACTION - progress) / STREAM_FADE_FRACTION), 0, 1);
}

export function rotateBottlePoint(point: Point, angle: number): Point {
  'worklet';
  const radians = angle * Math.PI / 180;
  return {
    x: 50 + (point.x - 50) * Math.cos(radians) - (point.y - 90) * Math.sin(radians),
    y: 90 + (point.x - 50) * Math.sin(radians) + (point.y - 90) * Math.cos(radians),
  };
}

export function outletPoint(direction: number): Point {
  'worklet';
  return { x: 50 + direction * 12, y: 28 };
}

/** Tilt until the remaining volume's horizontal surface reaches the lower lip.
 * A nearly empty bottle therefore tilts further than a full bottle. */
export function pouringAngle(layers: number): number {
  'worklet';
  let lo = 0;
  let hi = 160;
  const area = clamp(layers, 0, 4) * LAYER_AREA;
  for (let i = 0; i < 15; i++) {
    const mid = (lo + hi) / 2;
    const lip = rotateBottlePoint(outletPoint(1), mid);
    const capacity = polygonArea(clipBelow(rotatedInterior(mid), lip.y));
    if (capacity > area) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function bottleBounds(angle: number) {
  'worklet';
  const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 180 }, { x: 0, y: 180 }].map(p => rotateBottlePoint(p, angle));
  return {
    minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
    minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)),
  };
}

/** Use the screen's existing header space. The recipient stays in its slot. */
export function createPourPlan(source: Point, target: Point, sourceCount: number, amount: number, minY = -130, startLift = 12, width = STAGE_WIDTH, height = STAGE_HEIGHT): PourPlan {
  const direction = target.x > source.x ? 1 : target.x < source.x ? -1 : target.x < width / 2 ? -1 : 1;
  const startAngle = pouringAngle(sourceCount);
  const endAngle = pouringAngle(sourceCount - amount);
  let minimumOutletY = minY;
  let maximumOutletY = height;
  for (let i = 0; i <= 80; i++) {
    const angle = direction * (startAngle + (endAngle - startAngle) * i / 80);
    const bounds = bottleBounds(angle);
    const lip = rotateBottlePoint(outletPoint(direction), angle);
    minimumOutletY = Math.max(minimumOutletY, minY + MARGIN - bounds.minY + lip.y);
    maximumOutletY = Math.min(maximumOutletY, height - MARGIN - bounds.maxY + lip.y);
  }
  const outletY = clamp(target.y + 28 - 38, minimumOutletY + 1, maximumOutletY - 1);
  return {
    source, target, direction, sourceCount, amount,
    outlet: { x: target.x + 50, y: outletY },
    minY, startLift, width, height,
    angles: Array.from({ length: 129 }, (_, index) => direction * pouringAngle(sourceCount - amount * index / 128)),
  };
}

/** The renderer and stream use this same rigid transform; neither guesses where
 * the mouth moved after rotation. The screen clips horizontal overhang; only
 * vertical movement is constrained to the available headroom. */
export function sourcePose(plan: PourPlan, progress: number) {
  'worklet';
  const initialAngle = plan.angles[0];
  const finalAngle = plan.angles[plan.angles.length - 1];
  let angle = 0;
  let x = plan.source.x + 50 + plan.direction * 12;
  let y = plan.source.y + 28;
  if (progress < 0.12) {
    y -= plan.startLift + ease(progress / 0.12) * (40 - plan.startLift);
  } else if (progress < 0.3) {
    const t = ease((progress - 0.12) / 0.18);
    angle = initialAngle * t;
    x += (plan.outlet.x - x) * t;
    const raisedY = plan.source.y + 28 - 40;
    y = raisedY + (plan.outlet.y - raisedY) * t;
  } else if (progress < 0.76) {
    const sample = transferredFraction(progress) * (plan.angles.length - 1);
    const index = Math.min(plan.angles.length - 2, Math.floor(sample));
    angle = plan.angles[index] + (plan.angles[index + 1] - plan.angles[index]) * (sample - index);
    x = plan.outlet.x;
    y = plan.outlet.y;
  } else if (progress < 0.92) {
    const t = ease((progress - 0.76) / 0.16);
    angle = finalAngle * (1 - t);
    x = plan.outlet.x + (x - plan.outlet.x) * t;
    y = plan.outlet.y + (y - plan.outlet.y) * t;
  }
  const lip = rotateBottlePoint(outletPoint(plan.direction), angle);
  const bounds = bottleBounds(angle);
  const left = x - lip.x;
  const top = clamp(y - lip.y, plan.minY + MARGIN - bounds.minY, plan.height - MARGIN - bounds.maxY);
  return { angle, dx: left - plan.source.x, dy: top - plan.source.y, outlet: { x: left + lip.x, y: top + lip.y } };
}
