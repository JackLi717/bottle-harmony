import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generatedPostKeyTrials, generatedUnlockTrials } from '../src/game/unlockGenerated.ts';
import { postKeyRoot, postKeyOrigin, reconstructPostKeyClassic, postKeyOverlays, POST_KEY_RECIPE, type PostKeyOrigin } from '../scripts/lib/unlockPostKeyGeneration.ts';
import { lowerRowStructure, POST_KEY_DIVERSITY_METHOD } from '../scripts/lib/unlockPostKeyDiversity.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { structureKey } from '../src/game/generation.ts';
import { parseLevel } from '../src/game/model.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';
import { unlockTrialStructure } from '../scripts/lib/unlockTrialAudit.ts';
import { auditUnlockVisualTemplates } from '../scripts/lib/unlockVisualTemplates.ts';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, type EngineAction } from '../src/game/engine.ts';
import { nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';

const bank = JSON.parse(readFileSync(new URL('../assets/levels/unlock-post-key-20.json', import.meta.url), 'utf8'));
const trials = generatedPostKeyTrials(bank);
type Entry = { number: number; origin: PostKeyOrigin; overlay: { key: number; locked: number[]; order: number[] };
  route: EngineAction[]; classicStructureKey: string; rank: number; beforeRank: number; afterRank: number;
  classicScore: number; afterClassicScore: number | null; rhythm: { before: number; after: number; structure: string } };

test('twenty post-key trials bind reconstructed distinct sources, stage floor, rhythm and box quotas', () => {
  const { evidenceSha256, ...payload } = bank; assert.equal(evidenceSha256, sha256(payload));
  assert.deepEqual(bank.recipe, POST_KEY_RECIPE); assert.equal(trials.length, 20);
  assert.equal(bank.diversity.method, POST_KEY_DIVERSITY_METHOD); assert.equal(bank.diversity.status, 'pass'); assert.equal(bank.diversity.roots, 20);
  const roots = new Map<string, number>(), bases = new Set<string>(), overlays = new Set<string>(), widths = [0, 0, 0, 0];
  for (const [i, row] of (bank.entries as Entry[]).entries()) {
    const origin = row.origin, indexed = postKeyOrigin(origin.template, origin.seed - POST_KEY_RECIPE.seed - POST_KEY_RECIPE.templateSeedOffset[origin.template]);
    assert.deepEqual(origin, indexed);
    const root = postKeyRoot(row.origin); roots.set(root, (roots.get(root) ?? 0) + 1);
    assert.equal(row.number, i + 1); assert.ok(row.rank >= 4 && row.rank <= 6 && row.afterRank >= 3);
    assert.equal(row.rank, Math.max(row.beforeRank, row.afterRank)); assert.ok(Number.isFinite(row.classicScore));
    const base = reconstructPostKeyClassic(row.origin), key = structureKey(base);
    assert.ok([9, 10].includes(base.bottles.length)); assert.ok(hasCleanStart(base));
    assert.equal(row.classicStructureKey, key); assert.ok(!bases.has(key)); bases.add(key);
    const overlay = postKeyOverlays(row.origin).find(o => o.key === row.overlay.key && JSON.stringify(o.locked) === JSON.stringify(row.overlay.locked));
    assert.ok(overlay); assert.deepEqual(overlay.order, row.overlay.order); assert.deepEqual(overlay.puzzle, trials[i].puzzle);
    const structure = unlockTrialStructure(trials[i].puzzle); assert.ok(!overlays.has(structure)); overlays.add(structure);
    assert.equal(auditUnlockVisualTemplates(trials[i].puzzle).status, 'pass'); widths[row.origin.template]++;
    assert.ok(row.rhythm.before + row.rhythm.after > 0);
    assert.ok(row.rhythm.before * 100 >= (row.rhythm.before + row.rhythm.after) * 40);
  }
  const rows = bank.entries.map((row: Entry) => lowerRowStructure({ source: { origin: row.origin, overlay: row.overlay } }));
  assert.equal(new Set(rows).size, 20); assert.equal(bank.diversity.lowerRows, 20);
  assert.equal(new Set(bank.entries.map((e: Entry) => `${e.origin.coreColors}/${e.origin.partition}`)).size, bank.diversity.fillProfiles);
  assert.equal(bank.entries.filter((e: Entry) => e.origin.linked).length, bank.diversity.linked);
  assert.deepEqual(widths.slice(2), [10, 10]); assert.ok([...roots.values()].every(n => n <= POST_KEY_RECIPE.diversity.maxPerRoot));
});

test('post-key routes finish through isolated sessions, including undo/reset and the last puzzle', () => {
  const afterStructures = new Set<string>();
  for (const [i, row] of (bank.entries as Entry[]).entries()) {
    const fresh = createEngineSession(trials[i].puzzle, `post-key-trial-${i}`); let session = fresh;
    for (const action of row.route) {
      const before = session, moved = moveEngineSession(session, action); assert.ok(moved); session = moved.session;
      if (!before.state.fired.length && session.state.fired.length) {
        const colors = new Map(trials[i].puzzle.units.map(u => [u.id, u.color]));
        const key = structureKey(parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'after-key', capacity: 4, colors: trials[i].puzzle.colors,
          bottles: trials[i].puzzle.containers.map((c, j) => ({ id: c.id, layers: session.state.contents[j].map(id => colors.get(id)!) })) }));
        assert.ok(!afterStructures.has(key), 'Repeated unlocked structure'); afterStructures.add(key);
      }
      const undo = undoEngineSession(session); assert.deepEqual(undo.state, before.state);
      assert.ok(session.known.every(id => undo.known.includes(id)));
    }
    assert.equal(session.status, 'solved');
    const reset = resetEngineSession(session); assert.deepEqual(reset.state, fresh.state); assert.deepEqual(reset.known, fresh.known);
    assert.equal(nextUnlockTrialIndex(i, true, 20), i === 19 ? null : i + 1);
  }
});

test('post-key loader rejects a lowered floor, unknown acceptance and wrong quotas; old bank stays separate', () => {
  const change = () => structuredClone(bank);
  const short = change(); short.entries.pop(); assert.throws(() => generatedPostKeyTrials(short));
  const unknown = change(); unknown.entries[0].acceptance.status = 'unknown'; assert.throws(() => generatedPostKeyTrials(unknown));
  const floor = change(); floor.recipe.afterMin = 2; assert.throws(() => generatedPostKeyTrials(floor));
  const diversity = change(); diversity.diversity.roots = 6; assert.throws(() => generatedPostKeyTrials(diversity));
  const lowStage = change(); lowStage.entries[0].afterRank = 2; assert.throws(() => generatedPostKeyTrials(lowStage));
  const quota = change(); quota.entries[1] = { ...quota.entries[0], number: 2, puzzle: { ...quota.entries[0].puzzle, id: 'different-id' } }; assert.throws(() => generatedPostKeyTrials(quota));
  assert.throws(() => generatedUnlockTrials(bank));
  assert.throws(() => generatedPostKeyTrials(JSON.parse(readFileSync(new URL('../assets/levels/unlock-internal-100.json', import.meta.url), 'utf8'))));
});
