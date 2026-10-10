import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import { reconstructCalibrationBoard } from './lib/unlockCalibrationSource.ts';
import { auditUnlockStages } from './lib/unlockStageAudit.ts';
import { assertUnlockTrialSolvable, unlockTrialStructure } from './lib/unlockTrialAudit.ts';

const reports = [], structures = new Set<string>();
mkdirSync('builds/unlock-calibration',{recursive:true});
for (const [index,entry] of UNLOCK_CALIBRATION.entries()) {
  const { puzzle } = entry;
  const colors = new Map(puzzle.units.map(u => [u.id,u.color]));
  assert.deepEqual(puzzle.containers.map(c => c.units.map(u => colors.get(u))),reconstructCalibrationBoard(entry));
  const structure = unlockTrialStructure(puzzle);
  assert.ok(!structures.has(structure),'Duplicate structure'); structures.add(structure);
  const audit = auditUnlockStages(puzzle);
  console.log(index + 1,audit.status,audit.status === 'complete' ? `${audit.shortestMoves} moves; ${audit.deadEnds} dead ends` : audit.reason);
  assertUnlockTrialSolvable(puzzle,audit);
  if (audit.status !== 'complete') throw new Error('Unknown is not admission');
  assert.ok(audit.triggers.every(t => t.mandatory));
  assert.equal(audit.participatingLocked.length,puzzle.locked.length);
  reports.push({ number:index + 1, puzzle:puzzle.id, pair:entry.pair, source:entry.source,
    definitionSha256:createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'),
    structureSha256:createHash('sha256').update(structure).digest('hex'), ...audit });
}
const encoded = JSON.stringify(reports,null,2) + '\n';
writeFileSync('builds/unlock-calibration/report.json',encoded);
const path = 'assets/levels/unlock-calibration-evidence.json';
if (process.argv.includes('--write-evidence')) writeFileSync(path,encoded);
else assert.equal(readFileSync(path,'utf8'),encoded,'Committed calibration evidence differs');
