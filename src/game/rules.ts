export const CAPACITY = 4;
/** Logical identity only; the visual theme resolves this ID separately. */
export type ColorId = string;
/** Each bottle is ordered from bottom to top. */
export type Board = readonly (readonly ColorId[])[];
export type Pour = {
  source: number;
  target: number;
  color: ColorId;
  amount: number;
};

export function getPour(board: Board, source: number, target: number, capacity = CAPACITY): Pour | null {
  if (!Number.isInteger(source) || !Number.isInteger(target) || source === target || !Number.isInteger(capacity) || capacity < 1) return null;
  const from = board[source];
  const to = board[target];
  if (!from || !to || !from.length || from.length > capacity || to.length >= capacity) return null;
  const color = from[from.length - 1];
  if (to.length && to[to.length - 1] !== color) return null;
  let run = 0;
  for (let i = from.length - 1; i >= 0 && from[i] === color; i--) run++;
  return { source, target, color, amount: Math.min(run, capacity - to.length) };
}

export function applyPour(board: Board, pour: Pour, capacity = CAPACITY): Board {
  const valid = getPour(board, pour.source, pour.target, capacity);
  if (!valid || valid.amount !== pour.amount || valid.color !== pour.color) {
    throw new Error('Invalid pour');
  }
  return board.map((bottle, index) => {
    if (index === pour.source) return bottle.slice(0, -pour.amount);
    if (index === pour.target) return [...bottle, ...Array<ColorId>(pour.amount).fill(pour.color)];
    return [...bottle];
  });
}

export function isSolved(board: Board, capacity = CAPACITY): boolean {
  return Number.isInteger(capacity) && capacity > 0 && board.some(bottle => bottle.length > 0) && board.every(bottle => !bottle.length || (
    bottle.length === capacity && bottle.every(color => color === bottle[0])
  ));
}

export function getLegalPours(board: Board, capacity = CAPACITY): Pour[] {
  const pours: Pour[] = [];
  for (let source = 0; source < board.length; source++) {
    for (let target = 0; target < board.length; target++) {
      const pour = getPour(board, source, target, capacity);
      if (pour) pours.push(pour);
    }
  }
  return pours;
}
