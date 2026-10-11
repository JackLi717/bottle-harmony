import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { unlockArtExample, unlockKeyPairsExample } from '../src/game/unlockArtExamples.ts';
import { compileSortingPuzzle, initialEngineState, visibleEngineState } from '../src/game/engine.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';
import { COVER_FAMILIES, coverGroups, defaultCoverFamily } from '../src/art/unlockPresentation.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { auditUnlockVisualTemplates, VISUAL_TEMPLATE_METHOD } from '../scripts/lib/unlockVisualTemplates.ts';
import { extractUnlockRating, ratingComparisonSet, sha256 } from '../scripts/lib/unlockRatingEvidence.ts';

test('four fixed templates match the existing actual cover geometry without scores', () => {
  assert.equal(defaultCoverFamily(unlockArtExample(1, 'color')), 'cloth');
  assert.equal(defaultCoverFamily(unlockArtExample(1, 'key')), 'wood');
  const cases = [unlockArtExample(1, 'color'), ...([1, 2, 3] as const).map(n => unlockArtExample(n, 'key'))];
  const reports = cases.map(p => auditUnlockVisualTemplates(p));
  assert.deepEqual(reports.map(r => r.status), ['pass', 'pass', 'pass', 'pass']);
  assert.deepEqual(reports.map(r => r.groups.map(g => g.template)), [['cloth'], ['single-box'], ['double-box'], ['triple-box']]);
  for (const [i, r] of reports.entries()) {
    assert.equal(r.method, VISUAL_TEMPLATE_METHOD); assert.deepEqual(r.issues, []); assert.ok(!('score' in r));
    const runtime = compileSortingPuzzle(cases[i]), frame = initialEngineState(runtime);
    const projected = coverGroups(cases[i], visibleEngineState(runtime, frame.state, frame.known), null, boardLayout(12).positions, defaultCoverFamily(cases[i]));
    assert.equal(r.groups[0].box.width, projected[0].width);
    // Independent fixed expected dimensions on the 400-unit, six-column board.
    assert.equal(r.groups[0].box.height, 158);
    assert.ok(Math.abs(r.groups[0].box.width - (64 + Math.max(0, i - 1) * 400 / 6)) < 0.000001);
  }
});

test('cloth stays per bottle; key fallback really renders a shared box; existing finishes remain supported', () => {
  for (const family of COVER_FAMILIES) {
    assert.equal(auditUnlockVisualTemplates(unlockArtExample(3, 'key'), { family }).status, 'pass');
    const report = auditUnlockVisualTemplates(unlockArtExample(3, 'color'), { family });
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.groups.map(g => g.template), family === 'cloth' ? ['cloth', 'cloth', 'cloth'] : ['triple-box']);
  }
  const pairs = auditUnlockVisualTemplates(unlockKeyPairsExample());
  assert.equal(pairs.status, 'pass'); assert.deepEqual(pairs.groups.map(g => g.template), ['double-box', 'double-box', 'double-box']);
  const base = unlockArtExample(1, 'key'), mixed = { ...base, locked: ['b6', 'b7'], triggers: [...base.triggers,
    { id: 'color-gate', when: { type: 'color-full' as const, color: 'jade', count: 4 as const }, unlock: ['b7'] }] };
  assert.equal(defaultCoverFamily(mixed), 'wood'); // Same preset as actual mixed-mechanism trials.
  assert.deepEqual(auditUnlockVisualTemplates(mixed).groups.map(g => g.template), ['single-box', 'single-box']);
  assert.deepEqual(auditUnlockVisualTemplates(mixed, { family: 'cloth' }).groups.map(g => g.template), ['single-box', 'cloth']);
});

test('box mappings cannot silently split across rows, skip bottles or exceed three', () => {
  const original = unlockArtExample(3, 'key');
  for (const indices of [[5, 6], [6, 8], [6, 7, 8, 9]]) {
    const p = { ...original, locked: indices.map(i => `b${i}`), triggers: [{ ...original.triggers[0], unlock: indices.map(i => `b${i}`) }] };
    const result = auditUnlockVisualTemplates(p);
    assert.equal(result.status, 'fail');
    assert.ok(result.issues.some(i => i.code === 'box-requires-1-to-3-consecutive-bottles-in-one-row'));
  }
  // A color-linked cloth can cover separate bottles: it declares no shared box.
  const color = unlockArtExample(3, 'color'), p = { ...color, locked: ['b6', 'b8'], triggers: [{ ...color.triggers[0], unlock: ['b6', 'b8'] }] };
  assert.equal(auditUnlockVisualTemplates(p).status, 'pass');
  assert.equal(auditUnlockVisualTemplates(p, { family: 'wood' }).status, 'fail');
});

test('fixed board slots reject shifted, resized, nonfinite or missing geometry; 4–12 bottle single covers fit', () => {
  const p = unlockArtExample(1, 'color'), layout = boardLayout(12);
  const changed = [
    { ...layout, width: 399 }, { ...layout, slotWidth: 40 }, { ...layout, height: 399 },
    { ...layout, positions: layout.positions.slice(1) },
    { ...layout, positions: layout.positions.map((v, i) => i === 6 ? { ...v, x: v.x + 1 } : v) },
    { ...layout, positions: layout.positions.map((v, i) => i === 6 ? { ...v, y: NaN } : v) },
  ];
  for (const custom of changed) assert.equal(auditUnlockVisualTemplates(p, { layout: custom }).status, 'fail');
  for (let count = 4; count <= 12; count++) {
    const board: string[][] = Array.from({ length: count }, () => []); board[0] = ['coral']; board[1] = ['coral', 'coral', 'coral'];
    const sample = engineFixture(`template-size-${count}`, board, { locked: [count - 1],
      triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: [`b${count - 1}`] }] });
    assert.equal(auditUnlockVisualTemplates(sample).status, 'pass');
  }
});

test('missing/ambiguous conditions and unsupported badge marks fail; no covers receive no invented pass', () => {
  const p = unlockArtExample(1, 'key');
  const missing = { ...p, triggers: [] };
  assert.throws(() => auditUnlockVisualTemplates(missing), /Locked container has no trigger/);
  const ambiguous = { ...p, triggers: [...p.triggers, { ...p.triggers[0], id: 'other' }] };
  assert.equal(auditUnlockVisualTemplates(ambiguous).status, 'fail');
  const color = unlockArtExample(1, 'color');
  const count = { ...color, triggers: [{ ...color.triggers[0], when: { type: 'color-full' as const, color: 'coral', count: 3 } }] };
  assert.throws(() => auditUnlockVisualTemplates(count as unknown as SortingPuzzle), /Cover condition requires four portions/);
  const renamed = { ...color, colors: color.colors.map(c => c === 'coral' ? 'unknown-color' : c),
    units: color.units.map(u => u.color === 'coral' ? { ...u, color: 'unknown-color' } : u),
    triggers: [{ ...color.triggers[0], when: { type: 'color-full' as const, color: 'unknown-color', count: 4 as const } }] };
  assert.equal(auditUnlockVisualTemplates(renamed).status, 'fail');
  const plain = engineFixture('template-plain', [['coral', 'coral'], ['coral', 'coral'], [], []]);
  assert.equal(auditUnlockVisualTemplates(plain).status, 'not-applicable');
  assert.equal(auditUnlockVisualTemplates({ ...plain, hidden: [plain.units[0].id] }).status, 'not-applicable');
  assert.equal(auditUnlockVisualTemplates(engineFixture('template-small', [['coral'], [], []])).status, 'unsupported');
  assert.equal(auditUnlockVisualTemplates({ ...p, containers: p.containers.map((c, i) => i ? c : { ...c, capacity: 5 }) }).status, 'unsupported');
});

test('template conformance ignores hidden liquid arrangement, while evidence still binds the exact definition and layout', () => {
  const p = unlockArtExample(3, 'key'), report = auditUnlockVisualTemplates(p);
  const shuffled = { ...p, containers: p.containers.map(c => p.locked.includes(c.id) ? { ...c, units: [...c.units].reverse() } : c) };
  const other = auditUnlockVisualTemplates(shuffled);
  assert.equal(other.status, report.status); assert.deepEqual(other.groups, report.groups);
  assert.notEqual(other.evidenceSha256, report.evidenceSha256);
  const { status, groups, issues, evidenceSha256, ...binding } = report;
  assert.equal(evidenceSha256, sha256({ binding, status, groups, issues }));
  assert.notEqual(auditUnlockVisualTemplates(p, { family: 'roller' }).evidenceSha256, evidenceSha256);
});

test('reports preserve independent template evidence when solver search is unknown, with no final quality approval', () => {
  const puzzle = engineFixture('template-report', [['coral', 'coral'], ['coral'], ['coral'], []], {
    locked: [2], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b2'] }],
  });
  const input = { puzzle, design: { role: 'challenge' as const, family: 'test', purpose: { event: 'key' as const, description: 'Acquire the key.' } } };
  const set = ratingComparisonSet([input]), full = extractUnlockRating(input, set), low = extractUnlockRating(input, set, 1);
  assert.equal(full.status, 'complete'); assert.equal(low.status, 'unknown');
  assert.equal(low.evidence, null); assert.equal(low.presentation.status, 'pass');
  assert.deepEqual(full.presentation, low.presentation);
  if (full.status === 'complete') assert.equal(full.evidence.admission.productionEligible, false);
  const { status: _status, evidence: _evidence, evidenceSha256, limits: _limits, graph, ...binding } = low;
  assert.equal(evidenceSha256, sha256({ binding, graph }));
  assert.notEqual(evidenceSha256, sha256({ binding: { ...binding, presentation: { ...binding.presentation, status: 'fail' } }, graph }));
});
