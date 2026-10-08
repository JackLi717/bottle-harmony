import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildFeatureDistribution, type FeatureRow } from '../src/game/featureDistribution.ts';
import { analyzeLevelFeatures, FEATURE_MODEL, FEATURE_TAGS, FEATURE_TYPES } from '../src/game/levelFeatures.ts';
import { decodeMainlineCatalog } from '../src/game/mainlineCatalog.ts';

const args = process.argv.slice(2), values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const name = args[i].slice(2), value = args[i + 1];
  if (!args[i].startsWith('--') || !['input', 'output', 'markdown', 'late-ms', 'late-states', 'early-ms', 'early-states', 'limit'].includes(name)
    || !value || values.has(name)) throw new Error('Use --input catalog --output report.json --markdown report.md --late-ms 500 --late-states 30000 --early-ms 4000 --early-states 100000 --limit 1000');
  values.set(name, value);
}
const input = resolve(values.get('input') ?? 'assets/levels/mainline-catalog.json');
const output = resolve(values.get('output') ?? 'builds/level-features/mainline-features.json');
const markdown = resolve(values.get('markdown') ?? 'builds/level-features/mainline-features.md');
if (new Set([input, output, markdown]).size !== 3) throw new Error('Feature outputs must differ from input and each other');
// Asset paths are never valid destinations for a descriptive offline sidecar.
if ([output, markdown].some(path => path.startsWith(`${resolve('assets')}/`))) throw new Error('Feature reports belong outside runtime assets');
if ((await stat(input)).size > 32000000) throw new Error('Catalog exceeds byte limit');
const raw = await readFile(input, 'utf8'), catalog = decodeMainlineCatalog(raw);
const maxMilliseconds = Number(values.get('late-ms') ?? 500), maxStates = Number(values.get('late-states') ?? 30000);
const earlyMilliseconds = Number(values.get('early-ms') ?? 4000), earlyStates = Number(values.get('early-states') ?? 100000);
const limit = Number(values.get('limit') ?? 1000);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('limit must be 1..1000');
const rows: FeatureRow[] = [];
for (const entry of catalog.entries.slice(0, limit)) {
  rows.push({ number: entry.number, report: analyzeLevelFeatures(entry.content.level, entry.content.solution,
    entry.human, entry.rating.evidence.rank!, { lateProbe: { maxStates, maxMilliseconds },
      earlyProbe: { maxStates: earlyStates, maxMilliseconds: earlyMilliseconds } }) });
  if (rows.length % 50 === 0) console.log(`classic features ${rows.length}/${limit}`);
  // Let cancellation and other host work proceed between bounded level probes.
  await new Promise<void>(done => setImmediate(done));
}
const distribution = buildFeatureDistribution(rows);
const sourceSha256 = createHash('sha256').update(raw).digest('hex');
const report = { format: 'bottle-harmony-level-features', version: 1, model: FEATURE_MODEL,
  catalogId: catalog.id, sourceSha256, totalCatalogLevels: catalog.entries.length, analyzedLevels: rows.length,
  options: { late: { maxStates, maxMilliseconds }, early: { maxStates: earlyStates, maxMilliseconds: earlyMilliseconds } }, distribution, records: rows };
const lines = [
  '# Bottle Harmony 经典关卡特征分析', '',
  `目录：${catalog.id}；特征模型：${FEATURE_MODEL}；已分析 ${rows.length}/${catalog.entries.length} 关。`, '',
  `来源 SHA256：${sourceSha256}。`, '',
  '这份离线报告保留当前题库和难度公式。标签是结构事实、指定路线观察或观察点证据，不代表所有解法必然如此，也不代表玩家评价。', '',
  '原人类代理的三个观察点来自其规范化最短路线；本报告的路线指标及新增前段、收尾局面来自 content.solution，两条路线可能不同。动作下标从 0 开始，表示倒水之前的局面。', '',
  `前段检查：完整 ${distribution.whole.earlyCoverage.complete}，预算未知 ${distribution.whole.earlyCoverage.unknown}，未找到适用点 ${distribution.whole.earlyCoverage.notApplicable}。前段标签以完整检查数为分母。`, '',
  `收尾检查：完整 ${distribution.whole.lateCoverage.complete}，预算未知 ${distribution.whole.lateCoverage.unknown}，未请求 ${distribution.whole.lateCoverage.notRequested}。收尾标签以完整检查数为分母。`, '',
  '## 多标签分布', '', '| 标签 | 关数 | 覆盖分母 | 示例关号 |', '| --- | --- | --- | --- |',
  ...distribution.whole.tags.map(tag => `| ${tag.name} | ${tag.count} | ${tag.denominator} | ${tag.examples.join('、')} |`), '',
  '## 多标签覆盖建议', '',
  '下列比例是讨论用软目标，可以重叠，不能相加为 100%。前三关教学排除；交替色层仅在 D1/D2 内建议。目标不替代现有生产约束或难度坡度，也不自动修改题库。', '',
  '| 标签 | 适用关数 | 已命中 | 未知 | 建议关数范围 | 确认缺口 |', '| --- | --- | --- | --- | --- | --- |',
  ...distribution.recommendations.targets.map(target => `| ${target.name} | ${target.eligible} | ${target.count} | ${target.unknown} | ${target.minimum}–${target.maximum} | ${target.confirmedShortfall} |`), '',
  '## 主类型摘要', '',
  '主类型按固定优先级分配，方便浏览；多标签分布保留共存特征。其他整理型是未命中前列条件的兜底类型，不能直接解释为容易。', '',
  '| 类型 | 关数 |', '| --- | --- |', ...distribution.whole.primary.map(type => `| ${type.name} | ${type.count} |`), '',
  '## 难度档分布', '', '| 难度档 | 关数 | 完整收尾检查 |', '| --- | --- | --- |',
  ...distribution.byTier.map(tier => `| ${tier.tier} | ${tier.levels} | ${tier.lateCoverage.complete} |`), '',
  '## 五十关阶段分布', '', '| 阶段 | 关数 | 前段诱惑 | 连续准备 | 空间周转 | 收尾选择 | 宽松多开局 | 多段风险 | 其他整理 | 证据未完成 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...distribution.stages.map(stage => `| ${stage.stage} | ${stage.levels} | ${stage.primary.map(type => type.count).join(' | ')} |`), '',
  '## 相邻重复观察', '',
  `相邻主类型相同：${distribution.adjacency.samePrimaryPairs}/${distribution.adjacency.pairs}；最长连续同主类型：${distribution.adjacency.longestPrimaryRun} 关。`, '',
  `策略标签 Jaccard 相似度至少 0.8 的相邻对：${distribution.adjacency.similarPairs.length}。空标签不视为相似，收尾未知不作为无风险证据。相似度用于审阅，不替代结构去重。`, '',
  '## 逐关内部标签', '', '| 关号 | 代理分 | 主类型 | 标签 | 前段覆盖 | 收尾覆盖 |', '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(row => `| ${row.number} | ${row.report.humanScore} | ${FEATURE_TYPES[row.report.primary]} | ${row.report.tags.map(tag => FEATURE_TAGS[tag].name).join('；')} | ${row.report.early.status} | ${row.report.late.status} |`), '',
  '关键动作、原始统计、新增观察点的候选倒水及可解分支的完整后续路线见同批 JSON 报告。', '',
];
async function atomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, value, { flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => {}); }
}
await atomic(output, `${JSON.stringify(report, null, 2)}\n`);
await atomic(markdown, lines.join('\n'));
console.log(JSON.stringify({ output, markdown, catalogId: catalog.id, sourceSha256,
  whole: distribution.whole, adjacency: { ...distribution.adjacency, similarPairs: distribution.adjacency.similarPairs.length } }, null, 2));
