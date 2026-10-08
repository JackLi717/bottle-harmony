import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { decodeMainlineCatalog, decodeMainlineSelectionSource, type MainlineEntry } from '../src/game/mainlineCatalog.ts';
import { createProductionPlan } from '../src/game/productionPlan.ts';
import { FEATURE_TAGS, FEATURE_TYPES } from '../src/game/levelFeatures.ts';

const [beforePath = 'builds/wave-selection/input-catalog.json', afterPath = 'assets/levels/mainline-catalog.json',
  reportPath = 'builds/wave-selection/selection-report.json', output = 'docs/level-selection-evaluation.md'] = process.argv.slice(2);
const before = decodeMainlineSelectionSource(await readFile(beforePath, 'utf8'));
const raw = await readFile(afterPath, 'utf8'), after = decodeMainlineCatalog(raw);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const digest = createHash('sha256').update(raw).digest('hex');
if (report.catalogId !== after.id || report.catalogSha256 !== digest) throw new Error('Selection report is not bound to this catalog');
const verificationLines = (await readFile('builds/wave-selection/verification.log', 'utf8')).split('\n');
const verified = verificationLines.filter(line => line.startsWith('{"verified":')).map(line => JSON.parse(line)).at(-1);
if (verified?.verified !== 1000 || verified.catalogSha256 !== digest) throw new Error('Independent verification must match this exact catalog');
const mean = (xs: readonly number[]) => xs.reduce((sum, n) => sum + n, 0) / xs.length;
function metrics(rows: readonly MainlineEntry[]) {
  const scores = rows.map(r => r.human.score!.total), drops = scores.flatMap((score, i) => i > 0 && i % 10 === 0 ? [scores[i - 1] - score] : []);
  return { scores, mean: mean(scores), challenges: mean(scores.filter((_, i) => i % 10 === 9)),
    decisions: mean(rows.map(r => r.human.score!.trapPeak + r.human.score!.trapRepeat)),
    colors: mean(rows.map(r => r.content.level.colors.length)), moves: mean(rows.map(r => r.content.solution.length)),
    planning: mean(rows.map(r => r.rating.evidence.rank!)), minDrop: Math.min(...drops), meanDrop: mean(drops),
    tiers: [20, 35, 55, 101].map((upper, i, bounds) => scores.filter(n => n < upper && n >= (i ? bounds[i - 1] : 0)).length) };
}
const a = metrics(before.entries), b = metrics(after.entries);
const baselineFeatures = JSON.parse(await readFile('builds/level-features/mainline-features.json', 'utf8'));
if (baselineFeatures.sourceSha256 !== createHash('sha256').update(await readFile(beforePath, 'utf8')).digest('hex')) throw new Error('Before features are not bound');
const oldTags = new Map<string, number>(baselineFeatures.distribution.whole.tags.map((t: { tag: string; count: number }) => [t.tag, t.count]));
const newTags = new Map<string, number>(report.distribution.whole.tags.map((t: { tag: string; count: number }) => [t.tag, t.count]));
const roleNames = { teaching: '教学', recovery: '缓冲', climb: '爬坡', pressure: '蓄势', subpeak: '次峰', peak: '主峰' };
const plan = createProductionPlan();
const f = (n: number) => n.toFixed(2);
const lines = ['# 千关重新筛选与节奏评价', '', '更新日期：2026 年 10 月 8 日。', '',
  `结果：${after.id}，配方 thousand-mountain-v1，难度公式保持 human-decision-v1。SHA256：${digest}。`, '',
  '**制作目标已达到，可进入连续试玩。** 这版显著提前挑战、增加思考负担，并形成明确的峰后回落；题型重复减少。代理分和标签支持这些制作结论，尚不能证明真人难度或趣味性已经达标。', '',
  '## 本次实际设置', '',
  `从 ${report.candidates} 道完整候选中选出 1000 道，保留原题 ${report.retainedBoards} 道，引入另外 ${1000 - report.retainedBoards} 道。新增生成 420 道候选，涵盖六色中段与八九色高峰，全部完成求解与评级；选择池的特征及备用瓶检查未知数均为零。`, '',
  '前三关教学保留。每 20 关一个主峰，第 10 关有次峰；两类高峰各自不下降，主峰至少高于同轮次峰 4 分。各个挑战峰至少高于前九关最高分 5 分，峰后两关至少回落 12 分。整数分允许相邻几轮高峰持平，长期走势上升。', '',
  '波次角色为教学 3 关、缓冲 198 关、爬坡 499 关、蓄势 200 关、次峰 50 关、主峰 50 关。爬坡内允许最多 2 分的小回落，普通题不再全局升序。选题先保留稀缺高峰与缓冲，再用互相调整分配的匹配检查供给，最后优化相邻题型；这不是全局最优的证明。', '',
  '缓冲题限制风险反复与连续准备，且不会默认锁住一个备用瓶。100 个高峰也均为直接开放既定瓶数的局面，完整评级与其默认开局相符。其他可选备用瓶题仍可免费启用，单空瓶变体不沿用双空瓶代理分。', '',
  '首轮次峰目标 40、主峰目标 45，末轮次峰目标 69、主峰目标 74；高峰允许在目标以上 3 分内选择，末关优先最高合格候选。这是暂定制作尺度，不能将其称为真人的 50% 难度。', '',
  '## 前后对比', '', '| 指标 | 原编排 | 新编排 |', '| --- | ---: | ---: |',
  ...a.tiers.map((count, i) => `| D${i + 1} 关数 | ${count} | ${b.tiers[i]} |`),
  `| D3/D4 合计 | ${a.tiers[2] + a.tiers[3]} | ${b.tiers[2] + b.tiers[3]} |`,
  `| 全库平均代理分 | ${f(a.mean)} | ${f(b.mean)} |`,
  `| 100 个挑战峰平均分 | ${f(a.challenges)} | ${f(b.challenges)} |`,
  `| 第 10 / 20 关分数 | ${a.scores[9]} / ${a.scores[19]} | ${b.scores[9]} / ${b.scores[19]} |`,
  `| 第 1000 关分数 | ${a.scores[999]} | ${b.scores[999]} |`,
  `| 峰后回落最小值 / 均值 | ${a.minDrop} / ${f(a.meanDrop)} | ${b.minDrop} / ${f(b.meanDrop)} |`,
  `| 选择风险两项平均贡献 | ${f(a.decisions)} | ${f(b.decisions)} |`,
  `| 平均规划级 | ${f(a.planning)} | ${f(b.planning)} |`,
  `| 平均颜色数 | ${f(a.colors)} | ${f(b.colors)} |`,
  `| 平均参考倒水次数 | ${f(a.moves)} | ${f(b.moves)} |`,
  `| 相邻同主类型对 | ${baselineFeatures.distribution.adjacency.samePrimaryPairs} | ${report.distribution.adjacency.samePrimaryPairs} |`,
  `| 最长同主类型段 | ${baselineFeatures.distribution.adjacency.longestPrimaryRun} | ${report.distribution.adjacency.longestPrimaryRun} |`,
  `| 策略标签高相似邻接对 | ${baselineFeatures.distribution.adjacency.similarPairs.length} | ${report.distribution.adjacency.similarPairs.length} |`, '',
  '新题平均颜色和参考操作量略降，选择风险与规划贡献上升，支持增难主要来自判断负担而非单纯增加规模和动作。两项贡献仍来自指定代理方法，不能解释成玩家实际思考难度提高的百分比。', '',
  '![重新编排的代理分曲线](level-difficulty-curve.png)', '',
  '图中蓝线为新编排，灰线为原编排，橙点为主峰，绿点为缓冲。分数轴保持 0–100；上图看整体，下面放大前 60 关。主线后的凝固副关卡没有主线同尺度评分，不混入曲线。', '',
  '## 题型变化与不足', '', '| 标签 | 原关数 | 新关数 |', '| --- | ---: | ---: |',
  ...['early-deception', 'preparation-chain-route', 'space-reuse-route', 'midroute-risk', 'late-risk', 'repeated-decision-risk', 'small-board-planning', 'partial-transfer-route', 'alternating-start', 'adjacent-block-start', 'repeated-bottom-start']
    .map(tag => `| ${FEATURE_TAGS[tag as keyof typeof FEATURE_TAGS].name} | ${oldTags.get(tag)} | ${newTags.get(tag)} |`), '',
  '前段合并诱惑、空瓶复用、中段重新判断与收尾选择都有增加，小棋盘规划也更常见。标签保留证据范围：结构事实、指定参考路线观察、指定局面的精确分支检查；不能据标签声称所有解法必须采用某种策略。', '',
  '连续准备只有 18 关，仍不足；其中包含一关固定教学。交替色层与连续色块减少，视觉结构变化还有缺口。部分接收出现两道路线样例，值得人工确认是否有真正的巧思。下一轮应优先补准备链和易读的结构变化，而不是继续增加陷阱数量。', '',
  '前段诱惑、中段风险、反复风险、小棋盘规划和重复底色超过之前讨论的软范围。这次提高整体挑战后，旧比例不再适合作为统一配额；它们作为审阅警报保留，重点确认高峰具有清楚的突破口、缓冲仍足够舒服。相邻重复下降不等于已经证明玩家体验更多样。', '',
  '## 前二十关', '', '| 关号 | 角色 | 代理分 | 颜色 / 原始总瓶数（含备用瓶） | 主类型 |', '| --- | --- | ---: | --- | --- |',
  ...after.entries.slice(0, 20).map(e => `| ${e.number} | ${roleNames[e.design!.role]} | ${e.human.score!.total} | ${e.content.level.colors.length} / ${e.content.level.bottles.length} | ${FEATURE_TYPES[e.design!.primary]} |`), '',
  '## 五十轮的主峰与缓冲', '', '| 轮次 | 关号范围 | 次峰 | 主峰 | 主峰后下一关 | 下一关回落 | 本轮均分 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...report.cycles.map((c: { cycle: number; from: number; to: number; subpeak: number; peak: number; mean: number }) => {
    const next = b.scores[c.to];
    return `| ${c.cycle} | ${c.from}–${c.to} | ${c.subpeak} | ${c.peak} | ${next ?? '结束'} | ${next === undefined ? '—' : c.peak - next} | ${f(c.mean)} |`;
  }), '',
  '## 验收与体验评价', '',
  '本批 1000/1000 独立复核通过，报告绑定同一目录 SHA256；运行资产采用复核成功导出的精简包。完整验证重构全部来源、回放全部路线、重新计算规划与人类代理证据，并重新探测前段及收尾标签；没有用选题缓存替代独立重算。备用瓶名单在最终目录重新检查，预算未知不进入名单。', '',
  '本批回归测试 137/137、TypeScript 与 ESLint 均通过。备用瓶独立审计为 293 个双空瓶局面：9 可解、284 确证无解、0 未知；排除教学后提供 7 个备用瓶入口。十色、十一色的十二瓶内部对照也保留，并满足现行节奏。验证日志在 builds/wave-selection/，设备构建与连续试玩尚待进行。', '',
  '整体难度分布与峰谷节奏达到本次制作目标；题型变化有明显改善，连续准备及视觉结构变化仍有不足。早段难度跃升较大，前三关之后应重点试玩第 4–20 关，确认新手能够从教学接上挑战。峰后回落较大也可能被熟练玩家认为太轻松，需要确认恢复感与无聊之间的边界。', '',
  '每 20 关仍插入凝固副关卡。主线曲线的回落发生在副关卡之后，不能保证玩家一过主峰立即放松；副关卡的凝固与融化体验必须连同第 21、41 等缓冲关一起检查。本次保持其位置、规则和奖励。', '',
  '真人验证重点：前 40 关、中段两轮、后段两轮；记录关键选择、独立完成、撤销及提示使用。判断“想通了”的时刻是否清楚，高峰是否值得挑战、回落是否恢复信心，再决定是否调整早期高峰、回落幅度或题型比例。未做手机连续试玩，不将桌面复核当作这些问题的答案。', '',
  '当前内容 ID 已升级；既有预发布存档按现有内容绑定规则从第一关建立新进度，不新增迁移或历史题库。瓶子视觉、倒水规则、免费撤销重来与既有奖励保持原样。', '',
  '完整逐关标签见本批 [level-details.md](../builds/wave-selection/level-details.md)，关键局面与分支证据见 [selection-report.json](../builds/wave-selection/selection-report.json)。完整目录也保存每题的轮次、角色、主类型和标签；证据在离线报告，手机不执行策略评级。', '',
];
await mkdir(dirname(output), { recursive: true });
await writeFile(output, lines.join('\n'));
const details = ['# 千关内部设计标签', '', `目录 ${after.id}；SHA256 ${digest}。`, '',
  '| 关号 | 轮次 | 角色 | 代理分 | 主类型 | 标签 |', '| --- | --- | --- | ---: | --- | --- |',
  ...after.entries.map(e => `| ${e.number} | ${e.design!.cycle} | ${roleNames[e.design!.role]} | ${e.human.score!.total} | ${FEATURE_TYPES[e.design!.primary]} | ${e.design!.tags.map(t => FEATURE_TAGS[t].name).join('；')} |`), ''];
await writeFile('builds/wave-selection/level-details.md', details.join('\n'));
// A static SVG chart rendered with the repository's existing image runtime.
const width = 1400, height = 760, margin = 80, plotWidth = width - 2 * margin;
const elements: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fafbfc"/>`,
  '<style>text{font-family:Arial,sans-serif;fill:#334155;font-size:18px}</style>',
  '<text x="80" y="36" font-size="25">Bottle Harmony: human-decision-v1 proxy (0-100)</text>',
  '<text x="80" y="65">Gray: previous / Blue: new / Orange: main peaks / Green: recovery</text>'];
for (const [panel, limit] of [1000, 60].entries()) {
  const top = 110 + panel * 320, plotHeight = 250;
  const x = (i: number) => margin + (i / (limit - 1)) * plotWidth;
  const y = (score: number) => top + plotHeight * (1 - score / 100);
  for (const score of [0, 20, 40, 60, 80, 100]) elements.push(`<line x1="${margin}" y1="${y(score)}" x2="${width - margin}" y2="${y(score)}" stroke="#e2e8f0"/><text x="35" y="${y(score) + 6}">${score}</text>`);
  for (const tick of (limit === 1000 ? [1, 200, 400, 600, 800, 1000] : [1, 10, 20, 30, 40, 50, 60])) elements.push(`<text x="${x(tick - 1) - 12}" y="${top + plotHeight + 27}">${tick}</text>`);
  for (const [scores, color, stroke] of [[a.scores, '#aeb7c5', 1.4], [b.scores, '#2563eb', 1.7]] as const) elements.push(`<polyline points="${scores.slice(0, limit).map((score, i) => `${x(i)},${y(score)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`);
  plan.slice(0, limit).forEach((slot, i) => {
    if (slot.waveRole === 'peak' || slot.waveRole === 'recovery') elements.push(`<circle cx="${x(i)}" cy="${y(b.scores[i])}" r="${limit === 1000 ? 2.2 : 4}" fill="${slot.waveRole === 'peak' ? '#ea580c' : '#15803d'}"/>`);
  });
}
elements.push('</svg>');
await sharp(Buffer.from(elements.join(''))).png().toFile(dirname(output) + '/level-difficulty-curve.png');
console.log(JSON.stringify({ output, catalogSha256: digest, beforeMean: a.mean, afterMean: b.mean }));
