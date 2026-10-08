import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('feature CLI binds reports to the catalog and preserves unknown coverage without touching input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bottle-features-'));
  const input = new URL('../assets/levels/mainline-catalog.json', import.meta.url);
  const before = readFileSync(input, 'utf8');
  const output = join(directory, 'features.json'), markdown = join(directory, 'features.md');
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/mainline-features.ts',
      '--limit', '3', '--output', output, '--markdown', markdown, '--early-states', '1'], { stdio: 'pipe' });
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.analyzedLevels, 3);
    assert.equal(report.totalCatalogLevels, 1000);
    assert.match(report.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.distribution.whole.earlyCoverage.unknown, 3);
    assert.equal(report.distribution.whole.tags.find((tag: { tag: string }) => tag.tag === 'early-deception').denominator, 0);
    assert.ok(report.records.every((row: { report: { primary: string } }) => row.report.primary === 'incomplete-observation'));
    assert.match(readFileSync(markdown, 'utf8'), /已分析 3\/1000/);
    assert.equal(readFileSync(input, 'utf8'), before);
    assert.throws(() => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/mainline-features.ts',
      '--output', new URL(input).pathname], { stdio: 'pipe' }), /Feature outputs must differ/);
    assert.equal(readFileSync(input, 'utf8'), before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
