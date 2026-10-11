import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import type { EngineFrame } from '../../src/game/engine.ts';

export const POST_KEY_INTEGRATION_METHOD = 'post-key-whole-board-v1';
/** Generation screen only: three shared colors and two real color links per
 * occupied concealed bottle; an empty vessel adds shared working space. Completed colors do not need to remain in the puzzle. */
export function inspectPostKeyIntegration(board: readonly (readonly string[])[], locked: readonly number[]) {
  const inside = new Set(locked.flatMap(i => board[i]));
  const outside = new Set(board.flatMap((stack, i) => locked.includes(i) ? [] : stack));
  const sharedColors = [...inside].filter(c => outside.has(c)).sort();
  const shared = new Set(sharedColors);
  const linksPerBottle = locked.map(i => new Set(board[i].filter(c => shared.has(c))).size);
  const complete = new Set(board.filter(s => s.length === 4 && s.every(c => c === s[0])).map(s => s[0]));
  const remaining = [...new Set(board.flat())].filter(c => !complete.has(c));
  const neighbors = new Map(remaining.map(c => [c, new Set<string>()]));
  for (const stack of board) for (const a of stack) for (const b of stack) {
    if (a !== b && neighbors.has(a) && neighbors.has(b)) neighbors.get(a)!.add(b);
  }
  const visited = new Set<string>(), queue = remaining.slice(0, 1);
  for (const c of queue) {
    if (visited.has(c)) continue;
    visited.add(c); for (const n of neighbors.get(c)!) if (!visited.has(n)) queue.push(n);
  }
  const reason = sharedColors.length < 3 ? 'too-few-shared-colors'
    : linksPerBottle.some((n, j) => board[locked[j]].length > 0 && n < 2) ? 'isolated-locked-bottle'
    : visited.size !== remaining.length ? 'separate-color-component' : null;
  return { method: POST_KEY_INTEGRATION_METHOD, status: reason ? 'fail' as const : 'pass' as const,
    reason, sharedColors, linksPerBottle, connected: visited.size === remaining.length };
}
export function inspectUnlockedIntegration(puzzle: SortingPuzzle, frame: EngineFrame) {
  const colors = new Map(puzzle.units.map(u => [u.id, u.color]));
  const board = frame.state.contents.map(s => s.map(id => colors.get(id)!));
  return inspectPostKeyIntegration(board, puzzle.locked.map(id => puzzle.containers.findIndex(c => c.id === id)));
}
