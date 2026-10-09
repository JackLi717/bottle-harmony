import { hiddenMemory, type MemorySession } from '../game/memory.ts';
import type { Pour } from '../game/rules.ts';

export type MemoryPourPresentation = { before: MemorySession; pour: Pour };

/** The accepted move is already saved; black identities follow its liquid throughout the animation. */
export function memoryDisplay(session: MemorySession, animation: MemoryPourPresentation | null, revealing: readonly number[] = []) {
  const units = animation ? animation.before.units.map((b, i) => i === animation.pour.target
    ? [...b, ...animation.before.units[animation.pour.source].slice(-animation.pour.amount)] : b) : session.units;
  const board = animation ? animation.before.game.board.map((b, i) => i === animation.pour.target
    ? [...b, ...Array<string>(animation.pour.amount).fill(animation.pour.color)] : b) : session.game.board;
  const knowledge = animation?.before ?? session;
  const hidden = hiddenMemory(knowledge, units).map((b, i) => b.map((masked, layer) => masked || (!animation && revealing.includes(units[i][layer]))));
  const reveals = units.map(b => b.map(id => !animation && revealing.includes(id)));
  return { units, board, hidden, reveals };
}

export function newlyRevealedMemory(before: MemorySession, after: MemorySession): readonly number[] {
  if (before.puzzle.level.id !== after.puzzle.level.id || before.attempt !== after.attempt) return [];
  return after.revealed.flatMap((step, id) => before.revealed[id] < 0 && step >= 0 ? [id] : []);
}
