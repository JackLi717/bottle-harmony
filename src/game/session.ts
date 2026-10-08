import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, getPour, isSolved, type Board, type Pour } from './rules.ts';
import { applySolidPour, getSolidPour, solidStatus, type SolidRule } from './solidRules.ts';

export type GameStatus = 'playing' | 'stalled' | 'solved';
export type GameSession = {
  readonly level: LevelDefinition;
  readonly board: Board;
  readonly history: readonly Board[];
  readonly historyOffset: number;
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
export const SESSION_HISTORY_LIMIT = 4096;
function session(level: LevelDefinition, board: Board, history: readonly Board[], solid: SolidRule | null = null, historyOffset = 0): GameSession {
  return Object.freeze({ level, board: snapshot(board), history: Object.freeze([...history]), historyOffset, status: status(board, level.capacity, solid), solid });
}

/** A bounded undo checkpoint retains the original reset board and validates conservation. */
export function restoreSessionCheckpoint(level: LevelDefinition, board: Board, offset: number, solid: SolidRule | null): GameSession {
  if (!Number.isSafeInteger(offset) || offset < 0 || board.length !== level.bottles.length) throw new Error('Invalid undo checkpoint');
  parseLevel({ ...level, bottles: level.bottles.map((b, i) => ({ ...b, layers: board[i] })) });
  if (solid && !solid.melted && board[solid.bottle][0] !== level.bottles[solid.bottle].layers[0]) throw new Error('Invalid frozen checkpoint');
  return session(level, board, [], solid, offset);
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
  const trimmed = current.history.length === SESSION_HISTORY_LIMIT;
  const solid = trimmed && current.solid?.melted ? { ...current.solid, meltAt: Math.max(0, (current.solid.meltAt ?? 0) - 1) } : current.solid;
  const next = session(current.level, after, [...(trimmed ? current.history.slice(1) : current.history), current.board], solid, current.historyOffset + (trimmed ? 1 : 0));
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
  return session(current.level, current.history[length], current.history.slice(0, -1), solid, current.historyOffset);
}

export function resetSession(current: GameSession): GameSession {
  return session(current.level, initialBoard(current.level), [], current.solid ? { ...current.solid, melted: false, meltAt: null } : null);
}

export function meltSession(current: GameSession): GameSession {
  if (!current.solid || current.solid.melted || current.status === 'solved') return current;
  return session(current.level, current.board, current.history, { ...current.solid, melted: true, meltAt: current.history.length }, current.historyOffset);
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
  return session(full, [...current.board, []], current.history.map(board => [...board, []]), current.solid, current.historyOffset);
}
