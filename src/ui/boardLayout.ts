import type { Point } from '../art/liquidGeometry.ts';

export type BoardLayout = { readonly width: number; readonly height: number; readonly slotWidth: number; readonly positions: readonly Point[] };

/** One bottle size for every level. Six glass silhouettes fit across the screen. */
export function boardLayout(bottleCount: number): BoardLayout {
  if (!Number.isInteger(bottleCount) || bottleCount < 4 || bottleCount > 12) throw new Error('Boards support 4–12 bottles');
  // Glass occupies x=18–82 of its 100-unit SVG canvas. Only that visible
  // silhouette needs to fit; transparent canvas and moving art may cross an edge.
  const width = 400;
  const columns = Math.ceil(bottleCount / 2);
  const positions: Point[] = [];
  for (let row = 0; row < 2; row++) {
    const count = Math.min(columns, bottleCount - row * columns);
    const spacing = width / count;
    for (let column = 0; column < count; column++) positions.push({ x: (column + 0.5) * spacing - 50, y: row === 0 ? 14 : 210 });
  }
  return { width, height: 400, slotWidth: width / columns, positions };
}

export function fitBoard(layout: BoardLayout, stage: { width: number; height: number; y: number }, safeTop: number) {
  // Fit the resting board, without shrinking it to reserve animation headroom.
  const scale = Math.max(0, Math.min(stage.width / layout.width, stage.height / layout.height));
  const minY = scale > 0 ? -Math.max(0, (stage.y - safeTop + (stage.height - layout.height * scale) / 2) / scale) : 0;
  return { scale, minY };
}
