import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { DOUBLE_KEY_SAMPLES } from './lib/unlockDoubleKeySamples.ts';
import { evaluateDoubleKey, doubleKeyClassicReferences } from './lib/unlockDoubleKeyAcceptance.ts';
import { PUBLIC_DISCLOSURE_BUDGET } from './lib/unlockPublicDisclosure.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';

const args = process.argv.slice(2), allowed = ['--out', '--min-rank', '--max-rank', '--max-states', '--max-edges', '--max-stage-work', '--max-public-worlds', '--max-public-states', '--max-public-total-states', '--max-public-ms'];
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!allowed.includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${args[i]}`);
  options.set(args[i], args[i + 1]);
}
const directory = resolve(options.get('--out') ?? 'builds/unlock-two-key');
const within = relative(resolve('builds'), directory);
if (!within || within === '..' || within.startsWith(`..${sep}`) || resolve(directory) === resolve('builds')) throw new Error('Output must be a subdirectory of ignored builds/');
if (options.has('--min-rank') !== options.has('--max-rank')) throw new Error('Provide both --min-rank and --max-rank');
const number = (name: string, fallback: number) => options.has(name) ? Number(options.get(name)) : fallback;
const target = options.has('--min-rank') ? { min: number('--min-rank', 1), max: number('--max-rank', 7) } : null;
const evaluation = { target, maxStates: number('--max-states', 250000), maxEdges: number('--max-edges', 4000000), maxWork: number('--max-stage-work', 2000000),
  disclosureBudget: { ...PUBLIC_DISCLOSURE_BUDGET, maxWorlds: number('--max-public-worlds', 2048), maxStatesPerWorld: number('--max-public-states', 100000),
    maxTotalStates: number('--max-public-total-states', 1000000), maxMilliseconds: number('--max-public-ms', 30000) } };
mkdirSync(directory, { recursive: true });
const summary = [];
for (const sample of DOUBLE_KEY_SAMPLES) {
  console.log(`Evaluating ${sample.puzzle.id}`);
  const acceptance = evaluateDoubleKey(sample.puzzle, evaluation), classicReferences = doubleKeyClassicReferences(sample.puzzle, acceptance);
  writeFileSync(resolve(directory, sample.puzzle.id + '.json'), JSON.stringify({ puzzle: sample.puzzle, acceptance, classicReferences }, null, 2) + '\n');
  const d = acceptance.difficulty, rhythm = acceptance.rhythm;
  summary.push({ name: sample.name, id: sample.puzzle.id, status: acceptance.status, label: acceptance.label, reasons: acceptance.reasons,
    rank: d?.rank ?? null, stageRanks: d?.stageRanks ?? null, work: rhythm?.stageWork ?? null,
    covered: sample.puzzle.locked.length, bottles: sample.puzzle.containers.length, worlds: acceptance.publicInformation?.worlds.length ?? null,
    observations: acceptance.publicInformation?.branches.length ?? null, evidenceSha256: acceptance.evidenceSha256 });
  if (target && acceptance.status !== 'pass') process.exitCode = 1;
}
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ method: 'sequential-two-key-fixed-samples-v1', evaluation, summary, evidenceSha256: sha256(summary) }, null, 2) + '\n');
writeFileSync(resolve(directory, 'report.md'), '# 双钥匙先后依赖：固定样题自动验收\n\n只验证算法，不生成体验题库或修改正式内容。机械对照保持低档；未提供统一难度目标时结果为未知。\n\n'
  + '| 样题 | 遮盖 | 三段档位 | 整题档 | 三段整理量 | 隐藏世界／首次观察 | 结果与原因 |\n| --- | --- | --- | --- | --- | --- | --- |\n'
  + summary.map(s => `| ${s.name} | ${s.covered}/${s.bottles} | ${s.stageRanks?.join('／') ?? '未知'} | ${s.rank ?? '未知'} | ${s.work?.join('／') ?? '未知'} | ${s.worlds ?? '未知'}／${s.observations ?? '未知'} | ${s.label}：${s.reasons.map(r => r.reason).join('；')} |`).join('\n') + '\n');
console.log(`Fixed samples complete: ${directory}`);
