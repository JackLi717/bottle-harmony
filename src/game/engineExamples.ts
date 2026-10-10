import { parseSortingPuzzle, type SortingGoal, type SortingPuzzle } from './engineModel.ts';

/** Internal acceptance fixtures, not a published bank or a progression change. */
export function engineFixture(id: string, board: readonly (readonly string[])[], options: {
  capacities?: readonly number[]; goal?: SortingGoal; amount?: 'run' | 'one'; locked?: readonly number[];
  hidden?: readonly (readonly [number, number])[]; triggers?: SortingPuzzle['triggers'];
  sources?: readonly boolean[]; receivers?: readonly boolean[]; any?: readonly number[]; fixed?: readonly number[]; acceptColors?: readonly (readonly string[] | null)[];
} = {}): SortingPuzzle {
  const units = board.flatMap((colors, b) => colors.map((color, d) => ({ id: `u${b}_${d}`, color })));
  const containers = board.map((colors, i) => ({ id: `b${i}`, capacity: options.capacities?.[i] ?? 4,
    canSource: options.sources?.[i] ?? true, canReceive: options.receivers?.[i] ?? true, receive: options.any?.includes(i) ? 'any' : 'same',
    fixed: options.fixed?.includes(i) ?? false, units: colors.map((_, d) => `u${i}_${d}`), acceptColors: options.acceptColors?.[i] ?? null }));
  return parseSortingPuzzle({ format: 'bottle-harmony-engine', version: 1, rules: 'sorting-v1', id, revision: 'acceptance-v1',
    colors: [...new Set(units.map(u => u.color))], units, containers, amount: options.amount ?? 'run', goal: options.goal ?? { type: 'sort', containers: containers.map(c => c.id) },
    locked: (options.locked ?? []).map(i => `b${i}`), hidden: (options.hidden ?? []).map(([b, d]) => `u${b}_${d}`), triggers: options.triggers ?? [] });
}
const groupedBoard = [['coral'], ['coral', 'coral', 'coral'], ['jade', 'jade', 'amber', 'amber'], ['amber', 'amber', 'jade', 'jade'], []];
export const ENGINE_EXAMPLES = Object.freeze([
  engineFixture('engine-key', groupedBoard, { locked: [2, 3], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2', 'b3'] }] }),
  engineFixture('engine-cover', groupedBoard, { locked: [2, 3], triggers: [{ id: 'cloth', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b2', 'b3'] }] }),
  engineFixture('engine-reveal', [['jade', 'coral', 'coral', 'jade'], ['coral', 'jade', 'jade', 'coral'], [], []], { hidden: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] }),
  engineFixture('engine-collect', [['coral', 'coral', 'coral', 'coral'], ['coral', 'coral', 'coral', 'coral'], ['coral', 'coral', 'coral', 'coral'], [], ['jade', 'amber'], ['amber', 'jade'], []],
    { capacities: [4, 5, 6, 12, 4, 4, 5], sources: [true, true, true, false], fixed: [3], acceptColors: [null, null, null, ['coral']], goal: { type: 'collect', container: 'b3', color: 'coral', count: 12, exact: true, exclusive: true } }),
  engineFixture('engine-sequence', [['coral', 'coral'], ['amber', 'amber'], ['jade', 'jade'], []], { capacities: [4, 4, 4, 6], sources: [true, true, true, false], fixed: [3], any: [3], amount: 'one',
    goal: { type: 'sequence', container: 'b3', colors: ['coral', 'amber', 'jade', 'coral', 'amber', 'jade'] } }),
]);
