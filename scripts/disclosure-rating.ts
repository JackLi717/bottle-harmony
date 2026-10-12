import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { parseSortingPuzzle } from '../src/game/engineModel.ts';
import { evaluateDisclosure, disclosureClassicReferences } from './lib/disclosureAcceptance.ts';
import { CLOTH_EVALUATION_SAMPLES, existingRevealEvaluationSamples } from './lib/disclosureSamples.ts';
import { DISCLOSURE_PROOF_BUDGET } from './lib/disclosurePublicProof.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';
import type { DisclosureKind } from './lib/disclosureStageDifficulty.ts';
import { COMBINATION_SAMPLES } from './lib/combinationSamples.ts';

const args = process.argv.slice(2), options = new Map<string, string>();
const allowed = ['--kind', '--input', '--out', '--min-rank', '--max-rank', '--max-states', '--max-edges', '--max-stage-work', '--max-public-worlds', '--max-public-states', '--max-public-total-states', '--max-public-edges', '--max-public-ms'];
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid or duplicate option ${args[i]}`);
  options.set(args[i], args[i + 1]);
}
const kinds = ['cloth', 'reveal', 'key-cloth', 'key-reveal', 'two-key-reveal'] as const;
const kind = options.get('--kind'); if (kind !== 'combined' && !kinds.includes(kind as DisclosureKind)) throw Error('Provide a supported --kind or combined');
const out = resolve(options.get('--out') ?? `builds/${kind}-evaluation`), rel = relative(resolve('builds'), out);
if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw Error('Output must be a subdirectory of builds/');
if (options.has('--min-rank') !== options.has('--max-rank')) throw Error('Provide both difficulty target bounds');
const n = (key: string, fallback: number) => Number(options.get(key) ?? fallback);
const target = options.has('--min-rank') ? { min: n('--min-rank', 1), max: n('--max-rank', 7) } : null;
const evaluation = { target, maxStates: n('--max-states', 250000), maxEdges: n('--max-edges', 4000000), maxWork: n('--max-stage-work', 2000000),
  proofBudget: { ...DISCLOSURE_PROOF_BUDGET, maxWorlds: n('--max-public-worlds', 2048), maxPhaseStates: n('--max-public-states', 15000),
    maxTotalStates: n('--max-public-total-states', 250000), maxEdges: n('--max-public-edges', 2000000), maxMilliseconds: n('--max-public-ms', 180000) } };
const raw = options.has('--input') ? JSON.parse(readFileSync(resolve(options.get('--input')!), 'utf8'))
  : kind === 'combined' ? COMBINATION_SAMPLES : kind === 'cloth' ? CLOTH_EVALUATION_SAMPLES
    : kind === 'reveal' ? existingRevealEvaluationSamples() : COMBINATION_SAMPLES.filter(s => s.kind === kind).map(s => s.puzzle);
if (!Array.isArray(raw) || raw.length < 1 || raw.length > 1000) throw Error('Input must be an array of existing engine definitions');
const entries = raw.map(input => {
  const row = kind === 'combined' ? input as { kind?: string; puzzle?: unknown } : { kind, puzzle: input };
  if (!row || !kinds.includes(row.kind as DisclosureKind) || kind === 'combined' && (row.kind === 'cloth' || row.kind === 'reveal')) throw Error('Invalid combined definition kind');
  return { kind: row.kind as DisclosureKind, puzzle: parseSortingPuzzle(row.puzzle) };
});
if (new Set(entries.map(e => e.puzzle.id)).size !== entries.length) throw Error('Duplicate input puzzle IDs');
mkdirSync(out, { recursive: true });
const rows = entries.map(({ kind: entryKind, puzzle }) => {
  const acceptance = evaluateDisclosure(puzzle, entryKind, evaluation), classicReferences = disclosureClassicReferences(puzzle, acceptance);
  // Hash filenames instead of allowing puzzle IDs to escape the output folder.
  writeFileSync(resolve(out, sha256(puzzle) + '.json'), JSON.stringify({ puzzle, acceptance, classicReferences }, null, 2) + '\n');
  if (target && acceptance.status !== 'pass') process.exitCode = 1;
  return { id: puzzle.id, kind: entryKind, status: acceptance.status, label: acceptance.label, reasons: acceptance.reasons, rank: acceptance.difficulty?.rank ?? null,
    stageRanks: acceptance.difficulty?.stageRanks ?? null, worlds: acceptance.publicInformation?.worlds ?? null, evidenceSha256: acceptance.evidenceSha256 };
});
writeFileSync(resolve(out, 'summary.json'), JSON.stringify({ kind, evaluation, rows, evidenceSha256: sha256(rows) }, null, 2) + '\n');
writeFileSync(resolve(out, 'report.md'), `# ${kind === 'cloth' ? '颜色盖布' : kind === 'reveal' ? '逐层显色' : '钥匙组合'}：离线难度与自动验收\n\n只评价固定定义，不生成或安装题目。未提供整批目标时验收为未知。\n\n| 固定定义 | 阶段档位 | 整题档位 | 隐藏世界 | 结果与原因 |\n| --- | --- | --- | --- | --- |\n`
  + rows.map(r => `| ${r.id} | ${r.stageRanks?.join('／') ?? '未知'} | ${r.rank ?? '未知'} | ${r.worlds ?? '未知'} | ${r.label}：${r.reasons.map(x => x.reason).join('；')} |`).join('\n') + '\n');
console.log(`Evaluated ${rows.length} existing ${kind} definitions: ${out}`);
