/** Assemble and replay a small offline set of constructed risk-gap puzzles. */
import { readFileSync, writeFileSync } from 'node:fs';
import { getPour, isSolved, type Board, type Pour } from '../src/game/rules.ts';
import { replaySolution } from '../src/game/solver.ts';

const CAPACITY = 4;
const sourceFiles = [
  'risk-gap-20.json', 'lifted-four-color.json', 'lifted-five-color.json', 'lifted-six-color.json',
];
function permutations<T>(items: T[]): T[][] {
  if (!items.length) return [[]];
  return items.flatMap((item, index) => permutations(items.filter((_, other) => other !== index))
    .map(rest => [item, ...rest]));
}
function canonical(board: Board): string {
  const colors = [...new Set(board.flat())].sort();
  let best: string | null = null;
  for (const renamed of permutations(colors)) {
    const codes = new Map(colors.map((color, index) => [color, renamed[index]]));
    const bottles = board.map(bottle => bottle.map(color => codes.get(color)!).join(''));
    const key = bottles.slice(0, -1).sort().join('|') + '#' + bottles.at(-1)!;
    if (best === null || key < best) best = key;
  }
  return best!;
}
function replayFrozen(start: Board, route: readonly Pour[]): void {
  let board = start;
  const fixed = board.length - 1;
  for (const action of route) {
    const ordinary = getPour(board, action.source, action.target, CAPACITY);
    const amount = ordinary && action.source === fixed ? Math.min(ordinary.amount, board[fixed].length - 1) : ordinary?.amount;
    if (!ordinary || !amount || amount !== action.amount || ordinary.color !== action.color) throw new Error('Invalid frozen route');
    board = board.map((bottle, index) => index === action.source ? bottle.slice(0, -amount)
      : index === action.target ? [...bottle, ...Array(amount).fill(action.color)] : [...bottle]);
  }
  if (!isSolved(board, CAPACITY)) throw new Error('Frozen route did not solve');
}

const samples = [];
const seen = new Set<string>();
for (const file of sourceFiles) {
  const content = JSON.parse(readFileSync(new URL(`../experiments/solid-target/${file}`, import.meta.url), 'utf8'));
  const options = file === 'risk-gap-20.json' ? content.samples : content.examples;
  let chosen = 0;
  for (const source of options) {
    if (chosen === 5) break;
    const board: Board = source.board;
    const structure = canonical(board);
    if (seen.has(structure)) continue;
    seen.add(structure);
    const colors = new Set(board.flat());
    if (board.length !== colors.size + 1 || board.some(bottle => !bottle.length || bottle.length > CAPACITY)
      || [...colors].some(color => board.flat().filter(layer => layer === color).length !== CAPACITY)
      || board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2)))
      throw new Error(`Invalid constructed board from ${file}`);
    const meltedRoute: Pour[] = source.ordinaryRoute ?? source.meltedRoute;
    const frozenRoute: Pour[] = source.frozenRoute;
    replaySolution(board, meltedRoute, CAPACITY);
    replayFrozen(board, frozenRoute);
    const meltedMoves = source.ordinaryMoves ?? source.meltedMoves;
    if (meltedRoute.length !== meltedMoves || frozenRoute.length !== source.frozenMoves) throw new Error('Route length mismatch');
    const meltedChoices = source.ordinaryFirstChoices ?? source.ordinaryChoices;
    const frozenChoices = source.frozenFirstChoices ?? source.frozenChoices;
    if (meltedChoices.dead !== 0 || frozenChoices.dead < 2 || source.riskIncrease !== undefined && source.riskIncrease < 0.5
      || source.riskGap !== undefined && source.riskGap < 0.5) throw new Error('Risk gap below selection threshold');
    samples.push({ number: samples.length + 1, colors: colors.size, bottles: board, frozenBottle: board.length - 1,
      frozenBottomColor: board.at(-1)![0], meltedMoves, frozenMoves: source.frozenMoves,
      meltedFirstChoices: meltedChoices, frozenFirstChoices: frozenChoices,
      meltedRoute, frozenRoute, sourceFile: file });
    chosen++;
  }
  if (chosen !== 5) throw new Error(`Could not select five distinct puzzles from ${file}`);
}
const output = { experiment: 'solid-target-distributed-space-v1', capacity: CAPACITY, actualEmptyBottles: 0,
  emptyCapacity: CAPACITY, frozenDepth: 1, samples };
writeFileSync(new URL('../experiments/solid-target/constructed-20.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
process.stdout.write(JSON.stringify({ count: samples.length, byColors: samples.reduce((counts, sample) =>
  (counts[sample.colors] = (counts[sample.colors] ?? 0) + 1, counts), {} as Record<number, number>),
  meltedDead: samples.reduce((sum, sample) => sum + sample.meltedFirstChoices.dead, 0),
  frozenDead: samples.reduce((sum, sample) => sum + sample.frozenFirstChoices.dead, 0) }) + '\n');
