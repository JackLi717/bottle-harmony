import { createSession, SESSION_HISTORY_LIMIT, type GameSession, type MoveEvent } from './session.ts';
import { initialBoard, type LevelDefinition } from './model.ts';
import { isSolved, type Board, type Pour } from './rules.ts';
import { replaySolution } from './solver.ts';

export const MEMORY_RULES = 'memory-black-v1';
export type MemoryPuzzle = { readonly number: number; readonly level: LevelDefinition; readonly masks: readonly number[]; readonly skill: string; readonly solution: readonly Pour[] };
export type UnitBoard = readonly (readonly number[])[];
export type MemoryPhase = 'observe' | 'play' | 'peek';
export type MemoryJudgement = 'hidden' | 'wrong' | 'cleanup' | 'correct';
export type MemorySession = {
  readonly puzzle: MemoryPuzzle; readonly game: GameSession; readonly units: UnitBoard;
  readonly history: readonly UnitBoard[]; readonly revealed: readonly number[];
  readonly phase: MemoryPhase; readonly judgement: MemoryJudgement;
  /** Earlier route moves used black rules; later moves use ordinary rules. Undo clamps this boundary. */
  readonly revealAt: number | null; readonly attempt: number;
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
/** Compatibility and run lengths use public knowledge, never a hidden unit's true color. */
export function memoryPour(units: UnitBoard, colors: readonly string[], revealed: readonly number[], source: number, target: number): Pour | null {
  if (!Number.isInteger(source) || !Number.isInteger(target) || source === target) return null;
  const from = units[source], to = units[target];
  if (!from?.length || !to || from.length > 4 || to.length >= 4) return null;
  const id = from.at(-1)!, color = colors[id], black = revealed[id] < 0, receiver = to.at(-1);
  if (receiver !== undefined && !black && revealed[receiver] >= 0 && colors[receiver] !== color) return null;
  let run = 1;
  if (!black) while (run < from.length && revealed[from[from.length - 1 - run]] >= 0 && colors[from[from.length - 1 - run]] === color) run++;
  return { source, target, color, amount: Math.min(run, 4 - to.length) };
}
export function getMemoryPour(current: MemorySession, source: number, target: number): Pour | null {
  if (current.phase !== 'play' || current.judgement === 'wrong' || current.game.status === 'solved') return null;
  return memoryPour(current.units, unitColors(current.puzzle), current.revealed, source, target);
}
function boardOf(units: UnitBoard, colors: readonly string[]): Board { return Object.freeze(units.map(b => Object.freeze(b.map(id => colors[id])))); }
function gameOf(current: GameSession, units: UnitBoard, knowledge: readonly number[], history: readonly Board[], offset: number): GameSession {
  const colors = initialBoard(current.level).flat(), board = boardOf(units, colors);
  const solved = knowledge.every(n => n >= 0) && isSolved(board, 4);
  let movable = false;
  if (!solved) for (let from = 0; from < units.length && !movable; from++) for (let to = 0; to < units.length; to++) if (memoryPour(units, colors, knowledge, from, to)) { movable = true; break; }
  return Object.freeze({ ...current, board, history: Object.freeze([...history]), historyOffset: offset, status: solved ? 'solved' : movable ? 'playing' : 'stalled' });
}
export function createMemory(puzzle: MemoryPuzzle, attempt = 1): MemorySession {
  const ordinary = createSession(puzzle.level), units = initialUnits(puzzle);
  const revealed = Object.freeze(unitColors(puzzle).map((_, id) => puzzle.masks.includes(id) ? -1 : 0));
  return Object.freeze({ puzzle, game: gameOf(ordinary, units, revealed, [], 0), units, history: Object.freeze([]), revealed,
    phase: 'observe', judgement: 'hidden', revealAt: null, attempt, pours: 0, peeks: 0, hints: 0, undos: 0 });
}
export function readyMemory(current: MemorySession): MemorySession {
  return current.phase === 'observe' ? Object.freeze({ ...current, phase: 'play' }) : current;
}
export function peekMemory(current: MemorySession): MemorySession {
  if (current.phase === 'observe' || current.judgement !== 'hidden') return current;
  return Object.freeze({ ...current, phase: current.phase === 'peek' ? 'play' : 'peek', peeks: current.peeks + (current.phase === 'play' ? 1 : 0) });
}
export function revealMemory(current: MemorySession): MemorySession {
  if (current.phase !== 'play' || current.judgement !== 'hidden') return current;
  const revealAt = current.game.historyOffset + current.history.length;
  const revealed = Object.freeze(current.revealed.map(n => n < 0 ? revealAt : n));
  const game = gameOf(current.game, current.units, revealed, current.game.history, current.game.historyOffset);
  return Object.freeze({ ...current, game, revealed, revealAt, judgement: game.status === 'solved' ? 'correct' : 'wrong' });
}
/** Public arrangement only: black portions fit any color, but every occupied bottle must be full. */
export function memoryReadyToReveal(units: UnitBoard, colors: readonly string[], revealed: readonly number[]): boolean {
  return units.some(b => b.length > 0) && units.every(b => !b.length || b.length === 4
    && new Set(b.filter(id => revealed[id] >= 0).map(id => colors[id])).size <= 1);
}
/** Only a fully replayed ordinary solution opens the post-answer continuation. */
export function continueMemory(current: MemorySession, route: readonly Pour[]): MemorySession {
  if (current.judgement !== 'wrong' || current.phase !== 'play') return current;
  replaySolution(current.game.board, route, 4);
  return Object.freeze({ ...current, judgement: 'cleanup' });
}
export function moveMemory(current: MemorySession, source: number, target: number, hinted = false): { session: MemorySession; event: MoveEvent } | null {
  const pour = getMemoryPour(current, source, target);
  if (!pour) return null;
  const units = transferUnits(current.units, pour), trimmed = current.history.length === SESSION_HISTORY_LIMIT;
  const history = Object.freeze([...(trimmed ? current.history.slice(1) : current.history), current.units]);
  const game = gameOf(current.game, units, current.revealed, [...(trimmed ? current.game.history.slice(1) : current.game.history), current.game.board], current.game.historyOffset + (trimmed ? 1 : 0));
  const next = Object.freeze({ ...current, game, units, history, pours: current.pours + 1, hints: current.hints + (hinted ? 1 : 0) });
  const session = next.judgement === 'hidden' && memoryReadyToReveal(units, unitColors(current.puzzle), next.revealed) ? revealMemory(next) : next;
  return { event: Object.freeze({ before: current.game.board, after: game.board, pour: Object.freeze(pour), sourceId: game.level.bottles[source].id, targetId: game.level.bottles[target].id }), session };
}
export function undoMemory(current: MemorySession): MemorySession {
  if (current.phase !== 'play' || !current.history.length) return current;
  const units = current.history.at(-1)!, history = Object.freeze(current.history.slice(0, -1));
  const game = gameOf(current.game, units, current.revealed, current.game.history.slice(0, -1), current.game.historyOffset);
  return Object.freeze({ ...current, game, units, history, judgement: current.judgement === 'hidden' ? 'hidden' : 'cleanup',
    revealAt: current.revealAt === null ? null : Math.min(current.revealAt, game.historyOffset + history.length), undos: current.undos + 1 });
}
export function resetMemory(current: MemorySession): MemorySession { return createMemory(current.puzzle, current.attempt + 1); }
export function hiddenMemory(current: MemorySession, units = current.units, forceMask = false): readonly (readonly boolean[])[] {
  return units.map(b => b.map(id => (forceMask || current.phase === 'play') && current.revealed[id] < 0));
}
export function validateMemoryPuzzle(puzzle: MemoryPuzzle) {
  const game = createSession(puzzle.level), colors = unitColors(puzzle);
  if (!Number.isInteger(puzzle.number) || puzzle.number < 1 || game.level.capacity !== 4 || game.level.colors.length > 8
    || game.board.length !== game.level.colors.length + 2 || game.board.some(b => b.length !== 0 && b.length !== 4)
    || game.board.filter(b => !b.length).length !== 2 || game.board.length > 10 || !puzzle.masks.length
    || puzzle.masks.length > 12 || new Set(puzzle.masks).size !== puzzle.masks.length || !puzzle.skill) throw new Error('Invalid memory puzzle');
  if (puzzle.masks.some(id => !Number.isInteger(id) || id < 0 || id >= colors.length)) throw new Error('Invalid memory mask');
  const bottles = new Set(puzzle.masks.map(id => Math.floor(id / 4)));
  if (bottles.size > 6 || [...bottles].some(b => {
    const depths = puzzle.masks.filter(id => Math.floor(id / 4) === b).map(id => id % 4).sort();
    return depths.length > 2 || depths.some((d, i) => i > 0 && d - depths[i - 1] < 2);
  })) throw new Error('Memory masks must be dispersed and nonadjacent');
  if (puzzle.masks.length > 1 && (!puzzle.masks.some(id => id % 4 >= 2) || !puzzle.masks.some(id => id % 4 < 2))) throw new Error('Memory masks must cover upper and lower depths');
  if (game.board.some(b => game.level.colors.some(c => b.filter(v => v === c).length > 2))) throw new Error('Memory opening concentration');
}
/** Validate identities and legal transitions on both sides of the irreversible reveal boundary. */
export function restoreMemory(puzzle: MemoryPuzzle, input: Omit<MemorySession, 'puzzle' | 'game'> & { offset: number }): MemorySession {
  const colors = unitColors(puzzle), total = colors.length;
  const validate = (units: UnitBoard) => {
    if (units.length !== puzzle.level.bottles.length || units.some(b => b.length > 4) || units.flat().length !== total
      || new Set(units.flat()).size !== total || units.flat().some(id => !Number.isInteger(id) || id < 0 || id >= total)) throw new Error('Invalid memory unit checkpoint');
  };
  for (const b of [...input.history, input.units]) validate(b);
  if (input.history.length > SESSION_HISTORY_LIMIT || !Number.isSafeInteger(input.offset) || input.offset < 0
    || !['observe', 'play', 'peek'].includes(input.phase) || !['hidden', 'wrong', 'cleanup', 'correct'].includes(input.judgement)
    || input.revealed.length !== total || input.revealed.some(n => !Number.isSafeInteger(n) || n < -1 || n > input.pours)
    || [input.pours, input.peeks, input.hints, input.undos, input.attempt].some(n => !Number.isSafeInteger(n) || n < 0) || input.attempt < 1
    || input.hints > input.pours || input.undos > input.pours || input.pours < input.offset + input.history.length) throw new Error('Invalid memory counters');
  if (input.judgement === 'hidden' ? input.revealAt !== null || colors.some((_, id) => input.revealed[id] !== (puzzle.masks.includes(id) ? -1 : 0))
    : !Number.isSafeInteger(input.revealAt) || input.revealAt! < 0 || input.revealAt! > input.offset + input.history.length || input.revealed.some(n => n < 0)) throw new Error('Invalid memory knowledge');
  if (colors.some((_, id) => !puzzle.masks.includes(id) && input.revealed[id] !== 0)) throw new Error('Invalid visible memory knowledge');
  const anchor = input.history[0] ?? input.units;
  if (input.offset === 0 && JSON.stringify(anchor) !== JSON.stringify(initialUnits(puzzle))) throw new Error('Invalid memory origin');
  let previous = anchor, step = input.offset;
  const original = colors.map((_, id) => puzzle.masks.includes(id) ? -1 : 0), visible = colors.map(() => 0);
  for (const next of [...input.history.slice(1), ...(input.history.length ? [input.units] : [])]) {
    const knowledge = input.revealAt !== null && step >= input.revealAt ? visible : original;
    let found = false;
    for (let from = 0; from < previous.length && !found; from++) for (let to = 0; to < previous.length; to++) {
      const p = memoryPour(previous, colors, knowledge, from, to);
      if (p && JSON.stringify(transferUnits(previous, p)) === JSON.stringify(next)) { found = true; break; }
    }
    if (!found) throw new Error('Illegal memory history');
    previous = next; step++;
  }
  const game = gameOf(createSession(puzzle.level), input.units, input.revealed, input.history.map(b => boardOf(b, colors)), input.offset);
  if (input.phase === 'observe' && (input.pours || input.peeks || input.history.length || input.offset || input.judgement !== 'hidden')
    || input.judgement !== 'hidden' && input.phase !== 'play' || input.judgement === 'correct' && game.status !== 'solved'
    || input.judgement === 'wrong' && (game.status === 'solved' || input.revealAt !== input.offset + input.history.length)) throw new Error('Invalid memory judgement');
  return Object.freeze({ ...input, puzzle, game, units: freezeUnits(input.units), history: Object.freeze(input.history.map(freezeUnits)), revealed: Object.freeze([...input.revealed]) });
}
/** Verify recorded quantities and destinations, including the automatic answer boundary. */
export function replayMemory(puzzle: MemoryPuzzle, route: readonly Pour[]): MemorySession {
  let state = readyMemory(createMemory(puzzle));
  for (const p of route) {
    const accepted = moveMemory(state, p.source, p.target);
    if (!accepted || accepted.event.pour.source !== p.source || accepted.event.pour.target !== p.target
      || accepted.event.pour.amount !== p.amount || accepted.event.pour.color !== p.color) throw new Error('Invalid black memory route');
    state = accepted.session;
  }
  if (state.judgement !== 'correct') throw new Error('Incomplete black memory route');
  return state;
}
