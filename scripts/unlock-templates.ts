import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unlockArtExample } from '../src/game/unlockArtExamples.ts';
import { auditUnlockVisualTemplates, VISUAL_TEMPLATE_METHOD } from './lib/unlockVisualTemplates.ts';
import { auditUnlockClothTemplates, clothTemplateProbe, CLOTH_TEMPLATE_METHOD } from './lib/unlockClothTemplates.ts';

// Existing internal artwork fixtures, not new playable or published content.
const samples = [unlockArtExample(1, 'color'), ...([1, 2, 3] as const).map(n => unlockArtExample(n, 'key'))];
const results = samples.map(puzzle => ({ puzzle: puzzle.id, ...auditUnlockVisualTemplates(puzzle) }));
const cloth = ([8, 10, 12] as const).flatMap(count => ([1, 2, 3, 4] as const).map(keys => {
  const puzzle = clothTemplateProbe(count, keys);
  return { puzzle: puzzle.id, bottles: count, ...auditUnlockClothTemplates(puzzle) };
}));
const directory = resolve('builds/unlock-templates');
mkdirSync(directory, { recursive: true });
const status = [...results, ...cloth].every(r => r.status === 'pass') ? 'pass' : 'fail';
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ methods: [VISUAL_TEMPLATE_METHOD, CLOTH_TEMPLATE_METHOD], status, results, cloth }, null, 2) + '\n');
writeFileSync(resolve(directory, 'report.md'), `# Fixed unlock visual templates

Methods: ${VISUAL_TEMPLATE_METHOD}, ${CLOTH_TEMPLATE_METHOD}. Result: **${status}**.

Binary conformance only, no visual score. Four existing examples check shared cloth and single/double/triple box geometry. Twelve additional geometry probes check 8/10/12 bottles with four row-end covers and 1–4 Key color groups. Key means independent color condition, not a forced stage order. Pair orientation and palette permutations are unrestricted. Opening and seen-relock probes check public projection; they are not playable content, solver, fairness or device-rendering evidence. No production content or player storage is modified.

| Example | Template | Result | Mismatch |
| --- | --- | --- | --- |
${results.map(r => `| ${r.puzzle} | ${r.groups.map(g => g.template).join(', ') || '—'} | ${r.status} | ${r.issues.map(i => i.code).join(', ') || '—'} |`).join('\n')}

| Bottles | Keys | Group sizes | Result | Mismatch |
| --- | --- | --- | --- | --- |
${cloth.map(r => `| ${r.bottles} | ${r.keyCount} | ${r.groupSizes.join('+')} | ${r.status} | ${r.issues.map(i => i.code).join(', ') || '—'} |`).join('\n')}
`);
if (status !== 'pass') process.exitCode = 1;
console.log(`Fixed visual templates: ${status}; ${directory}/report.md`);
