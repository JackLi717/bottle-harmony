import type { Point } from '../art/liquidGeometry.ts';

export type BoardLayout = { readonly width: number; readonly height: number; readonly positions: readonly Point[] };

/** Four slots preserve the approved art baseline. Wider boards keep two rows. */
export function boardLayout(bottleCount: number): BoardLayout {
  if (!Number.isInteger(bottleCount) || bottleCount < 4 || bottleCount > 12) throw new Error('Boards support 4–12 bottles');
  if (bottleCount === 4) return { width: 360, height: 430, positions: [{ x: 38, y: 14 }, { x: 222, y: 14 }, { x: 38, y: 228 }, { x: 222, y: 228 }] };
  // Extra side space lets a tilted bottle reach an edge recipient without clipping.
  const columns = Math.ceil(bottleCount / 2);
  const spacing = columns === 6 ? 132 : 110;
  const width = columns === 3 ? 470 : columns === 4 ? 580 : columns === 5 ? 690 : 910;
  const positions: Point[] = [];
  for (let row = 0; row < 2; row++) {
    const count = Math.min(columns, bottleCount - row * columns);
    const occupied = 100 + (count - 1) * spacing;
    for (let column = 0; column < count; column++) positions.push({ x: (width - occupied) / 2 + column * spacing, y: row === 0 ? 14 : 228 });
  }
  return { width, height: 430, positions };
}

export function fitBoard(layout: BoardLayout, stage: { width: number; height: number; y: number }, safeTop: number) {
  const scale = Math.max(0, Math.min(stage.width / layout.width, stage.height / layout.height, (stage.y - safeTop + stage.height / 2) / (layout.height / 2 + 130)));
  const minY = scale > 0 ? -Math.max(130, (stage.y - safeTop + (stage.height - layout.height * scale) / 2) / scale) : -130;
  return { scale, minY };
}
