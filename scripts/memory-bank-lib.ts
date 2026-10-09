import assert from 'node:assert/strict';
import { contentMetrics, parseGeneratedContent, structureKey, type GeneratedContent } from '../src/game/generation.ts';
import { initialBoard, type LevelDefinition } from '../src/game/model.ts';
import { validateMemoryPuzzle, replayMemory, MEMORY_RULES, type MemoryPuzzle } from '../src/game/memory.ts';
import { MEMORY_CATALOG, MEMORY_COUNT } from '../src/game/memoryCatalog.ts';
import { applyPour, getPour, isSolved, type Pour } from '../src/game/rules.ts';
import { replaySolution } from '../src/game/solver.ts';
import { MEMORY_PROTOTYPES } from './memory-prototypes.ts';

export type Target = { number: number; colors: number; hidden: number; bottles: number; grade: number; role: string; skill: string };
export type RouteEvidence = { firstTransfer: number[]; blackTransfers: number; visibleIntoBlack: number; hiddenAfterEachMove: number[] };
export type MemoryEvidence = { hidden: number; hiddenBottles: number; hiddenColors: number; depthHistogram: number[];
  reference: RouteEvidence; alternative: RouteEvidence; sorting: ReturnType<typeof contentMetrics>;
  structureKey: string; maskStructureKey: string; lighterVariant: { masks: number[]; hidden: number } };
export type MemoryRecord = MemoryPuzzle & { target: Target; source: GeneratedContent | { prototype: string };
  ordinaryReference: readonly Pour[]; ordinaryAlternative: readonly Pour[]; alternative: readonly Pour[]; evidence: MemoryEvidence };
export type MemoryBank = { id: string; rules: string; recipe: string; records: MemoryRecord[] };
const early = [
  [2,1,1,1], [3,2,2,1], [3,2,2,1], [3,3,3,2], [3,3,3,2], [3,3,3,2], [3,2,2,1], [4,2,2,2], [4,3,3,2], [4,4,4,2],
  [4,3,3,2], [4,3,3,2], [4,4,4,2], [4,4,2,3], [4,5,3,3], [4,6,4,3], [4,4,4,2], [5,4,4,2], [5,5,3,3], [5,6,3,3],
  [5,4,4,2], [5,4,4,2], [5,6,3,3], [5,7,4,3], [5,7,4,3], [5,8,4,3], [5,6,3,3], [5,7,4,3], [5,8,4,3], [5,8,4,4],
];
const peaks = [8,9,10,10,11,12,12];
export function memoryTargets(): Target[] {
  return Array.from({ length: MEMORY_COUNT }, (_, i) => {
    const number = i + 1, position = i % 10 + 1, unit = Math.floor(i / 10);
    let [colors, hidden, bottles, grade] = early[i] ?? [];
    if (i >= 30) {
      const peak = peaks[unit - 3];
      hidden = [peak-2,peak-2,peak-2,peak-1,peak-1,peak,peak-2,peak-1,peak,peak][position-1];
      const maximum = [6,6,6,6,7,7,8][unit-3];
      colors = position < 3 ? Math.max(5, maximum - (unit === 3 || unit === 7 || unit === 9 ? 1 : 0)) : maximum;
      bottles = Math.ceil(hidden / 2); grade = [1,2,7].includes(position) || position === 3 && [3,7,9].includes(unit) ? 3 : 4;
    }
    const role = number <= 3 ? 'teaching' : position === 6 ? 'subpeak' : position === 10 ? 'peak' : [1,2,7].includes(position) ? 'recovery' : 'ascent';
    const skill = number <= 3 ? (number === 1 ? 'single-position' : 'paired-bottles') : grade <= 2 ? (position % 2 ? 'paired-bottles' : 'cross-bottle')
      : position === 6 ? 'delayed-use' : position === 9 ? 'memory-deduction' : grade === 4 ? 'combined-relations' : 'layer-tracking';
    return { number, colors, hidden, bottles, grade, role, skill };
  });
}

export const prototypePositions = new Map([[1,1], [2,2], [14,3], [10,4], [20,5]]);
export function retainedPrototype(number: number) {
  const index = prototypePositions.get(number);
  return index ? MEMORY_PROTOTYPES[index - 1] : undefined;
}

/** Independent quantity/identity replay, without runtime memory moves or reveal logic. */
export function blackRoute(level: LevelDefinition, masks: readonly number[], route: readonly Pour[]): RouteEvidence {
  const colors = initialBoard(level).flat(), units = level.bottles.map((b, i) => b.layers.map((_, d) => i * 4 + d));
  const hidden = new Set(masks), firstTransfer = masks.map(() => -1), hiddenAfterEachMove = [masks.length];
  let blackTransfers = 0, visibleIntoBlack = 0;
  route.forEach((p, step) => {
    const from = units[p.source], to = units[p.target];
    assert.ok(from?.length && to && from !== to && to.length < 4, 'Invalid black route bottles');
    const id = from.at(-1)!, receiver = to.at(-1), black = hidden.has(id);
    assert.equal(p.color, colors[id]);
    if (receiver !== undefined) assert.ok(black || hidden.has(receiver) || colors[receiver] === p.color, 'Invalid visible contact');
    let count = 1;
    if (!black) while (count < from.length && !hidden.has(from[from.length - 1 - count]) && colors[from[from.length - 1 - count]] === p.color) count++;
    assert.equal(p.amount, Math.min(count, 4 - to.length), 'Wrong black transfer quantity');
    if (black) blackTransfers++;
    else if (receiver !== undefined && hidden.has(receiver)) visibleIntoBlack++;
    const moved = from.splice(-p.amount);
    masks.forEach((unit, index) => { if (firstTransfer[index] < 0 && moved.includes(unit)) firstTransfer[index] = step + 1; });
    to.push(...moved); hiddenAfterEachMove.push(masks.length);
  });
  assert.ok(isSolved(units.map(b => b.map(id => colors[id]))), 'Incomplete black route');
  return { firstTransfer, blackTransfers, visibleIntoBlack, hiddenAfterEachMove };
}
/** Expand a verified ordinary solution at hidden-unit boundaries, preserving the whole route. */
export function expandMemoryRoute(level: LevelDefinition, masks: readonly number[], ordinary: readonly Pour[]): readonly Pour[] {
  let board = initialBoard(level), id = 0;
  const units = board.map(b => b.map(() => id++)), hidden = new Set(masks), result: Pour[] = [];
  for (const p of ordinary) {
    assert.deepEqual(getPour(board, p.source, p.target), p);
    let remaining = p.amount;
    while (remaining) {
      const from = units[p.source], to = units[p.target];
      let amount = 1;
      if (!hidden.has(from.at(-1)!)) while (amount < from.length && !hidden.has(from[from.length - 1 - amount]) && board[p.source][from.length - 1 - amount] === p.color) amount++;
      amount = Math.min(amount, remaining, 4 - to.length);
      result.push({ ...p, amount }); to.push(...from.splice(-amount)); remaining -= amount;
    }
    board = applyPour(board, p);
  }
  blackRoute(level, masks, result);
  return Object.freeze(result);
}
export function analyzeMemory(puzzle: MemoryPuzzle, alternative: readonly Pour[]): MemoryEvidence {
  const colors = initialBoard(puzzle.level).flat(), positions = new Set(puzzle.masks.map(id => Math.floor(id / 4)));
  const depthHistogram = [0, 1, 2, 3].map(d => puzzle.masks.filter(id => id % 4 === d).length);
  const maskStructureKey = puzzle.level.bottles.map((b, i) => b.layers.map((_, d) => puzzle.masks.includes(i * 4 + d) ? '1' : '0').join('')).sort().join('/');
  const lighter = puzzle.masks.slice(0, Math.max(0, puzzle.masks.length - 2));
  return { hidden: puzzle.masks.length, hiddenBottles: positions.size, hiddenColors: new Set(puzzle.masks.map(id => colors[id])).size, depthHistogram,
    reference: blackRoute(puzzle.level, puzzle.masks, puzzle.solution), alternative: blackRoute(puzzle.level, puzzle.masks, alternative),
    sorting: contentMetrics(puzzle.level, puzzle.solution.length), structureKey: structureKey(puzzle.level), maskStructureKey,
    lighterVariant: { masks: lighter, hidden: lighter.length } };
}
export function acceptsEvidence(target: Target, e: MemoryEvidence) {
  return e.hidden === target.hidden && e.hiddenBottles === target.bottles && (target.hidden === 1 || e.hiddenColors >= 2)
    && e.depthHistogram[3] > 0 && (target.hidden < 4 || e.depthHistogram.every(n => n > 0))
    && [e.reference, e.alternative].every(r => r.firstTransfer.filter(n => n > 0).length >= Math.ceil(target.hidden / 2));
}
export function decodeMemoryBank(input: unknown): MemoryBank {
  const bank = input as MemoryBank;
  assert.equal(bank.id, MEMORY_CATALOG); assert.equal(bank.rules, MEMORY_RULES); assert.equal(bank.recipe, 'memory-dispersed-wave-v1');
  assert.equal(bank.records.length, MEMORY_COUNT);
  const targets = memoryTargets(), keys = new Set<string>(), ids = new Set<string>(), depths = [0, 0, 0, 0];
  bank.records.forEach((p, i) => {
    assert.deepEqual(p.target, targets[i]); assert.equal(p.number, i + 1); assert.equal(p.skill, p.target.skill);
    const original = retainedPrototype(p.number);
    if (original) { assert.deepEqual(p.source, { prototype: original.level.id }); assert.deepEqual(p.level, original.level); }
    else { const source = parseGeneratedContent(p.source); assert.deepEqual(p.level, source.level); assert.deepEqual(p.ordinaryReference, source.solution); }
    validateMemoryPuzzle(p); assert.equal(p.level.colors.length, p.target.colors);
    replaySolution(initialBoard(p.level), p.ordinaryReference); replaySolution(initialBoard(p.level), p.ordinaryAlternative);
    assert.deepEqual(p.solution, expandMemoryRoute(p.level, p.masks, p.ordinaryReference));
    assert.deepEqual(p.alternative, expandMemoryRoute(p.level, p.masks, p.ordinaryAlternative));
    replayMemory(p, p.solution); replayMemory(p, p.alternative);
    const evidence = analyzeMemory(p, p.alternative);
    assert.deepEqual(p.evidence, evidence); assert.ok(acceptsEvidence(p.target, evidence), `Memory target ${p.number}`);
    assert.notEqual(p.solution[0].source, p.alternative[0].source, 'Alternative must change the opening source');
    assert.ok(!keys.has(evidence.structureKey), `Duplicate board ${p.number}`); keys.add(evidence.structureKey);
    assert.ok(!ids.has(p.level.id)); ids.add(p.level.id);
    evidence.depthHistogram.forEach((n, d) => depths[d] += n);
    if (i > 2) {
      const previous = bank.records[i - 1];
      assert.ok(p.target.colors <= previous.target.colors + 1); assert.ok(p.target.hidden <= previous.target.hidden + 2);
      if (p.target.colors > previous.target.colors) assert.ok(p.target.hidden <= previous.target.hidden);
    }
  });
  const total = depths.reduce((a, b) => a + b, 0);
  assert.ok(depths.every(n => n / total >= .15 && n / total <= .35), `Unbalanced mask depths: ${depths}`);
  return bank;
}
