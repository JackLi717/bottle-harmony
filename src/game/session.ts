import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { type Board, type Pour } from './rules.ts';
import { type SolidRule } from './solidRules.ts';
import { classicSortingPuzzle } from './engineModel.ts';
import { compileSortingPuzzle, evaluateEngineGoal, hasEngineAction, initialEngineState, transitionEngine, type EngineFrame, type EngineRuntime } from './engine.ts';

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
type CoreSession = { readonly runtime: EngineRuntime; readonly frame: EngineFrame; readonly history: readonly EngineFrame[] };
// Public v1 boards are immutable projections; this cache is not a second rule engine or persisted format.
const cores = new WeakMap<GameSession, CoreSession>();
const definitions = new WeakMap<LevelDefinition, Map<number, EngineRuntime>>();
function runtimeFor(level: LevelDefinition, solid: SolidRule | null): EngineRuntime {
  let variants = definitions.get(level);
  if (!variants) { variants = new Map(); definitions.set(level, variants); }
  const frozen = solid && !solid.melted ? solid.bottle : -1;
  let runtime = variants.get(frozen);
  if (!runtime) { runtime = compileSortingPuzzle(classicSortingPuzzle(level, frozen < 0 ? null : frozen)); variants.set(frozen, runtime); }
  return runtime;
}
function legacyFrame(runtime: EngineRuntime, board: Board): EngineFrame {
  const pools = new Map(runtime.puzzle.colors.map(color => [color, runtime.puzzle.units.filter(u => u.color === color).map(u => u.id)]));
  const used = new Map<string, number>();
  const initial = initialEngineState(runtime);
  const contents = Object.freeze(board.map(bottle => Object.freeze(bottle.map(color => {
    const index = used.get(color) ?? 0, unit = pools.get(color)?.[index];
    if (!unit) throw new Error('Invalid legacy inventory'); used.set(color, index + 1); return unit;
  }))));
  return Object.freeze({ state: Object.freeze({ ...initial.state, contents }), known: initial.known });
}
function coreOf(current: GameSession): CoreSession {
  return cores.get(current) ?? { runtime: runtimeFor(current.level, current.solid), frame: legacyFrame(runtimeFor(current.level, current.solid), current.board),
    history: current.history.map(board => legacyFrame(runtimeFor(current.level, current.solid), board)) };
}
export const SESSION_HISTORY_LIMIT = 4096;
function session(level: LevelDefinition, board: Board, history: readonly Board[], solid: SolidRule | null = null, historyOffset = 0, prepared?: CoreSession): GameSession {
  const runtime = runtimeFor(level, solid), frame = prepared?.frame ?? legacyFrame(runtime, board), coreHistory = prepared?.history ?? history.map(b => legacyFrame(runtime, b));
  const projected = snapshot(frame.state.contents.map(units => units.map(unit => runtime.unitColors.get(unit)!)));
  const status: GameStatus = evaluateEngineGoal(runtime, frame.state) ? 'solved' : hasEngineAction(runtime, frame.state, frame.known) ? 'playing' : 'stalled';
  const result = Object.freeze({ level, board: projected, history: Object.freeze([...history]), historyOffset, status, solid });
  cores.set(result, Object.freeze({ runtime, frame, history: Object.freeze([...coreHistory]) }));
  return result;
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
  if (!Number.isInteger(source) || !Number.isInteger(target) || !current.level.bottles[source] || !current.level.bottles[target]) return null;
  const core = coreOf(current), result = transitionEngine(core.runtime, core.frame.state, core.frame.known,
    { type: 'transfer', source: current.level.bottles[source].id, target: current.level.bottles[target].id });
  if (!result.accepted) return null;
  const moved = result.events.find(event => event.type === 'transfer')!;
  if (moved.type !== 'transfer') throw new Error('Missing transfer event');
  const pour: Pour = { source, target, color: core.runtime.unitColors.get(moved.units[0])!, amount: moved.units.length };
  const trimmed = current.history.length === SESSION_HISTORY_LIMIT;
  const solid = trimmed && current.solid?.melted ? { ...current.solid, meltAt: Math.max(0, (current.solid.meltAt ?? 0) - 1) } : current.solid;
  const next = session(current.level, current.board, [...(trimmed ? current.history.slice(1) : current.history), current.board], solid, current.historyOffset + (trimmed ? 1 : 0),
    { runtime: core.runtime, frame: { state: result.state, known: result.known }, history: [...(trimmed ? core.history.slice(1) : core.history), core.frame] });
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
  const core = coreOf(current);
  return session(current.level, current.history[length], current.history.slice(0, -1), solid, current.historyOffset,
    { runtime: runtimeFor(current.level, solid), frame: core.history[length], history: core.history.slice(0, -1) });
}

export function resetSession(current: GameSession): GameSession {
  return session(current.level, initialBoard(current.level), [], current.solid ? { ...current.solid, melted: false, meltAt: null } : null);
}

export function meltSession(current: GameSession): GameSession {
  if (!current.solid || current.solid.melted || current.status === 'solved') return current;
  return session(current.level, current.board, current.history, { ...current.solid, melted: true, meltAt: current.history.length }, current.historyOffset, coreOf(current));
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
  const core = coreOf(current), runtime = runtimeFor(full, current.solid);
  const extend = (frame: EngineFrame): EngineFrame => ({ state: Object.freeze({ ...frame.state, contents: Object.freeze([...frame.state.contents, Object.freeze([])]), open: Object.freeze([...frame.state.open, true]) }), known: frame.known });
  return session(full, [...current.board, []], current.history.map(board => [...board, []]), current.solid, current.historyOffset,
    { runtime, frame: extend(core.frame), history: core.history.map(extend) });
}
