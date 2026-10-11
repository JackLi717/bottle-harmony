import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('incomplete generation resumes without publishing or overwriting a frozen bank', () => {
  const directory = mkdtempSync(resolve('builds/unlock-post-key-test-'));
  const asset = resolve('assets/levels/unlock-post-key-20.json');
  const before = existsSync(asset) ? readFileSync(asset) : null;
  try {
    for (const limit of [1, 2]) {
      const run = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/unlock-post-key.ts', 'generate', '--out', directory, '--limit', String(limit)], { encoding: 'utf8', timeout: 180000 });
      assert.equal(run.status, 1, run.stderr); assert.match(run.stderr, /Incomplete: [0-9]+\/20/);
      const checkpoint = JSON.parse(readFileSync(resolve(directory, 'checkpoint.json'), 'utf8'));
      assert.equal(checkpoint.attempts, limit);
      if (limit === 2) assert.deepEqual(checkpoint.next, { 2: 1, 3: 1 }, 'Resume must not skip a source in the other template');
      assert.ok(!existsSync(resolve(directory, 'play.json'))); assert.ok(!existsSync(resolve(directory, 'run.lock')));
    }
    if (before) assert.deepEqual(readFileSync(asset), before); else assert.ok(!existsSync(asset));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
