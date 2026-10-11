import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unlockArtExample } from '../src/game/unlockArtExamples.ts';
import { auditUnlockVisualTemplates, VISUAL_TEMPLATE_METHOD } from './lib/unlockVisualTemplates.ts';

// Existing internal artwork fixtures, not new playable or published content.
const samples = [unlockArtExample(1, 'color'), ...([1, 2, 3] as const).map(n => unlockArtExample(n, 'key'))];
const results = samples.map(puzzle => ({ puzzle: puzzle.id, ...auditUnlockVisualTemplates(puzzle) }));
const directory = resolve('builds/unlock-templates');
mkdirSync(directory, { recursive: true });
const status = results.every(r => r.status === 'pass') ? 'pass' : 'fail';
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ method: VISUAL_TEMPLATE_METHOD, status, results }, null, 2) + '\n');
writeFileSync(resolve(directory, 'report.md'), `# Fixed unlock visual templates

Method: ${VISUAL_TEMPLATE_METHOD}. Result: **${status}**.

Binary conformance only, no visual score. These four existing internal examples cover cloth and single/double/triple boxes. Checks use the shared board layout, cover dimensions and condition projection. Opening and seen-relock checks probe public geometry; they are not solver, fairness or device-rendering evidence. No production content or player storage is modified.

| Example | Template | Result | Mismatch |
| --- | --- | --- | --- |
${results.map(r => `| ${r.puzzle} | ${r.groups.map(g => g.template).join(', ') || '—'} | ${r.status} | ${r.issues.map(i => i.code).join(', ') || '—'} |`).join('\n')}
`);
if (status !== 'pass') process.exitCode = 1;
console.log(`Fixed visual templates: ${status}; ${directory}/report.md`);
