import { getPour, isSolved, type Board, type Pour } from './rules.ts';

export type SolidRule = { readonly bottle: number; readonly depth: 1; readonly melted: boolean; readonly meltAt?: number | null };

export function getSolidPour(board: Board, source: number, target: number, capacity: number, rule: SolidRule): Pour | null {
  const ordinary = getPour(board, source, target, capacity);
  if (!ordinary || rule.melted || source !== rule.bottle) return ordinary;
  const amount = Math.min(ordinary.amount, board[source].length - rule.depth);
  return amount > 0 ? { ...ordinary, amount } : null;
}

export function applySolidPour(board: Board, pour: Pour, capacity: number, rule: SolidRule): Board {
  const legal = getSolidPour(board, pour.source, pour.target, capacity, rule);
  if (!legal || legal.amount !== pour.amount || legal.color !== pour.color) throw new Error('Invalid solid-bottle pour');
  return board.map((bottle, index) => index === pour.source ? bottle.slice(0, -pour.amount)
    : index === pour.target ? [...bottle, ...Array(pour.amount).fill(pour.color)] : [...bottle]);
}

export function getSolidLegalPours(board: Board, capacity: number, rule: SolidRule): Pour[] {
  const result: Pour[] = [];
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    const pour = getSolidPour(board, source, target, capacity, rule);
    if (pour) result.push(pour);
  }
  return result;
}

export function solidStatus(board: Board, capacity: number, rule: SolidRule): 'solved' | 'playing' | 'stalled' {
  return isSolved(board, capacity) ? 'solved' : getSolidLegalPours(board, capacity, rule).length ? 'playing' : 'stalled';
}
