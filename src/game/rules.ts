export const CAPACITY = 4;
export type ColorId = 'jade' | 'coral';
/** Each bottle is ordered from bottom to top. */
export type Board = readonly (readonly ColorId[])[];
export type Pour = {
  source: number;
  target: number;
  color: ColorId;
  amount: number;
};

export function getPour(board: Board, source: number, target: number): Pour | null {
  if (source === target) return null;
  const from = board[source];
  const to = board[target];
  if (!from || !to || !from.length || to.length >= CAPACITY) return null;
  const color = from[from.length - 1];
  if (to.length && to[to.length - 1] !== color) return null;
  let run = 0;
  for (let i = from.length - 1; i >= 0 && from[i] === color; i--) run++;
  return { source, target, color, amount: Math.min(run, CAPACITY - to.length) };
}

export function applyPour(board: Board, pour: Pour): Board {
  const valid = getPour(board, pour.source, pour.target);
  if (!valid || valid.amount !== pour.amount || valid.color !== pour.color) {
    throw new Error('Invalid pour');
  }
  return board.map((bottle, index) => {
    if (index === pour.source) return bottle.slice(0, -pour.amount);
    if (index === pour.target) return [...bottle, ...Array<ColorId>(pour.amount).fill(pour.color)];
    return [...bottle];
  });
}

export function isSolved(board: Board): boolean {
  return board.every(bottle => !bottle.length || (
    bottle.length === CAPACITY && bottle.every(color => color === bottle[0])
  ));
}

/** Small breadth-first solver for the visual demo; not a production level generator. */
export function solveDemo(board: Board): Pour[] | null {
  const queue: { board: Board; path: Pour[] }[] = [{ board, path: [] }];
  const seen = new Set([JSON.stringify(board)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (isSolved(current.board)) return current.path;
    for (let source = 0; source < board.length; source++) {
      for (let target = 0; target < board.length; target++) {
        const pour = getPour(current.board, source, target);
        if (!pour) continue;
        const next = applyPour(current.board, pour);
        const key = JSON.stringify(next);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ board: next, path: [...current.path, pour] });
      }
    }
  }
  return null;
}
