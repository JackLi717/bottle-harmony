import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { compileSortingPuzzle, initialEngineState } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { lockStudyBases, lockStudyOverlays, evaluateLockStudyOverlay, summarizeLockStudy, LOCK_WIDTH_RECIPE,
  type LockStudyResult } from '../scripts/lib/unlockLockWidthStudy.ts';

const bank = JSON.parse(readFileSync('assets/levels/unlock-internal-100.json', 'utf8'));
const bases = lockStudyBases(bank);

test('study reconstructs all hundred exact classic bases and replays their mapped full routes without ranking selection', () => {
  assert.equal(bases.length, 100); assert.equal(bases.filter(b => b.isRoot).length, 20);
  assert.equal(new Set(bases.map(b => b.root)).size, 20);
  assert.deepEqual(bases.map(b => b.classicScore), bank.entries.map((r: { classicScore: number }) => r.classicScore));
  assert.ok(bases.some(b => b.classicScore! < 20)); assert.ok(bases.some(b => b.classicScore! > 50));
  assert.throws(() => lockStudyBases({ ...bank, evidenceSha256: '0'.repeat(64) }), /Frozen bank hash differs/);
  const changed = structuredClone(bank); changed.entries[0].overlay.order.reverse();
  const { evidenceSha256: _hash, ...payload } = changed; changed.evidenceSha256 = sha256(payload);
  assert.throws(() => lockStudyBases(changed));
});

test('each base uses the identical key, bottle IDs, inventory and capacity for every nonempty 1/2/3 lock subset', () => {
  let count = 0;
  for (const base of bases) {
    const overlays = lockStudyOverlays(base), eligible = base.board.filter((b, i) => b.length && i !== base.key).length;
    assert.equal(overlays.length, eligible + eligible * (eligible - 1) / 2 + eligible * (eligible - 1) * (eligible - 2) / 6);
    const keys = new Set<string>();
    for (const { width, locked, puzzle } of overlays) {
      count++; assert.equal(locked.length, width); assert.ok(!locked.includes(base.key));
      assert.ok(locked.every(i => base.board[i].length > 0));
      assert.deepEqual(puzzle.triggers[0].when, { type: 'empty', container: `b${base.key}` });
      const colors = new Map(puzzle.units.map(u => [u.id, u.color]));
      assert.deepEqual(puzzle.containers.map(c => c.units.map(id => colors.get(id))), base.board);
      assert.deepEqual(puzzle.containers.map(c => c.id), base.board.map((_, i) => `b${i}`));
      assert.ok(puzzle.containers.every(c => c.capacity === 4));
      keys.add(locked.join(','));
    }
    assert.equal(keys.size, overlays.length);
  }
  assert.equal(count, 3908);
  assert.ok(lockStudyOverlays(bases[0]).some(o => o.width === 3 && new Set(o.locked.flatMap(i => bases[0].board[i])).size > 3));
});

test('real rated, proved unsolvable and limited searches remain separate and retain complete replay evidence', () => {
  const base = bases[0], overlays = lockStudyOverlays(base);
  const single = overlays.find(o => o.width === 1 && o.locked[0] === 1)!;
  const rated = evaluateLockStudyOverlay(base, single);
  assert.equal(rated.stage.status, 'rated'); assert.equal(rated.solvability, 'solvable');
  assert.equal(rated.limits, LOCK_WIDTH_RECIPE);
  if (rated.stage.status !== 'rated') throw new Error('Expected rated');
  assert.equal(rated.stage.rank, Math.max(rated.stage.beforeRank!, rated.stage.afterRank));
  const runtime = compileSortingPuzzle(single.puzzle);
  replayEngineRoute(runtime, initialEngineState(runtime), rated.stage.witness.route);
  const larger = overlays.find(o => o.width === 2 && o.locked.join(',') === '1,2')!;
  const blocked = evaluateLockStudyOverlay(base, larger);
  assert.equal(blocked.solvability, 'unsolvable'); assert.equal(blocked.stage.status, 'blocked'); assert.equal(blocked.stage.rank, null);
  assert.equal(blocked.prefilter, 'fail');
  const unknown = evaluateLockStudyOverlay(base, single, { graph: { maxStates: 1, maxEdges: 1 }, maxStageWork: 1 });
  assert.equal(unknown.solvability, 'unknown'); assert.equal(unknown.stage.status, 'unknown');
  assert.equal(unknown.stage.rank, null); assert.equal(unknown.prefilter, 'unknown');
  assert.ok(!('acceptance' in rated));
});

test('nested summaries exclude unresolved comparisons, count both difficulty directions and expose root-only results', () => {
  const base = bases[0], single = lockStudyOverlays(base).find(o => o.locked.join(',') === '1')!;
  const evaluated = evaluateLockStudyOverlay(base, single);
  assert.equal(evaluated.stage.status, 'rated'); if (evaluated.stage.status !== 'rated') throw new Error('Expected rated');
  const stage = evaluated.stage;
  // Synthetic summary fixtures exercise aggregation, not puzzle evidence.
  const row = (width: 1 | 2 | 3, before: number, after: number): LockStudyResult => ({ ...evaluated, width,
    locked: Array.from({ length: width }, (_, i) => i + 1), stage: { ...stage, beforeRank: before, afterRank: after, rank: Math.max(before, after) } });
  const summary = summarizeLockStudy([{ base, results: [row(1, 2, 4), row(2, 5, 1), row(3, 4, 6)] }]);
  assert.deepEqual(summary.all.pairs[0].changes.after, { lower: 1, same: 0, higher: 0 });
  assert.deepEqual(summary.all.pairs[1].changes.after, { lower: 0, same: 0, higher: 1 });
  assert.equal(summary.all.pairs[0].rated, 1); assert.equal(summary.roots.bases, 1);
  const unknown = evaluateLockStudyOverlay(base, single, { graph: { maxStates: 1, maxEdges: 1 }, maxStageWork: 1 });
  const excluded = summarizeLockStudy([{ base: { ...base, isRoot: false }, results: [unknown, row(2, 5, 1)] }]);
  assert.equal(excluded.all.pairs[0].rated, 0); assert.equal(excluded.all.pairs[0].excluded, 1);
  assert.deepEqual(excluded.all.pairs[0].statusPairs, { 'unknown→rated': 1 }); assert.equal(excluded.roots.bases, 0);
});

test('research CLI refuses production output and incomplete verification without touching frozen content', () => {
  const run = (args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/unlock-lock-width.ts', ...args], { encoding: 'utf8' });
  const rejected = run(['run', '--out', 'assets/levels/lock-width-test']);
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /Output must be inside ignored builds/);
  assert.equal(existsSync('assets/levels/lock-width-test'), false);
  const directory = mkdtempSync('builds/lock-study-test-');
  try {
    const incomplete = run(['verify', '--out', directory]);
    assert.notEqual(incomplete.status, 0); assert.match(incomplete.stderr, /No study to verify/);
    assert.equal(existsSync(`${directory}/summary.json`), false); assert.equal(existsSync(`${directory}/run.lock`), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
