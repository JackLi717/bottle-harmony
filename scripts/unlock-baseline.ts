import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { auditUnlockBaselines } from './lib/unlockBaselineAudit.ts';

assert.ok(process.argv.slice(2).every(arg => arg === '--write-evidence'));
const catalog = JSON.parse(readFileSync('assets/levels/mainline-catalog.json','utf8'));
const pairs = auditUnlockBaselines(catalog.records);
const report = { method:'classic-baseline-trial-v1', catalog:catalog.id,
  admission:'At least one fully replayed legal completion from the initial layout is required; not every legal choice must remain solvable. Free undo/reset remains available. Forward dead ends are reported, not a difficulty bonus. Mandatory midpoint, source, exact classic rating and public disclosure policy are separately verified.', pairs };
mkdirSync('builds/unlock-baseline',{recursive:true});
const encoded = JSON.stringify(report,null,2) + '\n';
writeFileSync('builds/unlock-baseline/report.json',encoded);
const path = 'assets/levels/unlock-baseline-evidence.json';
if (process.argv.includes('--write-evidence')) writeFileSync(path,encoded);
else assert.equal(readFileSync(path,'utf8'),encoded,'Committed classic-baseline evidence differs');
for (const pair of pairs) console.log(pair.mainline,pair.classicHuman.score!.total,pair.variants.map(v => ({variant:v.variant,moves:v.shortestMoves,deadEnds:v.deadEnds,worlds:v.disclosure?.worlds.length})));
