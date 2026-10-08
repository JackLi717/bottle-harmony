import type { Point } from '../art/liquidGeometry.ts';

export type BoardDirection = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Spatial navigation works for unequal row lengths without wrapping across an edge. */
export function nextBottleFocus(positions: readonly Point[], current: number, direction: BoardDirection): number {
  if (!positions[current]) return 0;
  const origin = positions[current];
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
  let best = current;
  let bestDistance = Infinity;
  positions.forEach((point, index) => {
    const across = horizontal ? point.x - origin.x : point.y - origin.y;
    const offAxis = horizontal ? point.y - origin.y : point.x - origin.x;
    if (across * sign <= 0 || (horizontal && offAxis !== 0)) return;
    const distance = Math.abs(across) + Math.abs(offAxis) * 2;
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}
