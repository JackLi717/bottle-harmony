import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { assertUnlockTrialSolvable, auditUnlockTrial, unlockTrialStructure } from './lib/unlockTrialAudit.ts';
import { createEngineSession } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';

const directory = 'builds/unlock-trial';
mkdirSync(directory, { recursive: true });
const database = new DatabaseSync(`${directory}/acceptance.sqlite`);
database.exec('CREATE TABLE IF NOT EXISTS trial (id TEXT PRIMARY KEY, definition TEXT NOT NULL, evidence TEXT NOT NULL)');
database.exec('DELETE FROM trial'); // Isolated diagnostic database only.
const reports = [];
const structures = new Set<string>();
for (const [index, entry] of UNLOCK_TRIAL.entries()) {
  const puzzle = entry.puzzle;
  const structure = unlockTrialStructure(puzzle);
  if (structures.has(structure)) throw new Error(`Duplicate structure: ${puzzle.id}`);
  structures.add(structure);
  for (const color of puzzle.colors) if (puzzle.units.filter(u => u.color === color).length !== 4) throw new Error(`Inventory: ${puzzle.id}/${color}`);
  const evidence = auditUnlockTrial(puzzle);
  console.log(index + 1, evidence.status, evidence.states, evidence.status === 'complete' ? `${evidence.deadEnds} dead ends, ${evidence.shortestMoves} moves` : evidence.reason);
  assertUnlockTrialSolvable(puzzle,evidence);
  if (evidence.status !== 'complete') throw new Error(`Unknown trial: ${puzzle.id}`);
  const allOpen = auditUnlockTrial({ ...puzzle, locked: [], triggers: [] });
  if (allOpen.status !== 'complete' || allOpen.shortestMoves === null) throw new Error(`All-open comparison unknown: ${puzzle.id}`);
  const report = { number: index + 1, focus: entry.focus, definitionSha256: createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'),
    structureSha256: createHash('sha256').update(structure).digest('hex'), ...evidence,
    allOpen: { states: allOpen.states, shortestMoves: allOpen.shortestMoves },
    limits: 'Fixed layouts, forward legal play until completion; excludes undo histories and alternative secret initial layouts. No human difficulty grade.' };
  database.prepare('INSERT INTO trial VALUES (?,?,?)').run(puzzle.id,JSON.stringify(puzzle),JSON.stringify(report));
  const readBack = database.prepare('SELECT * FROM trial WHERE id=?').get(puzzle.id)!;
  if (readBack.definition !== JSON.stringify(puzzle) || readBack.evidence !== JSON.stringify(report)) throw new Error('SQLite read-back mismatch');
  const restored = createEngineSession(JSON.parse(String(readBack.definition)), 'offline-readback');
  replayEngineRoute(restored.runtime,restored,JSON.parse(String(readBack.evidence)).route);
  reports.push(report);
  writeFileSync(`${directory}/report.json`,JSON.stringify(reports,null,2) + '\n');
}
database.close();
const path = 'assets/levels/unlock-trial-evidence.json', encoded = JSON.stringify(reports,null,2) + '\n';
if (process.argv.includes('--write-evidence')) writeFileSync(path,encoded);
else if (readFileSync(path,'utf8') !== encoded) throw new Error('Committed trial evidence differs; inspect before --write-evidence');
