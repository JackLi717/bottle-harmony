import { validateMemoryPuzzle, type MemoryPuzzle } from './memory.ts';
import { canonicalRatingBoard, ratingAnswer, ratingApply, ratingColor, ratingKey, ratingMoves, ratingSolved, searchRatingBoard,
  type RatingBoard, type RatingBudget, type RatingMove, type RatingSearch } from './memoryRatingSearch.ts';

export const MEMORY_DIFFICULTY_MODEL = 'memory-bridge-decision-v1';
export const MEMORY_SCORE_WEIGHTS = { memory: 0.6, sorting: 0.4 } as const;
export type MemoryLoad = {
  initialAssignments: number; answerAssignments: number; informationBits: number;
  peakTrackedBottles: number; blackTransfers: number; repeatedTransfers: number; blackBurials: number;
  bridgeTransfers: number; meanLastContact: number;
  information: number; tracking: number; confusion: number; retention: number; total: number;
};
export type MemoryDecision = {
  moveIndex: number; choices: number; safe: number; costly: number; terminalWrong: number;
  bridges: number; safeBridges: number; unknown: number;
};
export type MemoryRating = {
  model: typeof MEMORY_DIFFICULTY_MODEL; id: string; number: number; key: string;
  status: 'rated' | 'unknown'; reason: 'states' | 'time' | null;
  canonicalBoard: RatingBoard; route: RatingMove[]; shortestMoves: number | null;
  memory: MemoryLoad | null; decisions: MemoryDecision[];
  sorting: { choices: number; space: number; operations: number; total: number } | null;
  combined: number | null;
  bridgeComparison: { status: RatingSearch['status']; withoutBridgesMoves: number | null; savedMoves: number | null } | null;
};
export function ratingBoard(puzzle: MemoryPuzzle): RatingBoard {
  let id = 0;
  return puzzle.level.bottles.map(b => b.layers.map(color => puzzle.level.colors.indexOf(color) * 2 + (puzzle.masks.includes(id++) ? 1 : 0)));
}
const factorial = (n: number) => { let value = 1; for (let i = 2; i <= n; i++) value *= i; return value; };
const capped = (value: number) => Math.max(0, Math.min(1, value));

/** Count indistinguishable-color assignments consistent with visible portions
 * and four portions per color. No assumption that the player recalled a label. */
export function hiddenAssignments(board: RatingBoard): number {
  const hidden = board.flat().filter(code => code % 2), counts = new Map<number, number>();
  hidden.forEach(code => counts.set(ratingColor(code), (counts.get(ratingColor(code)) ?? 0) + 1));
  return factorial(hidden.length) / [...counts.values()].reduce((n, count) => n * factorial(count), 1);
}
/** Count initial label assignments that would pass this public final layout.
 * An all-black completed bottle can represent any still-available whole color. */
export function answerAssignments(start: RatingBoard, end: RatingBoard): number {
  if (!ratingAnswer(end)) throw new Error('Missing public answer');
  const remaining = new Map<number, number>();
  start.flat().filter(c => c % 2).forEach(c => remaining.set(ratingColor(c), (remaining.get(ratingColor(c)) ?? 0) + 1));
  let allBlack = 0;
  for (const b of end.filter(b => b.length)) {
    const visible = b.find(c => !(c % 2));
    if (visible === undefined) { allBlack++; continue; }
    const color = ratingColor(visible), count = b.filter(c => c % 2).length;
    remaining.set(color, (remaining.get(color) ?? 0) - count);
  }
  if ([...remaining.values()].some(n => n < 0 || n !== 0 && n !== 4)) return 0;
  return [...remaining.values()].filter(n => n === 4).length === allBlack ? factorial(allBlack) : 0;
}
/** A conservative route-conditioned memory proxy. Whole-color deductions and
 * interchangeable valid answers reduce information; steps are decisions, not seconds. */
export function memoryLoad(start: RatingBoard, route: readonly RatingMove[]): MemoryLoad {
  let nextId = 0, units = start.map(b => b.map(() => nextId++)), board = start;
  const codes = start.flat(), hidden = codes.flatMap((c, id) => c % 2 ? [id] : []), transfers = codes.map(() => 0), contacts = codes.map(() => 0);
  let peakTrackedBottles = 0, blackBurials = 0, bridgeTransfers = 0;
  for (const [index, move] of route.entries()) {
    if (!ratingMoves(board).some(m => m.source === move.source && m.target === move.target && m.amount === move.amount && m.code === move.code)) throw new Error('Invalid rating route');
    const moved = units[move.source].slice(-move.amount), receiver = units[move.target].at(-1);
    if (receiver !== undefined && codes[receiver] % 2) { contacts[receiver] = index + 1; blackBurials++; }
    if (receiver !== undefined && ratingColor(codes[receiver]) !== ratingColor(move.code)) bridgeTransfers++;
    moved.forEach(id => { if (codes[id] % 2) { transfers[id]++; contacts[id] = index + 1; } });
    // Full true-color bottles with a visible anchor are an optimistic mental chunk.
    peakTrackedBottles = Math.max(peakTrackedBottles, units.filter((b, i) => b.some(id => codes[id] % 2)
      && !(board[i].length === 4 && board[i].some(c => !(c % 2)) && board[i].every(c => ratingColor(c) === ratingColor(board[i][0])))).length);
    units = units.map(b => [...b]); units[move.target].push(...units[move.source].splice(-move.amount));
    board = ratingApply(board, move);
  }
  if (!ratingSolved(board)) throw new Error('Incomplete rating route');
  const initialAssignments = hiddenAssignments(start), accepted = answerAssignments(start, board);
  if (!accepted) throw new Error('True route excluded from answer assignments');
  const informationBits = Math.log2(initialAssignments / accepted), gate = capped(informationBits / 3);
  const blackTransfers = hidden.reduce((n, id) => n + transfers[id], 0);
  const repeatedTransfers = hidden.reduce((n, id) => n + Math.max(0, transfers[id] - 1), 0);
  const meanLastContact = hidden.length ? hidden.reduce((n, id) => n + contacts[id], 0) / hidden.length : 0;
  const information = Math.round(35 * capped(informationBits / 22));
  const tracking = Math.round(25 * capped((peakTrackedBottles - 1) / 5) * gate);
  const confusion = Math.round(25 * capped((repeatedTransfers + blackBurials + bridgeTransfers) / Math.max(1, hidden.length * 1.5)) * gate);
  const retention = Math.round(15 * capped(meanLastContact / 24) * gate);
  return { initialAssignments, answerAssignments: accepted, informationBits, peakTrackedBottles, blackTransfers, repeatedTransfers,
    blackBurials, bridgeTransfers, meanLastContact, information, tracking, confusion, retention, total: information + tracking + confusion + retention };
}

/** Exact black-rule shortest route plus exact <=2-extra-move choice checks.
 * A complete bounded search can prove >=3 extra moves, without proving global
 * impossibility. An exhausted time/state budget never contributes difficulty. */
export function evaluateMemoryDifficulty(puzzle: MemoryPuzzle, budget: RatingBudget = {}): MemoryRating {
  validateMemoryPuzzle(puzzle);
  const board = canonicalRatingBoard(ratingBoard(puzzle));
  if (ratingAnswer(board)) throw new Error('Opening already looks complete; choose a meaningful memory layout');
  const report: MemoryRating = { model: MEMORY_DIFFICULTY_MODEL, id: puzzle.level.id, number: puzzle.number, key: ratingKey(board),
    status: 'unknown', reason: null, canonicalBoard: board, route: [], shortestMoves: null, memory: null, decisions: [], sorting: null, combined: null, bridgeComparison: null };
  const result = searchRatingBoard(board, budget, puzzle.solution.length);
  if (result.status === 'unknown') return { ...report, reason: result.reason };
  if (result.status !== 'solved') throw new Error('Stored memory route is not a valid solution bound');
  report.route = result.route; report.shortestMoves = result.route.length;
  report.memory = memoryLoad(board, result.route);
  const restricted = searchRatingBoard(board, budget, puzzle.solution.length, false);
  if (restricted.status === 'solved' && restricted.route.length < result.route.length) throw new Error('Bridge search optimality mismatch');
  report.bridgeComparison = { status: restricted.status, withoutBridgesMoves: restricted.status === 'solved' ? restricted.route.length : null,
    savedMoves: restricted.status === 'solved' ? restricted.route.length - result.route.length : null };
  const states = [board]; result.route.forEach(m => states.push(ratingApply(states.at(-1)!, m)));
  const samples = [...new Set([0, Math.floor(result.route.length / 3), Math.floor(2 * result.route.length / 3)])];
  for (const moveIndex of samples) {
    const current = states[moveIndex], remaining = result.route.length - moveIndex, seen = new Set<string>();
    const decision: MemoryDecision = { moveIndex, choices: 0, safe: 0, costly: 0, terminalWrong: 0, bridges: 0, safeBridges: 0, unknown: 0 };
    for (const move of ratingMoves(current)) {
      const next = ratingApply(current, move), key = ratingKey(next);
      if (seen.has(key) || moveIndex && key === ratingKey(states[moveIndex - 1])) continue;
      seen.add(key); decision.choices++;
      const receiver = current[move.target].at(-1), bridge = receiver !== undefined && ratingColor(receiver) !== ratingColor(move.code);
      if (bridge) decision.bridges++;
      if (ratingAnswer(next) && !ratingSolved(next)) { decision.terminalWrong++; continue; }
      const solved = key === ratingKey(states[moveIndex + 1])
        ? { status: 'solved', route: result.route.slice(moveIndex + 1), reason: null } as const
        : searchRatingBoard(next, budget, remaining + 1);
      if (solved.status === 'unknown') { decision.unknown++; report.reason ??= solved.reason; }
      else if (solved.status === 'solved') { decision.safe++; if (bridge) decision.safeBridges++; }
      else decision.costly++; // >=3 extra moves, possibly unsolvable; never claim which.
    }
    report.decisions.push(decision);
  }
  if (report.decisions.some(d => d.unknown)) return report;
  const risks = report.decisions.map(d => d.choices ? (d.costly + d.terminalWrong) / d.choices * capped(Math.log2(d.choices + 1) / 3) : 0);
  const choices = Math.round(60 * (.6 * Math.max(...risks) + .4 * risks.reduce((a, b) => a + b, 0) / risks.length));
  const space = Math.round(25 * states.slice(0, -1).filter(b => b.every(v => v.length)).length / result.route.length);
  const operations = Math.round(15 * capped((result.route.length - 6) / 24));
  report.sorting = { choices, space, operations, total: choices + space + operations };
  report.combined = Math.round(MEMORY_SCORE_WEIGHTS.memory * report.memory.total + MEMORY_SCORE_WEIGHTS.sorting * report.sorting.total);
  report.status = 'rated';
  return report;
}
