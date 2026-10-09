import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseGeneratedContent } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { MEMORY_CATALOG } from '../src/game/memoryCatalog.ts';
import { MEMORY_RULES, validateMemoryPuzzle, type MemoryPuzzle } from '../src/game/memory.ts';
import { acceptsEvidence, analyzeMemory, decodeMemoryBank, expandMemoryRoute, memoryTargets, retainedPrototype, type MemoryBank, type MemoryRecord, type Target } from './memory-bank-lib.ts';

const mode = process.argv[2] ?? 'verify', path = process.argv[3] ?? 'assets/levels/memory-100.json';
if (mode !== 'build' && mode !== 'verify') throw new Error('Use memory:build or memory:verify');
const budget = { maxStates: 100000, maxMilliseconds: 30000 };
/** Fixed seed, dispersed bottles, nonadjacent depth pairs; successful selection is evidence-checked. */
function selectMasks(puzzle: MemoryPuzzle, target: Target, reference: MemoryPuzzle['solution'], alternative: MemoryPuzzle['solution']) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    let seed = (2026100900 + target.number * 2003 + attempt * 997) >>> 0;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const bottles = Array.from({ length: target.colors }, (_, i) => i);
    for (let i = bottles.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bottles[i], bottles[j]] = [bottles[j], bottles[i]]; }
    const masks = bottles.slice(0, target.bottles).flatMap((b, i) => {
      const pair = [[0, 2], [1, 3], [0, 3]][Math.floor(random() * 3)];
      return (i < target.hidden - target.bottles ? pair : [target.hidden === 1 ? 3 : Math.floor(random() * 4)]).map(d => b * 4 + d);
    }).sort((a, b) => a - b);
    const candidate = { ...puzzle, masks };
    try { validateMemoryPuzzle(candidate); } catch { continue; }
    const solution = expandMemoryRoute(puzzle.level, masks, reference), alt = expandMemoryRoute(puzzle.level, masks, alternative);
    const evidence = analyzeMemory({ ...candidate, solution }, alt);
    if (acceptsEvidence(target, evidence)) return { masks, solution, alternative: alt, evidence };
  }
  throw new Error(`No dispersed mask strategy for ${target.number}`);
}
if (mode === 'build') {
  // Existing physical boards retain their exact source. This is offline input reconstruction,
  // not a runtime save importer, compatibility layer, or migration.
  const input = JSON.parse(readFileSync(path, 'utf8')) as { records: MemoryRecord[] };
  const records = memoryTargets().map(target => {
    const previous = input.records[target.number - 1], original = retainedPrototype(target.number);
    const source = original ? { prototype: original.level.id } : parseGeneratedContent(previous.source);
    const level = original?.level ?? parseGeneratedContent(source).level;
    assert.deepEqual(level, previous.level);
    let ordinaryReference;
    if (original) {
      const solved = solveBoard(initialBoard(level), budget); assert.equal(solved.status, 'solved');
      if (solved.status !== 'solved') throw new Error('Unverified original memory board');
      ordinaryReference = solved.route;
    } else ordinaryReference = parseGeneratedContent(source).solution;
    const ordinaryAlternative = previous.ordinaryAlternative ?? previous.alternative;
    replaySolution(initialBoard(level), ordinaryAlternative);
    const puzzle = { number: target.number, level, masks: [], skill: target.skill, solution: ordinaryReference };
    const selected = selectMasks(puzzle, target, ordinaryReference, ordinaryAlternative);
    console.log(`${target.number}: H${selected.masks.length} depths=${selected.evidence.depthHistogram.join('/')} moves=${selected.solution.length}`);
    return { ...puzzle, ...selected, target, source, ordinaryReference, ordinaryAlternative };
  });
  const bank: MemoryBank = { id: MEMORY_CATALOG, rules: MEMORY_RULES, recipe: 'memory-dispersed-wave-v1', records };
  decodeMemoryBank(bank);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, JSON.stringify(bank));
  decodeMemoryBank(JSON.parse(readFileSync(`${path}.tmp`, 'utf8'))); renameSync(`${path}.tmp`, path);
}
const bank = decodeMemoryBank(JSON.parse(readFileSync(path, 'utf8')));
if (mode === 'verify') for (const p of bank.records) {
  const solved = solveBoard(initialBoard(p.level), budget);
  assert.equal(solved.status, 'solved', `Independent solve ${p.number}`);
  if (solved.status === 'solved') assert.equal(solved.route.length, p.ordinaryReference.length);
}
const report = { id: bank.id, rules: bank.rules, count: bank.records.length,
  physicalStructures: new Set(bank.records.map(p => p.evidence.structureKey)).size,
  maskStructures: new Set(bank.records.map(p => p.evidence.maskStructureKey)).size,
  depthsBottomToTop: [0, 1, 2, 3].map(d => bank.records.reduce((n, p) => n + p.evidence.depthHistogram[d], 0)),
  topMaskedPuzzles: bank.records.filter(p => p.evidence.depthHistogram[3] > 0).length,
  grades: bank.records.reduce<Record<string, number>>((r, p) => ({ ...r, [`M${p.target.grade}`]: (r[`M${p.target.grade}`] ?? 0) + 1 }), {}),
  records: bank.records.map(p => ({ id: p.level.id, ...p.target, evidence: p.evidence })) };
mkdirSync('builds', { recursive: true }); writeFileSync('builds/memory-100-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verified: true, ...report, records: undefined }));
