import type { Board, Pour } from '../../src/game/rules.ts';

/** Frozen pre-upgrade semantics, deliberately independent of the production transfer kernel. */
export function oraclePour(board: Board, source: number, target: number, capacity: number, floor = 0): Pour | null {
  if (source === target || !board[source]?.length || !board[target] || board[target].length >= capacity) return null;
  const from = board[source], to = board[target], color = from.at(-1)!;
  if (to.length && to.at(-1) !== color) return null;
  let amount = 0;
  for (let i = from.length - 1; i >= floor && from[i] === color; i--) amount++;
  amount = Math.min(amount, capacity - to.length);
  return amount ? { source, target, color, amount } : null;
}
export function oracleMoves(board: Board, capacity: number): Pour[] {
  const result: Pour[] = [];
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    const move = oraclePour(board, source, target, capacity); if (move) result.push(move);
  }
  return result;
}
export function oracleApply(board: Board, pour: Pour): Board {
  return board.map((b, i) => i === pour.source ? b.slice(0, -pour.amount) : i === pour.target ? [...b, ...board[pour.source].slice(-pour.amount)] : b);
}
export function oracleSolved(board: Board, capacity: number) {
  return board.some(b => b.length) && board.every(b => !b.length || b.length === capacity && new Set(b).size === 1);
}
