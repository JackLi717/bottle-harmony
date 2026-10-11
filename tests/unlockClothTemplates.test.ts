import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { engineFixture } from '../src/game/engineExamples.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { auditUnlockClothTemplates, clothTemplateProbe, CLOTH_KEY_GROUPS } from '../scripts/lib/unlockClothTemplates.ts';

test('8/10/12 bottle corner cloth templates automatically recognize all four Key group patterns', () => {
  for (const count of [8, 10, 12] as const) for (const keys of [1, 2, 3, 4] as const) {
    const report = auditUnlockClothTemplates(clothTemplateProbe(count, keys));
    assert.equal(report.status, 'pass'); assert.deepEqual(report.issues, []);
    assert.equal(report.keyCount, keys); assert.deepEqual(report.groupSizes, CLOTH_KEY_GROUPS[keys - 1]);
    assert.equal(report.geometry.groups.length, 4);
    assert.ok(report.geometry.groups.every(g => g.template === 'cloth' && g.containers.length === 1));
    assert.ok(!('score' in report));
  }
});

test('interior or missing covers fail even when generic per-bottle geometry fits', () => {
  const p = clothTemplateProbe(10, 1);
  const moved = { ...p, locked: ['b0', 'b3', 'b5', 'b9'], triggers: [{ ...p.triggers[0], unlock: ['b0', 'b3', 'b5', 'b9'] }] };
  const fewer = { ...p, locked: p.locked.slice(1), triggers: [{ ...p.triggers[0], unlock: p.locked.slice(1) }] };
  for (const invalid of [moved, fewer, { ...p, locked: [], triggers: [] }]) {
    const report = auditUnlockClothTemplates(invalid);
    assert.equal(report.status, 'fail');
    assert.ok(report.issues.some(i => i.code === 'cloth-requires-four-row-end-covers'));
  }
  assert.equal(auditUnlockClothTemplates(moved).geometry.status, 'pass');
});

test('color groups must share one condition, use the approved sizes and contain no physical-key substitute', () => {
  const p = clothTemplateProbe(8, 2);
  const uneven = { ...p, triggers: [{ ...p.triggers[0], unlock: p.locked.slice(0, 3) }, { ...p.triggers[1], unlock: p.locked.slice(3) }] };
  const duplicate = { ...p, triggers: p.triggers.map(t => ({ ...t, when: p.triggers[0].when })) };
  const physical = { ...p, triggers: [{ ...p.triggers[0], when: { type: 'empty' as const, container: 'b1' } }, p.triggers[1]] };
  const ambiguous = { ...p, triggers: [...p.triggers, { ...p.triggers[0], id: 'duplicate' }] };
  for (const [invalid, code] of [
    [uneven, 'cloth-key-groups-must-be-4-2+2-2+1+1-or-1+1+1+1'],
    [duplicate, 'same-color-must-share-one-condition'],
    [physical, 'cloth-requires-four-portion-color-condition'],
    [ambiguous, 'requires-one-condition-per-covered-bottle'],
  ] as const) {
    const report = auditUnlockClothTemplates(invalid);
    assert.equal(report.status, 'fail'); assert.ok(report.issues.some(i => i.code === code));
  }
});

test('corner assignment, trigger order and supported palette permutations need no manual template declaration', () => {
  for (const keys of [1, 2, 3, 4] as const) {
    const p = clothTemplateProbe(12, keys);
    // Enumerate all physical corner assignments, including same-side and diagonal pairs.
    const permutations = (items: string[]): string[][] => items.length === 0 ? [[]]
      : items.flatMap((id, i) => permutations(items.filter((_, n) => n !== i)).map(tail => [id, ...tail]));
    for (const order of permutations([...p.locked])) {
      const mapping = new Map(p.locked.map((id, i) => [id, order[i]]));
      const changed = { ...p, triggers: p.triggers.map(t => ({ ...t, id: `renamed-${t.id}`,
        when: t.when.type === 'color-full' ? { ...t.when, color: t.when.color === 'coral' ? 'violet' : t.when.color } : t.when,
        unlock: t.unlock.map(id => mapping.get(id)!) })).reverse(),
      colors: [...p.colors.filter(c => c !== 'coral'), 'violet'], units: p.units.map(u => u.color === 'coral' ? { ...u, color: 'violet' } : u) };
      assert.equal(auditUnlockClothTemplates(changed).status, 'pass');
    }
  }
});

test('strict cloth audit inherits geometry, material and definition checks without inventing solver acceptance', () => {
  const p = clothTemplateProbe(8, 1), layout = boardLayout(8);
  assert.equal(auditUnlockClothTemplates(p, { layout: { ...layout, positions: layout.positions.map((v, i) => i ? v : { ...v, x: v.x + 1 }) } }).status, 'fail');
  const renamed: SortingPuzzle = { ...p, colors: p.colors.map(c => c === 'coral' ? 'unsupported' : c),
    units: p.units.map(u => u.color === 'coral' ? { ...u, color: 'unsupported' } : u),
    triggers: [{ ...p.triggers[0], when: { type: 'color-full', color: 'unsupported', count: 4 } }] };
  assert.ok(auditUnlockClothTemplates(renamed).issues.some(i => i.code === 'condition-mark-not-supported'));
  assert.equal(auditUnlockClothTemplates(engineFixture('unsupported-size', Array.from({ length: 9 }, () => ['coral']))).status, 'unsupported');
  assert.equal(auditUnlockClothTemplates({ ...p, containers: p.containers.map((c, i) => i ? c : { ...c, capacity: 5 }) }).status, 'unsupported');
  assert.throws(() => auditUnlockClothTemplates({ ...p, triggers: [] }), /Locked container has no trigger/);
  const changed = { ...p, containers: p.containers.map(c => p.locked.includes(c.id) ? { ...c, units: [...c.units].reverse() } : c) };
  const first = auditUnlockClothTemplates(p), second = auditUnlockClothTemplates(changed);
  assert.equal(second.status, first.status); assert.deepEqual(second.geometry.groups, first.geometry.groups);
  assert.notEqual(second.evidenceSha256, first.evidenceSha256);
  const { status, issues, geometry: _geometry, evidenceSha256, ...binding } = first;
  assert.equal(evidenceSha256, createHash('sha256').update(JSON.stringify({ binding, status, issues })).digest('hex'));
  assert.ok(!('difficulty' in first)); assert.ok(!('acceptance' in first));
});
