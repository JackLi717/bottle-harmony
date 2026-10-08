import { createSession, moveSession, restoreSessionCheckpoint, undoSession, SESSION_HISTORY_LIMIT, type GameSession, type MoveEvent } from './session.ts';
import { initialBoard, type LevelDefinition } from './model.ts';
import { getLegalPours, type Pour } from './rules.ts';

export const MEMORY_RULES = 'memory-reveal-v1';
export type MemoryPuzzle = { readonly number: number; readonly level: LevelDefinition; readonly masks: readonly number[]; readonly skill: string; readonly solution: readonly Pour[] };
export type UnitBoard = readonly (readonly number[])[];
export type MemoryPhase = 'observe' | 'play' | 'peek';
export type MemorySession = {
  readonly puzzle: MemoryPuzzle; readonly game: GameSession; readonly units: UnitBoard;
  readonly history: readonly UnitBoard[]; readonly revealed: readonly number[];
  readonly phase: MemoryPhase; readonly attempt: number;
  readonly pours: number; readonly peeks: number; readonly hints: number; readonly undos: number;
};
export const freezeUnits = (board: UnitBoard): UnitBoard => Object.freeze(board.map(b => Object.freeze([...b])));
export function initialUnits(puzzle: MemoryPuzzle): UnitBoard {
  let id = 0;
  return freezeUnits(puzzle.level.bottles.map(b => b.layers.map(() => id++)));
}
export function unitColors(puzzle: MemoryPuzzle) { return initialBoard(puzzle.level).flat(); }
export function transferUnits(board: UnitBoard, pour: Pour): UnitBoard {
  const next = board.map(b => [...b]);
  next[pour.target].push(...next[pour.source].splice(-pour.amount));
  return freezeUnits(next);
}
/** Only actual top runs become permanent knowledge; observation/peek never do. */
function expose(game: GameSession, units: UnitBoard, revealed: readonly number[]) {
  const next = [...revealed], step = game.historyOffset + game.history.length;
  game.board.forEach((b, i) => {
    for (let d = b.length - 1; d >= 0 && b[d] === b.at(-1); d--) if (next[units[i][d]] < 0) next[units[i][d]] = step;
  });
  return Object.freeze(next);
}
export function createMemory(puzzle: MemoryPuzzle, attempt = 1): MemorySession {
  const game = createSession(puzzle.level), units = initialUnits(puzzle);
  const revealed = unitColors(puzzle).map((_, id) => puzzle.masks.includes(id) ? -1 : 0);
  return Object.freeze({ puzzle, game, units, history: Object.freeze([]), revealed: expose(game, units, revealed),
    phase: 'observe', attempt, pours: 0, peeks: 0, hints: 0, undos: 0 });
}
export function readyMemory(current: MemorySession): MemorySession {
  return current.phase === 'observe' ? Object.freeze({ ...current, phase: 'play' }) : current;
}
export function peekMemory(current: MemorySession): MemorySession {
  if (current.phase === 'observe' || current.game.status === 'solved') return current;
  return Object.freeze({ ...current, phase: current.phase === 'peek' ? 'play' : 'peek', peeks: current.peeks + (current.phase === 'play' ? 1 : 0) });
}
export function moveMemory(current: MemorySession, source: number, target: number, hinted = false): { session: MemorySession; event: MoveEvent } | null {
  if (current.phase !== 'play') return null;
  const accepted = moveSession(current.game, source, target);
  if (!accepted) return null;
  const units = transferUnits(current.units, accepted.event.pour);
  const history = [...(current.history.length === SESSION_HISTORY_LIMIT ? current.history.slice(1) : current.history), current.units];
  return { event: accepted.event, session: Object.freeze({ ...current, game: accepted.session, units,
    history: Object.freeze(history), revealed: expose(accepted.session, units, current.revealed), pours: current.pours + 1, hints: current.hints + (hinted ? 1 : 0) }) };
}
export function undoMemory(current: MemorySession): MemorySession {
  if (current.phase !== 'play' || !current.history.length) return current;
  const game = undoSession(current.game), units = current.history.at(-1)!;
  return Object.freeze({ ...current, game, units, history: Object.freeze(current.history.slice(0, -1)),
    revealed: expose(game, units, current.revealed), undos: current.undos + 1 });
}
export function resetMemory(current: MemorySession): MemorySession { return createMemory(current.puzzle, current.attempt + 1); }
export function hiddenMemory(current: MemorySession, units = current.units, forceMask = false): readonly (readonly boolean[])[] {
  return units.map(b => b.map(id => (forceMask || current.phase === 'play') && current.game.status !== 'solved' && current.revealed[id] < 0));
}
export function validateMemoryPuzzle(puzzle: MemoryPuzzle) {
  const game = createSession(puzzle.level), units = initialUnits(puzzle), colors = unitColors(puzzle);
  if (!Number.isInteger(puzzle.number) || puzzle.number < 1 || game.level.capacity !== 4 || game.level.colors.length > 6
    || game.board.filter(b => !b.length).length !== 2 || game.board.length > 8 || !puzzle.masks.length
    || new Set(puzzle.masks).size !== puzzle.masks.length || !puzzle.skill) throw new Error('Invalid memory puzzle');
  for (const id of puzzle.masks) {
    const bottle = units.find(b => b.includes(id)), depth = bottle?.indexOf(id) ?? -1;
    if (!Number.isInteger(id) || id < 0 || id >= colors.length || depth < 0 || depth > 1) throw new Error('Invalid memory mask');
    const i = units.indexOf(bottle!);
    if (game.board[i].slice(depth).every(c => c === colors[id])) throw new Error('Mask covers a visible top run');
  }
  if (game.board.some(b => game.level.colors.some(c => b.filter(v => v === c).length > 2))) throw new Error('Memory opening concentration');
}
/** Restore validates stable identities and every retained transition, independent of rendering. */
export function restoreMemory(puzzle: MemoryPuzzle, input: Omit<MemorySession, 'puzzle' | 'game'> & { offset: number }): MemorySession {
  const colors = unitColors(puzzle), total = colors.length;
  const validate = (units: UnitBoard) => {
    if (units.length !== puzzle.level.bottles.length || units.some(b => b.length > 4) || units.flat().length !== total
      || new Set(units.flat()).size !== total || units.flat().some(id => !Number.isInteger(id) || id < 0 || id >= total)) throw new Error('Invalid memory unit checkpoint');
  };
  for (const b of [...input.history, input.units]) validate(b);
  if (input.history.length > SESSION_HISTORY_LIMIT || !Number.isSafeInteger(input.offset) || input.offset < 0
    || !['observe', 'play', 'peek'].includes(input.phase) || input.revealed.length !== total
    || input.revealed.some(n => !Number.isSafeInteger(n) || n < -1 || n > input.pours)
    || [input.pours, input.peeks, input.hints, input.undos, input.attempt].some(n => !Number.isSafeInteger(n) || n < 0) || input.attempt < 1
    || input.hints > input.pours || input.undos > input.pours || input.pours < input.offset + input.history.length) throw new Error('Invalid memory counters');
  const anchor = input.history[0] ?? input.units;
  if (input.offset === 0 && JSON.stringify(anchor) !== JSON.stringify(initialUnits(puzzle))) throw new Error('Invalid memory origin');
  const board = (units: UnitBoard) => units.map(b => b.map(id => colors[id]));
  // The anchor has complete identity/conservation checks above; later states must be legal maximal pours.
  let game = restoreSessionCheckpoint(puzzle.level, board(anchor), input.offset, null);
  let previous = anchor;
  for (const next of [...input.history.slice(1), ...(input.history.length ? [input.units] : [])]) {
    const pour = getLegalPours(game.board, 4).find(p => JSON.stringify(transferUnits(previous, p)) === JSON.stringify(next));
    const accepted = pour && moveSession(game, pour.source, pour.target);
    if (!accepted) throw new Error('Illegal memory history');
    game = accepted.session; previous = next;
  }
  if (input.phase === 'observe' && (input.pours || input.peeks || input.history.length || input.offset) || game.status === 'solved' && input.phase !== 'play') throw new Error('Invalid observation state');
  if (input.phase === 'observe' && JSON.stringify(input.revealed) !== JSON.stringify(createMemory(puzzle).revealed)) throw new Error('Invalid observation knowledge');
  const revealed = expose(game, input.units, input.revealed);
  if (JSON.stringify(revealed) !== JSON.stringify(input.revealed) || colors.some((_, id) => !puzzle.masks.includes(id) && input.revealed[id] !== 0)) throw new Error('Missing visible memory knowledge');
  return Object.freeze({ ...input, puzzle, game, units: freezeUnits(input.units), history: Object.freeze(input.history.map(freezeUnits)), revealed: Object.freeze([...input.revealed]) });
}
