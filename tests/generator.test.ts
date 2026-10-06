import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { decodeContentPool, encodeContentPool } from '../src/game/contentCodec.ts';
import { createGenerator, generateContent, type GenerationResult, type GeneratorOptions } from '../src/game/generator.ts';
import { makeCandidate, parseGeneratedContent, structureKey, type GenerationConfig } from '../src/game/generation.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { getLegalPours, isSolved } from '../src/game/rules.ts';
import { replaySolution } from '../src/game/solver.ts';

const colors = ['jade', 'coral', 'amber', 'azure', 'violet'];
const config: GenerationConfig = { colors: colors.slice(0, 2), emptyBottles: 2, minSolutionMoves: 3, maxSolutionMoves: 80 };
function generate(overrides: Partial<GeneratorOptions> = {}) {
  const result = generateContent({ seed: 717, colors: colors.slice(0, 2), ...overrides });
  assert.ok(result.status === 'generated', JSON.stringify(result));
  return result;
}

test('candidate addressing has a stable golden arrangement and conserves each color at boundary seeds', () => {
  assert.deepEqual(initialBoard(makeCandidate(717, 0, config)), [['jade', 'jade', 'coral', 'coral'], ['coral', 'coral', 'jade', 'jade'], [], []]);
  for (const seed of [0, 717, 0xffffffff]) for (const count of [2, 3, 4, 5]) {
    const settings = { ...config, colors: colors.slice(0, count) };
    const a = makeCandidate(seed, 3, settings), b = makeCandidate(seed, 3, settings);
    assert.deepEqual(a, b);
    assert.equal(a.bottles.length, count + 2);
    for (const color of a.colors) assert.equal(initialBoard(a).flat().filter(c => c === color).length, 4);
    assert.ok(a.bottles.every(bottle => bottle.layers.length === 4 || bottle.layers.length === 0));
  }
  assert.notEqual(makeCandidate(717, 0, config).id, makeCandidate(717, 0, { ...config, colors: colors.slice(0, 3) }).id);
});

test('fixed seed/config yields identical serialized verified content across calls and incremental schedules', () => {
  const a = generate({ colors: colors.slice(0, 3) }), b = generate({ colors: colors.slice(0, 3) });
  assert.deepEqual(a.content, b.content);
  assert.equal(encodeContentPool([a.content]), encodeContentPool([b.content]));
  const task = createGenerator({ seed: 717, colors: colors.slice(0, 3) });
  let result: GenerationResult | null = null, slices = 0;
  while (!result && slices++ < 10000) result = task.step(1, 0.1);
  assert.ok(result?.status === 'generated');
  assert.ok(slices > 1);
  assert.deepEqual(result.content, a.content);
  assert.deepEqual(parseGeneratedContent(a.content), a.content);
  assert.ok(Object.isFrozen(a.content.solution[0]));
});

test('every accepted 2 to 5 color sample can be replayed, with detached input settings', () => {
  for (const count of [2, 3, 4, 5]) for (const seed of [717, 718, 719]) {
    const result = generate({ seed, colors: colors.slice(0, count), maxMilliseconds: 10000 });
    const { content } = result;
    assert.ok(isSolved(replaySolution(initialBoard(content.level), content.solution, 4)));
    assert.ok(content.metrics.mixedBottles >= 2);
    assert.equal(content.metrics.solutionMoves, content.solution.length);
    assert.deepEqual(content.level, makeCandidate(seed, content.origin.candidateIndex, content.origin.config));
  }
  const mutableColors = colors.slice(0, 2);
  const task = createGenerator({ seed: 717, colors: mutableColors });
  mutableColors[0] = 'mutated';
  let result: GenerationResult | null;
  do { result = task.step(); } while (!result);
  assert.ok(result.status === 'generated');
  assert.deepEqual(result.content.origin.config.colors, config.colors);
});

test('exact structure deduplication ignores bottle order, IDs and color names, but retains layer order and empty-space count', () => {
  const original = makeCandidate(717, 0, config);
  const renamed = parseLevel({ ...original, colors: ['a', 'b'], bottles: [...original.bottles].reverse().map((b, i) => ({ id: `renamed-${i}`, layers: b.layers.map(c => c === 'jade' ? 'b' : 'a') })) });
  assert.equal(structureKey(renamed), structureKey(original));
  const alternating = parseLevel({ ...original, bottles: original.bottles.map((b, i) => ({ ...b, layers: i === 0 ? ['jade', 'coral', 'jade', 'coral'] : i === 1 ? ['coral', 'jade', 'coral', 'jade'] : [] })) });
  assert.notEqual(structureKey(alternating), structureKey(original));
  assert.notEqual(structureKey(makeCandidate(717, 0, { ...config, emptyBottles: 1 })), structureKey(original));
  const first = generate();
  const next = generate({ excludedKeys: [first.content.structureKey] });
  assert.notEqual(next.content.structureKey, first.content.structureKey);
  assert.ok(next.content.origin.candidateIndex > 0);
  assert.ok(next.stats.rejected.duplicate > 0);
});

test('simple, unsolvable and move-range failures are rejected without exposing content', () => {
  const simple = generateContent({ seed: 101, colors: colors.slice(0, 2), maxAttempts: 1 });
  assert.equal(simple.status, 'exhausted');
  assert.equal(simple.stats.rejected.initiallySimple, 1);
  const unsolvable = generateContent({ seed: 0, colors: colors.slice(0, 4), emptyBottles: 1, maxAttempts: 1 });
  assert.equal(unsolvable.status, 'exhausted');
  assert.equal(unsolvable.stats.rejected.unsolvable, 1);
  const outsideRange = generateContent({ seed: 717, colors: colors.slice(0, 2), minSolutionMoves: 1, maxSolutionMoves: 1, maxAttempts: 1 });
  assert.equal(outsideRange.status, 'exhausted');
  assert.equal(outsideRange.stats.rejected.solutionLength, 1);
  for (const result of [simple, unsolvable, outsideRange]) assert.equal('content' in result, false);
});

test('state/time/attempt budgets are distinct; cancellation preserves the bounded accounting', () => {
  const options = { seed: 717, colors: colors.slice(0, 2) };
  const states = generateContent({ ...options, maxStates: 1, maxTotalStates: 1 });
  assert.ok(states.status === 'limitReached'); assert.equal(states.reason, 'states');
  assert.equal(states.stats.visitedStates, 1);
  const candidates = generateContent({ ...options, maxStates: 1, maxTotalStates: 100, maxAttempts: 3 });
  assert.equal(candidates.status, 'exhausted');
  assert.equal(candidates.stats.attempts, 3);
  assert.ok(candidates.stats.rejected.searchStates > 0);
  const time = generateContent({ ...options, maxMilliseconds: Number.MIN_VALUE });
  assert.ok(time.status === 'limitReached'); assert.equal(time.reason, 'time');
  const task = createGenerator({ ...options, colors: colors.slice(0, 3) });
  assert.equal(task.step(1), null);
  const cancelled = task.cancel();
  assert.ok(cancelled.status === 'limitReached'); assert.equal(cancelled.reason, 'cancelled');
  assert.ok(cancelled.stats.visitedStates > 0);
  assert.equal(task.step(), cancelled);
  assert.equal(task.cancel(), cancelled);
  for (const result of [states, candidates, time, cancelled]) assert.equal('content' in result, false);
});

test('invalid generator settings reject before candidate creation or search', () => {
  const changes = [
    { seed: -1 }, { seed: 2 ** 32 }, { seed: 0.5 }, { seed: NaN },
    { colors: ['jade'] }, { colors: ['jade', 'jade'] }, { colors: ['jade', 'bad color'] }, { colors: [...colors, 'six'] },
    { emptyBottles: 0 }, { maxAttempts: 0 }, { maxAttempts: 1001 }, { maxStates: Infinity }, { maxTotalStates: 0 },
    { maxMilliseconds: 0 }, { maxMilliseconds: 60001 }, { minSolutionMoves: 5, maxSolutionMoves: 3 },
    { excludedKeys: ['x'.repeat(257)] },
  ];
  for (const change of changes) {
    const result = generateContent({ seed: 717, colors: colors.slice(0, 2), ...change } as GeneratorOptions);
    assert.equal(result.status, 'invalid', JSON.stringify(change));
    assert.equal(result.stats.attempts, 0);
    assert.equal(result.stats.visitedStates, 0);
  }
  assert.throws(() => createGenerator({ seed: 717, colors: colors.slice(0, 2) }).step(0));
});

test('pool import verifies actual layout, origin, full route, metrics and uniqueness', () => {
  const first = generate().content;
  const second = generate({ seed: 718, excludedKeys: [first.structureKey] }).content;
  const json = encodeContentPool([first, second]);
  assert.deepEqual(decodeContentPool(json), [first, second]);
  const threeColors = generate({ colors: colors.slice(0, 3) }).content;
  assert.deepEqual(decodeContentPool(encodeContentPool([first, threeColors])), [first, threeColors]);
  const finalBoard = replaySolution(initialBoard(first.level), first.solution);
  assert.throws(() => parseGeneratedContent({ ...first, solution: [...first.solution, getLegalPours(finalBoard)[0]], metrics: { ...first.metrics, solutionMoves: first.solution.length + 1 } }));
  const changes = [
    { origin: { ...first.origin, generator: 'unsupported' } },
    { origin: { ...first.origin, seed: 0xffffffff } },
    { level: { ...first.level, id: 'tampered' } },
    { structureKey: 'tampered' }, { metrics: { ...first.metrics, solutionMoves: 99 } },
    { solution: first.solution.slice(0, -1) },
    { solution: [{ ...first.solution[0], amount: 99 }, ...first.solution.slice(1)] },
    { solution: [{ ...first.solution[0], color: 'forged' }, ...first.solution.slice(1)] },
    { solution: [{ ...first.solution[0], source: 0.5 }, ...first.solution.slice(1)] },
    { solution: [{ ...first.solution[0], unknown: true }, ...first.solution.slice(1)] },
    { difficulty: 'D4' },
  ];
  for (const change of changes) assert.throws(() => parseGeneratedContent({ ...first, ...change }));
  assert.throws(() => encodeContentPool([first, first]));
  for (const bad of ['{', 'null', ' '.repeat(2000001), JSON.stringify({ format: 'bottle-harmony-pool', version: 1, records: [] }),
    JSON.stringify({ format: 'bottle-harmony-pool', version: 1, records: Array(101).fill(first) })]) assert.throws(() => decodeContentPool(bad));
});

test('CLI generates a reproducible pool, verifies serialized replay and preserves output on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bottle-harmony-levels-'));
  const output = join(directory, 'pool.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/levels.ts', ...args], { cwd: process.cwd(), encoding: 'utf8' });
  try {
    assert.equal(run('generate', '--seed', '717', '--colors', '2', '--count', '3', '--output', output).status, 0);
    const original = await readFile(output, 'utf8');
    assert.equal(decodeContentPool(original).length, 3);
    assert.equal(run('verify', '--input', output).status, 0);
    assert.equal(run('generate', '--seed', '717', '--colors', '2', '--count', '3', '--output', output).status, 0);
    assert.equal(await readFile(output, 'utf8'), original);
    const failed = run('generate', '--max-states', '1', '--max-total-states', '1', '--output', output);
    assert.equal(failed.status, 1);
    assert.equal(await readFile(output, 'utf8'), original);
    assert.equal(run('generate', '--seed', '4294967296', '--output', output).status, 1);
    assert.equal(run('generate', '--unknown', 'x', '--output', output).status, 1);
    const tampered = JSON.parse(original); tampered.records[0].solution[0].amount = 99;
    await writeFile(output, JSON.stringify(tampered));
    assert.equal(run('verify', '--input', output).status, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
