import assert from 'node:assert/strict';
import { contentMetrics, parseGeneratedContent, structureKey, type GeneratedContent } from '../src/game/generation.ts';
import { initialBoard, type LevelDefinition } from '../src/game/model.ts';
import { validateMemoryPuzzle, MEMORY_RULES, type MemoryPuzzle } from '../src/game/memory.ts';
import { MEMORY_CATALOG, MEMORY_COUNT } from '../src/game/memoryCatalog.ts';
import { applyPour, getLegalPours, type Pour } from '../src/game/rules.ts';
import { replaySolution } from '../src/game/solver.ts';
import { MEMORY_PROTOTYPES } from './memory-prototypes.ts';

export type Target = { number: number; colors: number; hidden: number; bottles: number; grade: number; role: string; skill: string };
export type Reveal = { first: number[]; remaining: number[]; maxDelay: number; meanDelay: number; deductionSteps: number[] };
export type MemoryEvidence = { hidden: number; hiddenBottles: number; hiddenColors: number; depths: number[];
  orderedPairs: number; linkedColors: number; inferableAtStart: boolean; reference: Reveal; alternative: Reveal;
  sorting: ReturnType<typeof contentMetrics>; structureKey: string; maskStructureKey: string;
  visibleControl: { masks: number[] }; lighterVariant: { masks: number[]; hidden: number } };
export type MemoryRecord = MemoryPuzzle & { target: Target; source: GeneratedContent | { prototype: string }; alternative: readonly Pour[]; evidence: MemoryEvidence };
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
      : position === 6 ? 'delayed-use' : position === 9 ? 'memory-deduction' : grade === 4 ? 'combined-relations' : 'bottom-order';
    return { number, colors, hidden, bottles, grade, role, skill };
  });
}
// Reuse the original boards and masks unchanged; numbering belongs to the current recipe.
export const prototypePositions = new Map([[1,1], [2,2], [14,3], [10,4], [20,5]]);
export function retainedPrototype(number: number) {
  const index = prototypePositions.get(number);
  return index ? MEMORY_PROTOTYPES[index - 1] : undefined;
}

/** Independent unit replay: no dependency on the runtime knowledge/undo implementation. */
export function revealRoute(level: LevelDefinition, masks: readonly number[], route: readonly Pour[]): Reveal {
  let board = initialBoard(level), id = 0;
  const units = board.map(b => b.map(() => id++)), colors = board.flat();
  const first = masks.map(() => -1), remaining: number[] = [], deductionSteps: number[] = [];
  function inspect(step: number) {
    masks.forEach((unit, m) => {
      if (first[m] >= 0) return;
      const b = units.findIndex(b => b.includes(unit)), depth = units[b].indexOf(unit);
      if (board[b].slice(depth).every(c => c === colors[unit])) first[m] = step;
    });
    const unknown = masks.filter((_, m) => first[m] < 0);
    remaining.push(unknown.length);
    // With exactly one outstanding color, conservation determines all remaining unknown colors.
    if (unknown.length >= 2 && new Set(unknown.map(u => colors[u])).size === 1) deductionSteps.push(step);
  }
  inspect(0);
  route.forEach((p, i) => { board = applyPour(board, p); units[p.target].push(...units[p.source].splice(-p.amount)); inspect(i+1); });
  replaySolution(initialBoard(level), route);
  assert.ok(first.every(n => n > 0), 'Every mask must start unknown and eventually be exposed');
  return { first, remaining, maxDelay: Math.max(...first), meanDelay: first.reduce((a,b) => a+b,0)/first.length, deductionSteps };
}
export function analyzeMemory(puzzle: MemoryPuzzle, alternative: readonly Pour[]): MemoryEvidence {
  const colors = initialBoard(puzzle.level).flat(), positions = new Set(puzzle.masks.map(id => Math.floor(id/4)));
  const depths = [...positions].sort((a,b) => a-b).map(b => puzzle.masks.filter(id => Math.floor(id/4) === b).length);
  const orderedPairs = [...positions].filter(b => puzzle.masks.includes(4*b+1) && colors[4*b] !== colors[4*b+1]).length;
  const hiddenColors = new Set(puzzle.masks.map(id => colors[id])).size;
  const linkedColors = puzzle.level.colors.filter(c => new Set(puzzle.masks.filter(id => colors[id] === c).map(id => Math.floor(id/4))).size > 1).length;
  const maskStructureKey = puzzle.level.bottles.map((b,i) => b.layers.map((_,d) => puzzle.masks.includes(i*4+d) ? '1' : '0').join('')).sort().join('/');
  const bottoms = puzzle.masks.filter(id => id % 4 === 0);
  const lighter = bottoms.length === puzzle.masks.length ? bottoms.slice(0,-1) : bottoms;
  return { hidden: puzzle.masks.length, hiddenBottles: positions.size, hiddenColors, depths, orderedPairs, linkedColors, inferableAtStart: hiddenColors === 1,
    reference: revealRoute(puzzle.level, puzzle.masks, puzzle.solution), alternative: revealRoute(puzzle.level, puzzle.masks, alternative),
    sorting: contentMetrics(puzzle.level, puzzle.solution.length), structureKey: structureKey(puzzle.level), maskStructureKey,
    visibleControl: { masks: [] }, lighterVariant: { masks: lighter, hidden: lighter.length } };
}
export function acceptsEvidence(target: Target, e: MemoryEvidence) {
  if (e.hidden !== target.hidden || e.hiddenBottles !== target.bottles) return false;
  if (target.grade >= 2 && e.inferableAtStart) return false;
  if (target.grade >= 3 && !e.orderedPairs) return false;
  if (target.grade === 4 && !e.linkedColors) return false;
  if ((target.skill === 'delayed-use' || target.grade === 4) && Math.min(e.reference.maxDelay,e.alternative.maxDelay) < (target.grade === 4 ? 8 : 6)) return false;
  if (target.skill === 'memory-deduction' && !e.reference.deductionSteps.length) return false;
  return true;
}
export function decodeMemoryBank(input: unknown): MemoryBank {
  const bank = input as MemoryBank;
  assert.equal(bank.id, MEMORY_CATALOG); assert.equal(bank.rules, MEMORY_RULES); assert.equal(bank.recipe, 'memory-ten-wave-v1');
  assert.equal(bank.records.length, MEMORY_COUNT);
  const targets = memoryTargets(), keys = new Set<string>(), ids = new Set<string>();
  bank.records.forEach((p, i) => {
    assert.deepEqual(p.target, targets[i]); assert.equal(p.number, i+1);
    const original = retainedPrototype(p.number);
    if (original) { assert.deepEqual(p.source, { prototype: original.level.id }); assert.deepEqual(p.level, original.level); assert.deepEqual(p.masks, original.masks); assert.equal(p.skill, original.skill); }
    else { const source = parseGeneratedContent(p.source); assert.deepEqual(p.level, source.level); assert.deepEqual(p.solution, source.solution); assert.equal(p.skill, p.target.skill); }
    validateMemoryPuzzle(p); assert.equal(p.level.colors.length,p.target.colors);
    assert.ok(p.level.bottles.slice(0,p.target.colors).every(b => b.layers.length === 4));
    assert.equal(p.level.bottles.length,p.target.colors+2);
    const e = analyzeMemory(p,p.alternative);
    assert.deepEqual(p.evidence,e); assert.ok(acceptsEvidence(p.target,e), `Memory target ${p.number}`);
    assert.notEqual(p.solution[0].source,p.alternative[0].source,'Alternative must change the opening source, not just swap empty bottles');
    assert.ok(getLegalPours(initialBoard(p.level)).some(q => JSON.stringify(q) === JSON.stringify(p.alternative[0])));
    assert.ok(!keys.has(e.structureKey), `Duplicate board ${p.number}`); keys.add(e.structureKey);
    assert.ok(!ids.has(p.level.id)); ids.add(p.level.id);
    if (i > 2) {
      const before = bank.records[i-1];
      assert.ok(p.target.colors <= before.target.colors+1, 'Add at most one color');
      assert.ok(p.target.hidden <= before.target.hidden+2, 'Add at most two hidden portions');
      if (p.target.colors > before.target.colors) assert.ok(p.target.hidden <= before.target.hidden, 'No simultaneous color/hidden growth');
    }
  });
  let peak = 0;
  for (let i=9;i<MEMORY_COUNT;i+=10) { const p=bank.records[i]; assert.ok(p.target.hidden>=peak); peak=p.target.hidden; }
  for (const p of bank.records) if (p.number>10 && p.target.role==='recovery') {
    const peak = bank.records[Math.floor((p.number-1)/10)*10 + ((p.number-1)%10===6 ? 5 : -1)];
    if (p.target.colors === peak.target.colors) assert.ok(p.solution.length <= peak.solution.length, `Sorting operations rise at recovery ${p.number}`);
    assert.ok(p.target.grade<peak.target.grade || p.target.hidden<peak.target.hidden, `No recovery at ${p.number}`);
  }
  return bank;
}
