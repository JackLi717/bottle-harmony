import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, getPour, isSolved, type Board, type Pour } from './rules.ts';
import { applySolidPour, getSolidPour, solidStatus, type SolidRule } from './solidRules.ts';

export type GameStatus = 'playing' | 'stalled' | 'solved';
export type GameSession = {
  readonly level: LevelDefinition;
  readonly board: Board;
  readonly history: readonly Board[];
  readonly status: GameStatus;
  readonly solid: SolidRule | null;
};
export type MoveEvent = {
  readonly before: Board;
  readonly after: Board;
  readonly pour: Pour;
  readonly sourceId: string;
  readonly targetId: string;
};

function snapshot(board: Board): Board { return Object.freeze(board.map(bottle => Object.freeze([...bottle]))); }
function status(board: Board, capacity: number, solid: SolidRule | null): GameStatus {
  if (solid) return solidStatus(board, capacity, solid);
  if (isSolved(board, capacity)) return 'solved';
  return getLegalPours(board, capacity).length ? 'playing' : 'stalled';
}
function session(level: LevelDefinition, board: Board, history: readonly Board[], solid: SolidRule | null = null): GameSession {
  return Object.freeze({ level, board: snapshot(board), history: Object.freeze([...history]), status: status(board, level.capacity, solid), solid });
}

export function createSession(definition: LevelDefinition, solid: SolidRule | null = null): GameSession {
  const level = parseLevel(definition);
  if (solid && (solid.depth !== 1 || !Number.isInteger(solid.bottle) || solid.bottle < 0
    || solid.bottle >= level.bottles.length || !level.bottles[solid.bottle].layers.length)) throw new Error('Invalid solid bottle');
  return session(level, initialBoard(level), [], solid);
}

/** Accept and commit the logical move before the presentation consumes its event. */
export function moveSession(current: GameSession, source: number, target: number): { session: GameSession; event: MoveEvent } | null {
  if (current.status === 'solved') return null;
  const pour = current.solid ? getSolidPour(current.board, source, target, current.level.capacity, current.solid)
    : getPour(current.board, source, target, current.level.capacity);
  if (!pour) return null;
  const after = current.solid ? applySolidPour(current.board, pour, current.level.capacity, current.solid)
    : applyPour(current.board, pour, current.level.capacity);
  const next = session(current.level, after, [...current.history, current.board], current.solid);
  return {
    session: next,
    event: Object.freeze({ before: current.board, after: next.board, pour: Object.freeze(pour), sourceId: current.level.bottles[source].id, targetId: current.level.bottles[target].id }),
  };
}

export function undoSession(current: GameSession): GameSession {
  if (!current.history.length) return current;
  const length = current.history.length - 1;
  const solid = current.solid?.melted && current.solid.meltAt !== null && current.solid.meltAt !== undefined
    ? { ...current.solid, meltAt: Math.min(current.solid.meltAt, length) } : current.solid;
  return session(current.level, current.history[length], current.history.slice(0, -1), solid);
}

export function resetSession(current: GameSession): GameSession {
  return session(current.level, initialBoard(current.level), [], current.solid ? { ...current.solid, melted: false, meltAt: null } : null);
}

export function meltSession(current: GameSession): GameSession {
  if (!current.solid || current.solid.melted || current.status === 'solved') return current;
  return session(current.level, current.board, current.history, { ...current.solid, melted: true, meltAt: current.history.length });
}

/** Add the original, trailing empty bottle without changing any accepted pour
 * or undo snapshot. The bottle cannot have existed in the smaller session. */
export function extendSessionWithEmptyBottle(current: GameSession, definition: LevelDefinition): GameSession {
  const full = parseLevel(definition);
  if (full.id !== current.level.id || full.capacity !== current.level.capacity
    || full.bottles.length !== current.level.bottles.length + 1
    || full.bottles.at(-1)!.layers.length !== 0
    || full.bottles.slice(0, -1).some((bottle, index) => bottle.id !== current.level.bottles[index].id
      || JSON.stringify(bottle.layers) !== JSON.stringify(current.level.bottles[index].layers))) {
    throw new Error('Reserve bottle does not match the current level');
  }
  return session(full, [...current.board, []], current.history.map(board => [...board, []]));
}
