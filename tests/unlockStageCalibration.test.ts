import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createEngineSession, moveEngineSession, undoEngineSession, resetEngineSession } from '../src/game/engine.ts';
import { STAGE_CALIBRATION_SOURCES, UNLOCK_STAGE_CALIBRATION } from '../src/game/unlockStageCalibration.ts';
import { nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';
import { auditStageCalibration } from '../scripts/lib/unlockStageCalibrationAudit.ts';
import { extractUnlockRating, ratingComparisonSet, type RatingInput } from '../scripts/lib/unlockRatingEvidence.ts';
import { unlockClassicReferences } from '../scripts/lib/unlockClassicReference.ts';

const catalog = JSON.parse(readFileSync(new URL('../assets/levels/mainline-catalog.json', import.meta.url), 'utf8'));
const inputs: RatingInput[] = UNLOCK_STAGE_CALIBRATION.map(entry => ({ puzzle: entry.puzzle,
  design: { role: 'challenge', family: entry.focus, purpose: { event: entry.variant === 'key' ? 'key' : 'sort', description: 'Fixed stage calibration control.' } } }));
const comparison = ratingComparisonSet(inputs);
const reports = inputs.map(input => {
  const r = extractUnlockRating(input, comparison);
  return { ...r, classicReferences: unlockClassicReferences(input.puzzle, r.status === 'complete' ? r.evidence.stageDifficulty : null, r.evidenceSha256) };
});

test('nine frozen controls preserve the source board in each pair; empty counts remain a content choice', () => {
  assert.equal(UNLOCK_STAGE_CALIBRATION.length, 9);
  assert.equal(new Set(UNLOCK_STAGE_CALIBRATION.map(e => e.puzzle.id)).size, 9);
  for (const [i, s] of STAGE_CALIBRATION_SOURCES.entries()) {
    const classic = UNLOCK_STAGE_CALIBRATION[2 * i].puzzle, key = UNLOCK_STAGE_CALIBRATION[2 * i + 1].puzzle;
    assert.deepEqual(classic.units, key.units); assert.deepEqual(classic.containers, key.containers);
    assert.equal(classic.triggers.length, 0); assert.equal(key.triggers.length, 1);
    assert.deepEqual(key.locked, [`b${s.locked}`]);
    assert.deepEqual(key.triggers[0].when, { type: 'empty', container: `b${s.key}` });
  }
  // This constrains this producer's fixtures, not the difficulty evaluator.
  for (const e of UNLOCK_STAGE_CALIBRATION) assert.ok(e.puzzle.containers.filter(c => !c.units.length).length <= 2);
});

test('automatic calibration reconstructs sources and certifies increasing bands without confusing work with planning', () => {
  const audit = auditStageCalibration(reports, catalog.records);
  assert.equal(audit.status, 'pass'); assert.ok(audit.checks.every(c => c.status === 'pass'));
  assert.deepEqual(audit.sources.map(s => [s.mainline, s.classicScore]), [[11, 20], [496, 49], [759, 62]]);
  const rank = (i: number) => reports[i].status === 'complete' ? reports[i].evidence.stageDifficulty.rank : null;
  assert.deepEqual([rank(0), rank(2), rank(4)], [2, 4, 7]);
  assert.deepEqual([rank(1), rank(3), rank(5)], [2, 4, 5]);
  assert.deepEqual([rank(6), rank(7), rank(8)], [1, 1, 1]);
  assert.deepEqual([1, 3, 5].map(i => {
    const r = reports[i]; assert.equal(r.status, 'complete'); if (r.status !== 'complete') throw new Error('Missing evidence');
    const rhythm = r.evidence.stageRhythm;
    assert.equal(rhythm.status, 'pass'); assert.equal(rhythm.structure, 'balanced');
    assert.equal(rhythm.witness?.splitPour, r.evidence.stageDifficulty.witness?.splitPour);
    return [rhythm.before, rhythm.after];
  }), [[7, 8], [7, 8], [6, 9]]);
  assert.deepEqual(audit.disclosures.map(d => d.worlds.length), [12, 12, 12]);
  for (const r of reports.slice(6, 8)) assert.equal(r.classicReferences.base.status, 'not-applicable');
});

test('all nine certified routes play through sessions; undo/reset and the final return boundary remain exact', () => {
  for (const [i, e] of UNLOCK_STAGE_CALIBRATION.entries()) {
    const report = reports[i]; assert.equal(report.status, 'complete'); if (report.status !== 'complete') throw new Error('Missing graph');
    const stage = report.evidence.stageDifficulty; assert.equal(stage.status, 'rated'); if (stage.status !== 'rated') throw new Error('Missing stage certificate');
    const fresh = createEngineSession(e.puzzle, 'stage-calibration-test');
    let session = fresh;
    for (const action of stage.witness.route) {
      const previous = session, next = moveEngineSession(session, action); assert.ok(next); session = next.session;
      const undone = undoEngineSession(session); assert.deepEqual(undone.state, previous.state);
      assert.ok(session.known.every(u => undone.known.includes(u)));
    }
    assert.equal(session.status, 'solved');
    const reset = resetEngineSession(session); assert.deepEqual(reset.state, fresh.state); assert.deepEqual(reset.known, fresh.known);
    assert.equal(nextUnlockTrialIndex(i, true, 9), i === 8 ? null : i + 1);
    assert.equal(nextUnlockTrialIndex(i, false, 9), null);
  }
});

test('limited stage certification stays unknown; missing, tampered and stale-source reports cannot pass', () => {
  const low = extractUnlockRating(inputs[1], comparison, 250000, 4000000, 1);
  const limited = { ...low, classicReferences: unlockClassicReferences(inputs[1].puzzle,
    low.status === 'complete' ? low.evidence.stageDifficulty : null, low.evidenceSha256) };
  const changed = [...reports]; changed[1] = limited;
  const audit = auditStageCalibration(changed, catalog.records);
  assert.equal(audit.status, 'unknown'); assert.ok(audit.checks.some(c => c.status === 'unknown'));
  const graphLimited = extractUnlockRating(inputs[0], comparison, 1);
  changed[0] = { ...graphLimited, classicReferences: unlockClassicReferences(inputs[0].puzzle, null, graphLimited.evidenceSha256) };
  assert.equal(auditStageCalibration(changed, catalog.records).status, 'unknown');
  assert.throws(() => auditStageCalibration(reports.slice(1), catalog.records), /Incomplete/);
  assert.throws(() => auditStageCalibration([{ ...reports[0], evidenceSha256: 'tampered' }, ...reports.slice(1)], catalog.records), /hash differs/);
  assert.throws(() => auditStageCalibration(reports, catalog.records.filter((r: { number: number }) => r.number !== 11)), /Missing classic source/);
});
