/** Exhaustive three-color comparison for the offline solid-bottom experiment. */
import { writeFileSync } from 'node:fs';
import { getPour, type Board } from '../src/game/rules.ts';

const CAPACITY = 4;
const LIMIT = 1_000_000;
const solved: Board = [['B', 'B', 'B', 'B'], ['C', 'C', 'C', 'C'], [], ['A', 'A', 'A', 'A']];

function stateKey(board: Board, frozen: boolean): string {
  const movable = board.slice(0, frozen ? -1 : undefined).map(bottle => bottle.join('')).sort().join('|');
  return frozen ? `${movable}#${board.at(-1)!.join('')}` : movable;
}

/** A predecessor is accepted only if the game's maximal forward pour exactly
 * recreates the current board. The frozen bottle is always the last bottle. */
function predecessors(board: Board, frozen: boolean): Board[] {
  const results: Board[] = [];
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    if (source === target || board[source].length === CAPACITY || !board[target].length) continue;
    const color = board[target].at(-1)!;
    let topRun = 0;
    for (let i = board[target].length - 1; i >= 0 && board[target][i] === color; i--) topRun++;
    for (let amount = 1; amount <= Math.min(topRun, CAPACITY - board[source].length); amount++) {
      if (frozen && target === board.length - 1 && board[target].length - amount < 1) continue;
      const prior = board.map((bottle, index) => index === source ? [...bottle, ...Array(amount).fill(color)]
        : index === target ? bottle.slice(0, -amount) : [...bottle]);
      const ordinaryPour = getPour(prior, source, target, CAPACITY);
      if (!ordinaryPour) continue;
      const forwardAmount = frozen && source === board.length - 1
        ? Math.min(ordinaryPour.amount, prior[source].length - 1) : ordinaryPour.amount;
      if (forwardAmount === amount) results.push(prior);
    }
  }
  return results;
}

function distancesToGoal(frozen: boolean): { states: Board[]; distances: Map<string, number>; complete: boolean } {
  const states: Board[] = [solved];
  const distances = new Map<string, number>([[stateKey(solved, frozen), 0]]);
  let cursor = 0;
  for (; cursor < states.length && states.length < LIMIT; cursor++) {
    const board = states[cursor], distance = distances.get(stateKey(board, frozen))!;
    for (const prior of predecessors(board, frozen)) {
      const key = stateKey(prior, frozen);
      if (distances.has(key)) continue;
      distances.set(key, distance + 1);
      states.push(prior);
    }
  }
  return { states, distances, complete: cursor === states.length };
}

const ordinary = distancesToGoal(false);
const frozen = distancesToGoal(true);
if (!ordinary.complete || !frozen.complete) throw new Error('Enumeration limit reached; no exhaustive conclusion');

const byEmpty: Record<string, { states: number; longerFrozen: number; maxExtraMoves: number }> = {};
let longerFrozen = 0, unmatched = 0, maxExtraMoves = 0;
let example: Board | null = null;
for (const board of frozen.states) {
  const normalDistance = ordinary.distances.get(stateKey(board, false));
  if (normalDistance === undefined) { unmatched++; continue; }
  const frozenDistance = frozen.distances.get(stateKey(board, true))!;
  const extraMoves = frozenDistance - normalDistance;
  const emptyBottles = board.filter(bottle => bottle.length === 0).length;
  const bucket = byEmpty[emptyBottles] ??= { states: 0, longerFrozen: 0, maxExtraMoves: 0 };
  bucket.states++;
  if (extraMoves > 0) { longerFrozen++; bucket.longerFrozen++; }
  bucket.maxExtraMoves = Math.max(bucket.maxExtraMoves, extraMoves);
  if (extraMoves > maxExtraMoves) { maxExtraMoves = extraMoves; example = board; }
}
if (unmatched) throw new Error('Frozen-solvable state missing ordinary solution');
const result = { colors: 3, capacity: CAPACITY, totalBottles: 4, ordinaryStructures: ordinary.states.length,
  frozenStructures: frozen.states.length, longerFrozen, maxExtraMoves, byEmpty, example };
writeFileSync(new URL('../experiments/solid-target/exhaustive-three-color.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result) + '\n');
