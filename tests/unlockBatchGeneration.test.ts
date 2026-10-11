import assert from 'node:assert/strict';
import test from 'node:test';
import { batchOrigin, batchOverlays, neighborOrigins, batchRootKey, evaluateBatchCandidate, reconstructBatchClassic, UNLOCK_BATCH_RECIPE } from '../scripts/lib/unlockBatchGeneration.ts';
import { initialBoard } from '../src/game/model.ts';
import { makeCandidate, makeAnchoredCandidate, PRODUCTION_COLORS } from '../src/game/generation.ts';
import { replaySolution } from '../src/game/solver.ts';
import { compileSortingPuzzle, initialEngineState } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { acceptSingleKey } from '../scripts/lib/unlockSingleKeyAcceptance.ts';
import { auditUnlockVisualTemplates } from '../scripts/lib/unlockVisualTemplates.ts';

const origin = { seed: 20300239, colors: 6, template: 1 as const, generator: 'balanced-shuffle-v1' as const };
test('internal classic recipe reconstructs all profiles without changing inventory or bottle capacity', () => {
  for (const template of [1, 2, 3] as const) for (const index of [0, 1, 2, 13]) {
    const source = batchOrigin(template, index), classic = reconstructBatchClassic(source);
    assert.deepEqual(reconstructBatchClassic(source), classic);
    assert.ok(classic.bottles.filter(b => !b.layers.length).length <= 2);
    assert.equal(classic.bottles.length, source.colors + (template === 1 ? 1 : 2));
    for (const color of classic.colors) assert.equal(classic.bottles.flatMap(b => b.layers).filter(c => c === color).length, 4);
    const raw = (source.generator === 'balanced-shuffle-v1' ? makeCandidate : makeAnchoredCandidate)(source.seed, 0, {
      colors: PRODUCTION_COLORS.slice(0, source.colors), emptyBottles: template === 1 ? 1 : 2, minSolutionMoves: 1, maxSolutionMoves: 80, mixing: 'relaxed',
    });
    const board = initialBoard(classic), expected = raw.bottles.map(b => [...b.layers]);
    if (template !== 1) for (let i = 0; i < 2; i++) expected[source.colors + i] = expected[i].splice(2);
    assert.deepEqual(board, expected);
    for (const overlay of batchOverlays(source)) {
      const layout = auditUnlockVisualTemplates(overlay.puzzle); assert.equal(layout.status, 'pass');
      assert.equal(overlay.puzzle.locked.length, template);
      assert.deepEqual(overlay.order.map((i): readonly string[] => board[i]), overlay.puzzle.containers.map(c => c.units.map(id => overlay.puzzle.units.find(u => u.id === id)!.color)));
      if (template === 3) assert.ok(new Set(overlay.locked.flatMap(i => board[i])).size <= 3);
    }
  }
  assert.throws(() => batchOrigin(1, -1)); assert.throws(() => reconstructBatchClassic({ ...origin, seed: NaN }));
  assert.deepEqual(UNLOCK_BATCH_RECIPE.target, { min: 4, max: 6 });
});

test('generated classic, key overlay and uniform acceptance form one replayed, deterministic chain', () => {
  const statuses: string[] = [];
  const record = evaluateBatchCandidate(origin, (stage, status) => statuses.push(`${stage}:${status}`));
  assert.ok(record); assert.equal(record.acceptance.status, 'pass');
  assert.ok(statuses.includes('classic-solution:pass')); assert.ok(statuses.includes('acceptance:pass'));
  replaySolution(initialBoard(record.source.classic), record.source.solution, 4);
  const runtime = compileSortingPuzzle(record.puzzle);
  assert.equal(record.rating.status, 'complete'); if (record.rating.status !== 'complete') throw new Error('Missing rating');
  const stage = record.rating.evidence.stageDifficulty; assert.equal(stage.status, 'rated'); if (stage.status !== 'rated') throw new Error('Missing stage');
  replayEngineRoute(runtime, initialEngineState(runtime), stage.witness.route);
  assert.deepEqual(acceptSingleKey(record.puzzle, record.rating, { target: UNLOCK_BATCH_RECIPE.target, disclosureBudget: UNLOCK_BATCH_RECIPE.disclosure }), record.acceptance);
  assert.deepEqual(evaluateBatchCandidate(origin), record);
  assert.equal(record.classicReferences.base.status, 'rated');
  const neighbors = neighborOrigins(record); assert.ok(neighbors.length > 0);
  for (const next of neighbors) {
    assert.equal(batchRootKey(next), batchRootKey(origin));
    const changed = reconstructBatchClassic(next), mutation = next.mutation!;
    const expected: string[][] = record.source.classic.bottles.map(b => [...b.layers]);
    [expected[mutation.bottle][mutation.first], expected[mutation.bottle][mutation.second]] = [expected[mutation.bottle][mutation.second], expected[mutation.bottle][mutation.first]];
    assert.deepEqual(initialBoard(changed), expected);
    assert.deepEqual(changed.bottles.map(b => [...b.layers].sort()), record.source.classic.bottles.map(b => [...b.layers].sort()));
    assert.ok(!record.source.overlay.locked.includes(mutation.bottle));
  }
  assert.throws(() => reconstructBatchClassic({ ...origin, mutation: { bottle: 100, first: 0, second: 1 } }));
});

test('invalid starts and proved unsolvable classic sources never emit a playable fallback', () => {
  assert.equal(evaluateBatchCandidate({ ...origin, seed: 20261014, colors: 5, generator: 'anchored-shuffle-v1' }), null);
  assert.equal(evaluateBatchCandidate({ ...origin, seed: 20261011, colors: 5, generator: 'anchored-shuffle-v1' }), null);
});

test('CLI guards incomplete verification and concurrent output writes without publishing a fallback', async () => {
  const { mkdtempSync, mkdirSync, existsSync, writeFileSync, rmSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync('builds/unlock-batch-test-');
  try {
    const cli = (args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/unlock-generate.ts', ...args], { encoding: 'utf8' });
    const incomplete = cli(['verify', '--out', root, '--count', '3']);
    assert.equal(incomplete.status, 1); assert.match(incomplete.stderr, /Incomplete/);
    assert.equal(existsSync(`${root}/play.json`), false); assert.equal(existsSync(`${root}/run.lock`), false);
    mkdirSync(root, { recursive: true }); writeFileSync(`${root}/run.lock`, 'test-owner');
    const locked = cli(['generate', '--out', root, '--count', '3']);
    assert.notEqual(locked.status, 0); assert.match(locked.stderr, /locked by another run/);
    assert.equal(existsSync(`${root}/checkpoint.json`), false);
    const escaped = cli(['generate', '--out', '/tmp/unlock-not-builds']);
    assert.notEqual(escaped.status, 0); assert.match(escaped.stderr, /inside ignored builds/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
