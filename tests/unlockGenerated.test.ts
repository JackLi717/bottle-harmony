import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generatedUnlockTrials } from '../src/game/unlockGenerated.ts';
import { batchRootKey, reconstructBatchClassic, batchOverlays, type BatchOrigin } from '../scripts/lib/unlockBatchGeneration.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { structureKey } from '../src/game/generation.ts';
import { auditUnlockVisualTemplates } from '../scripts/lib/unlockVisualTemplates.ts';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, type EngineAction } from '../src/game/engine.ts';
import { nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';

const bank = JSON.parse(readFileSync(new URL('../assets/levels/unlock-internal-100.json', import.meta.url), 'utf8'));
const trials = generatedUnlockTrials(bank);
type Entry = { number: number; origin: BatchOrigin; overlay: { key: number; locked: number[]; order: number[] };
  route: EngineAction[]; classicStructureKey: string; rank: number; beforeRank: number; afterRank: number;
  classicScore: number; afterClassicScore: number | null; rhythm: { before: number; after: number; structure: string } };

test('hundred frozen internal entries bind the approved recipe, distinct reconstructed bases and three visual templates', () => {
  const { evidenceSha256, ...payload } = bank; assert.equal(evidenceSha256, sha256(payload));
  assert.equal(trials.length, 100); assert.deepEqual(bank.recipe.target, { min: 4, max: 6 });
  const roots = new Map<string, number>();
  const bases = new Set<string>(), templates = [0, 0, 0, 0];
  for (const [i, row] of (bank.entries as Entry[]).entries()) {
    const root = batchRootKey(row.origin); roots.set(root, (roots.get(root) ?? 0) + 1);
    assert.equal(row.number, i + 1); assert.ok(row.rank >= 4 && row.rank <= 6);
    assert.equal(row.rank, Math.max(row.beforeRank, row.afterRank));
    assert.ok(Number.isFinite(row.classicScore));
    const base = reconstructBatchClassic(row.origin), key = structureKey(base);
    assert.equal(row.classicStructureKey, key); assert.ok(!bases.has(key)); bases.add(key);
    const overlay = batchOverlays(row.origin).find(o => o.key === row.overlay.key && JSON.stringify(o.locked) === JSON.stringify(row.overlay.locked));
    assert.ok(overlay); assert.deepEqual(overlay.order, row.overlay.order); assert.deepEqual(overlay.puzzle, trials[i].puzzle);
    assert.equal(auditUnlockVisualTemplates(trials[i].puzzle).status, 'pass'); templates[row.origin.template]++;
    assert.ok(row.rhythm.before + row.rhythm.after > 0);
    assert.ok(row.rhythm.before * 100 >= (row.rhythm.before + row.rhythm.after) * 40);
  }
  assert.deepEqual(templates.slice(1), [34, 33, 33]);
  assert.ok([...roots.values()].every(n => n <= 8));
});

test('all hundred routes finish in actual isolated sessions; undo/reset retain knowledge and no level 101 appears', () => {
  for (const [i, row] of (bank.entries as Entry[]).entries()) {
    const fresh = createEngineSession(trials[i].puzzle, `generated-trial-${i}`);
    let session = fresh;
    for (const action of row.route) {
      const before = session, moved = moveEngineSession(session, action); assert.ok(moved); session = moved.session;
      const undo = undoEngineSession(session); assert.deepEqual(undo.state, before.state);
      assert.ok(session.known.every(id => undo.known.includes(id)));
    }
    assert.equal(session.status, 'solved');
    const reset = resetEngineSession(session); assert.deepEqual(reset.state, fresh.state); assert.deepEqual(reset.known, fresh.known);
    assert.equal(nextUnlockTrialIndex(i, true, 100), i === 99 ? null : i + 1);
  }
});

test('runtime projection refuses incomplete, unknown, misnumbered, wrongly ranked or unapproved-target banks', () => {
  const change = () => structuredClone(bank);
  const short = change(); short.entries.pop(); assert.throws(() => generatedUnlockTrials(short));
  const unknown = change(); unknown.entries[0].acceptance.status = 'unknown'; assert.throws(() => generatedUnlockTrials(unknown));
  const target = change(); target.recipe.target.min = 3; assert.throws(() => generatedUnlockTrials(target));
  const wrongRank = change(); wrongRank.entries[0].rank = 7; assert.throws(() => generatedUnlockTrials(wrongRank));
  const wrongStage = change(); wrongStage.entries[0].afterRank = 7; assert.throws(() => generatedUnlockTrials(wrongStage));
  const repeated = change(); repeated.entries[1] = { ...repeated.entries[0], number: 2 }; assert.throws(() => generatedUnlockTrials(repeated));
  const number = change(); number.entries[0].number = 100; assert.throws(() => generatedUnlockTrials(number));
  const template = change(); template.entries[0].origin.template = 3; assert.throws(() => generatedUnlockTrials(template));
});
