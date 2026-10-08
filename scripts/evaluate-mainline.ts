import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import sharp from 'sharp';
import { decodeMainlineCatalog, decodeMainlineSelectionSource, type MainlineEntry } from '../src/game/mainlineCatalog.ts';
import { createProductionPlan } from '../src/game/productionPlan.ts';
import { FEATURE_TAGS, FEATURE_TYPES } from '../src/game/levelFeatures.ts';

const [beforePath = 'builds/wave-selection/input-catalog.json', afterPath = 'assets/levels/mainline-catalog.json',
  reportPath = 'builds/wave-selection/selection-report.json', output = 'builds/wave-selection/evaluation.md'] = process.argv.slice(2);
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
const lines = ['# 千关选关诊断', '',
  `目录：${after.id}；SHA256：${digest}。`, '',
  '本报告按输入生成，仅用于离线诊断；代理分和标签不代表玩家实测难度。', '',
  `候选 ${report.candidates}，保留原布局 ${report.retainedBoards}，另选 ${after.entries.length - report.retainedBoards}。`, '',
  '## 前后指标', '', '| 指标 | 输入目录 | 输出目录 |', '| --- | ---: | ---: |',
  ...a.tiers.map((count, i) => `| D${i + 1} 关数 | ${count} | ${b.tiers[i]} |`),
  ...(['mean', 'challenges', 'decisions', 'planning', 'colors', 'moves', 'minDrop', 'meanDrop'] as const)
    .map(key => `| ${key} | ${f(a[key])} | ${f(b[key])} |`), '',
  '![代理分曲线](level-difficulty-curve.png)', '',
  '灰线为输入目录，蓝线为输出目录，橙点为主峰，绿点为缓冲；不包含不同尺度的副关评分。', '',
  '## 特征分布', '', '| 标签 | 输入关数 | 输出关数 |', '| --- | ---: | ---: |',
  ...Object.entries(FEATURE_TAGS).map(([tag, feature]) => `| ${feature.name} | ${oldTags.get(tag)} | ${newTags.get(tag)} |`), '',
  '## 前二十关', '', '| 关号 | 角色 | 代理分 | 颜色 / 原始总瓶数 | 主类型 |', '| --- | --- | ---: | --- | --- |',
  ...after.entries.slice(0, 20).map(e => `| ${e.number} | ${roleNames[e.design!.role]} | ${e.human.score!.total} | ${e.content.level.colors.length} / ${e.content.level.bottles.length} | ${FEATURE_TYPES[e.design!.primary]} |`), '',
  '## 各轮主峰与缓冲', '', '| 轮次 | 范围 | 次峰 | 主峰 | 主峰后下一关 | 回落 | 均分 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ...report.cycles.map((c: { cycle: number; from: number; to: number; subpeak: number; peak: number; mean: number }) => {
    const next = b.scores[c.to];
    return `| ${c.cycle} | ${c.from}–${c.to} | ${c.subpeak} | ${c.peak} | ${next ?? '结束'} | ${next === undefined ? '—' : c.peak - next} | ${f(c.mean)} |`;
  }), '',
  '## 证据范围', '',
  `独立复核日志：${verified.verified} 题，绑定此目录 SHA256。`, '',
  '本脚本未执行游戏回归、设备验收或商店操作，不对这些结果作推断。', '',
  `现行规则见[制作配方](${relative(dirname(output), 'docs/production-plan.md')})；逐关标签见[诊断明细](${relative(dirname(output), 'builds/wave-selection/level-details.md')})。`, '',
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
