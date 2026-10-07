import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, getPour, isSolved, type Board, type Pour } from './rules.ts';

export type GameStatus = 'playing' | 'stalled' | 'solved';
export type GameSession = {
  readonly level: LevelDefinition;
  readonly board: Board;
  readonly history: readonly Board[];
  readonly status: GameStatus;
};
export type MoveEvent = {
  readonly before: Board;
  readonly after: Board;
  readonly pour: Pour;
  readonly sourceId: string;
  readonly targetId: string;
};

function snapshot(board: Board): Board { return Object.freeze(board.map(bottle => Object.freeze([...bottle]))); }
function status(board: Board, capacity: number): GameStatus {
  if (isSolved(board, capacity)) return 'solved';
  return getLegalPours(board, capacity).length ? 'playing' : 'stalled';
}
function session(level: LevelDefinition, board: Board, history: readonly Board[]): GameSession {
  return Object.freeze({ level, board: snapshot(board), history: Object.freeze([...history]), status: status(board, level.capacity) });
}

export function createSession(definition: LevelDefinition): GameSession {
  const level = parseLevel(definition);
  return session(level, initialBoard(level), []);
}

/** Accept and commit the logical move before the presentation consumes its event. */
export function moveSession(current: GameSession, source: number, target: number): { session: GameSession; event: MoveEvent } | null {
  if (current.status === 'solved') return null;
  const pour = getPour(current.board, source, target, current.level.capacity);
  if (!pour) return null;
  const next = session(current.level, applyPour(current.board, pour, current.level.capacity), [...current.history, current.board]);
  return {
    session: next,
    event: Object.freeze({ before: current.board, after: next.board, pour: Object.freeze(pour), sourceId: current.level.bottles[source].id, targetId: current.level.bottles[target].id }),
  };
}

export function undoSession(current: GameSession): GameSession {
  if (!current.history.length) return current;
  return session(current.level, current.history[current.history.length - 1], current.history.slice(0, -1));
}

export function resetSession(current: GameSession): GameSession {
  return session(current.level, initialBoard(current.level), []);
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
