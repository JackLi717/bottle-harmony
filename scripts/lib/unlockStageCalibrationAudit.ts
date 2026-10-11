import assert from 'node:assert/strict';
import { compileSortingPuzzle, initialEngineState, transitionEngine } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { evaluateHumanDifficulty } from '../../src/game/humanDifficulty.ts';
import { parseProductionRecords, type MainlineEntry } from '../../src/game/mainlineCatalog.ts';
import { STAGE_CALIBRATION_METHOD, STAGE_CALIBRATION_SOURCES, UNLOCK_STAGE_CALIBRATION, mechanicalCalibrationBoard } from '../../src/game/unlockStageCalibration.ts';
import { auditBaselineDisclosure } from './unlockBaselineAudit.ts';
import { sha256, type UnlockRatingReport } from './unlockRatingEvidence.ts';
import type { unlockClassicReferences } from './unlockClassicReference.ts';
import { auditUnlockVisualTemplates } from './unlockVisualTemplates.ts';

export type StageCalibrationReport = UnlockRatingReport & { classicReferences: ReturnType<typeof unlockClassicReferences>; acceptance?: unknown };
type Check = { name: string; status: 'pass' | 'fail' | 'unknown'; puzzles: string[]; reason?: string };

/** Reconstruct frozen controls from existing source provenance, never generate
 * new public levels or trust a declared score as a rating for the overlay. */
export function auditStageCalibration(reports: readonly StageCalibrationReport[], records: readonly MainlineEntry[]) {
  assert.equal(reports.length, UNLOCK_STAGE_CALIBRATION.length, 'Incomplete calibration set');
  assert.equal(new Set(reports.map(r => r.puzzleId)).size, reports.length, 'Duplicate calibration report');
  const sources = STAGE_CALIBRATION_SOURCES.map(s => {
    const record = records.find(r => r.number === s.mainline); assert.ok(record, 'Missing classic source');
    const [{ content, rating }] = parseProductionRecords([{ content: record.content, rating: record.rating }]);
    assert.deepEqual(content.level.bottles.map(b => b.layers), s.board, 'Frozen board differs from reconstructed source');
    const human = evaluateHumanDifficulty(content.level, rating.evidence.referenceSolution, rating.evidence.rank!);
    assert.deepEqual(human, record.human); assert.equal(human.score?.total, s.classicScore);
    return { pair: s.pair, mainline: s.mainline, sourceSha256: sha256(record), origin: content.origin,
      model: human.model, classicScore: human.score!.total, structureKey: human.structureKey };
  });
  const ordered = UNLOCK_STAGE_CALIBRATION.map(entry => {
    const report = reports.find(r => r.puzzleId === entry.puzzle.id); assert.ok(report, 'Missing calibration report');
    assert.equal(report.definitionSha256, sha256(entry.puzzle), 'Calibration definition binding differs');
    assert.deepEqual(report.presentation, auditUnlockVisualTemplates(entry.puzzle), 'Visual template evidence differs from shared presentation');
    const { evidenceSha256, classicReferences } = report;
    if (report.status === 'complete') {
      const { status: _status, evidenceSha256: _hash, limits: _limits, classicReferences: _references, acceptance: _acceptance, evidence, ...binding } = report;
      assert.equal(evidenceSha256, sha256({ binding, evidence }), 'Stage evidence hash differs');
    } else {
      const { status: _status, evidenceSha256: _hash, limits: _limits, classicReferences: _references, acceptance: _acceptance, evidence: _evidence, graph, ...binding } = report;
      assert.equal(evidenceSha256, sha256({ binding, graph }), 'Unknown graph evidence hash differs');
    }
    const { base, stages, evidenceSha256: referenceHash, ...referenceBinding } = classicReferences;
    assert.equal(referenceHash, sha256({ binding: referenceBinding, evidence: { base, stages } }), 'Classic reference hash differs');
    assert.equal(classicReferences.stageEvidenceSha256, evidenceSha256);
    assert.equal(classicReferences.definitionSha256, report.definitionSha256);
    const colors = new Map(entry.puzzle.units.map(u => [u.id, u.color]));
    const actual = entry.puzzle.containers.map(c => c.units.map(u => colors.get(u)!));
    const source = entry.source;
    if (source.kind === 'mechanical') assert.deepEqual(actual, mechanicalCalibrationBoard(source.colors, source.pieces));
    else assert.deepEqual(actual, STAGE_CALIBRATION_SOURCES.find(s => s.mainline === source.number)!.board);
    return report;
  });
  assert.equal(new Set(ordered.map(r => r.structureSha256)).size, ordered.length, 'Duplicate calibration structure');
  const checks: Check[] = [];
  const add = (name: string, selected: readonly StageCalibrationReport[], predicate: () => boolean) => {
    const known = selected.every(r => r.status === 'complete' && r.evidence.stageDifficulty.status === 'rated');
    checks.push({ name, status: !known ? 'unknown' : predicate() ? 'pass' : 'fail', puzzles: selected.map(r => r.puzzleId) });
  };
  const rank = (r: StageCalibrationReport) => r.status === 'complete' ? r.evidence.stageDifficulty.rank! : NaN;
  const classics = ordered.filter((_, i) => i < 6 && i % 2 === 0), keys = ordered.filter((_, i) => i < 6 && i % 2 === 1);
  add('source-band-classic-ranks-increase', classics, () => rank(classics[0]) < rank(classics[1]) && rank(classics[1]) < rank(classics[2]));
  add('source-band-key-ranks-increase', keys, () => rank(keys[0]) < rank(keys[1]) && rank(keys[1]) < rank(keys[2]));
  add('original-classic-scores-retained', ordered.slice(0, 6), () => ordered.slice(0, 6).every((r, i) =>
    r.classicReferences.base.human?.score?.total === sources[Math.floor(i / 2)].classicScore));
  const mechanical = ordered.slice(6);
  add('mechanical-work-does-not-inflate-planning-rank', mechanical, () => mechanical.every(r => rank(r) === 1));
  add('mechanical-work-increases', mechanical, () => mechanical.every((r, i) => r.status === 'complete'
    && r.evidence.graph.shortestMoves === [1, 3, 6][i]));
  const disclosures = [];
  for (const [i, r] of ordered.entries()) {
    const entry = UNLOCK_STAGE_CALIBRATION[i];
    add(`replayed-completion-${i + 1}`, [r], () => r.status === 'complete' && r.evidence.admission.solvability === 'solved');
    if (entry.variant === 'key') add(`supported-workload-rhythm-${entry.pair}`, [r],
      () => r.status === 'complete' && r.evidence.stageRhythm.status === 'pass');
    if (entry.variant === 'key') checks.push({ name: `fixed-visual-template-${entry.pair}`,
      status: r.presentation.status === 'pass' ? 'pass' : 'fail', puzzles: [r.puzzleId] });
    if (r.status !== 'complete' || r.evidence.stageDifficulty.status !== 'rated') continue;
    const stage = r.evidence.stageDifficulty, runtime = compileSortingPuzzle(entry.puzzle);
    replayEngineRoute(runtime, initialEngineState(runtime), stage.witness.route);
    if (entry.variant !== 'key') continue;
    assert.equal(stage.rank, Math.max(stage.beforeRank!, stage.afterRank!));
    const split = stage.witness.splitPour; assert.ok(split !== null && split > 0);
    let frame = initialEngineState(runtime);
    for (const action of stage.witness.route.slice(0, split)) {
      const next = transitionEngine(runtime, frame.state, frame.known, action); assert.ok(next.accepted); frame = next;
    }
    assert.deepEqual({ state: frame.state, known: frame.known }, stage.witness.unlockedFrame);
    assert.equal(r.classicReferences.stages[1].frameSha256, sha256(stage.witness.unlockedFrame));
    add(`mandatory-key-${entry.pair}`, [r], () => r.evidence.decisions.status === 'complete'
      && r.evidence.decisions.shortest.milestones.length === 1 && r.evidence.decisions.shortest.milestones[0].mandatory);
    try {
      const proof = auditBaselineDisclosure(entry.puzzle, stage.witness.route);
      disclosures.push({ puzzle: entry.puzzle.id, evidenceSha256: r.evidenceSha256, ...proof });
      checks.push({ name: `public-disclosure-${entry.pair}`, status: 'pass', puzzles: [r.puzzleId] });
    } catch (error) {
      // The shared disclosure auditor distinguishes complete rejection from a
      // limited solver through its assertion's actual search status.
      checks.push({ name: `public-disclosure-${entry.pair}`,
        status: error instanceof assert.AssertionError && error.actual === 'limitReached' ? 'unknown' : 'fail', puzzles: [r.puzzleId],
        reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { method: STAGE_CALIBRATION_METHOD, status: checks.some(c => c.status === 'fail') ? 'fail' as const
    : checks.some(c => c.status === 'unknown') ? 'unknown' as const : 'pass' as const, sources, checks, disclosures,
    limits: 'Automatic regression checks for this fixed sample, not player calibration or final quality acceptance. Source bands are selection intent. Empty-bottle counts are a generator concern, never a rating threshold. Public disclosure proves one common preparation then a visible solution in every enumerated inventory-consistent order; it does not prove all choices safe or equal human difficulty in all worlds.' };
}
