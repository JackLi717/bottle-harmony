import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import { compileSortingPuzzle, initialEngineState, transitionEngine } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { colorRuns } from './lib/unlockRatingGraph.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';
import { LOCK_WIDTH_RECIPE, lockStudyBases, lockStudyOverlays, summarizeLockStudy,
  type LockStudyBase, type LockStudyRecord } from './lib/unlockLockWidthStudy.ts';

const args = process.argv.slice(2), command = args.shift() ?? 'run';
assert.ok(command === 'run' || command === 'verify', 'Expected run or verify');
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--out' && args[1], 'Only --out is supported');
const directory = resolve(args[1] ?? 'builds/unlock-lock-width');
const inside = (root: string, path: string) => { const child = relative(root, path); return child && child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith(sep); };
assert.ok(inside(resolve('builds'), directory), 'Output must be inside ignored builds/');
mkdirSync(directory, { recursive: true });
assert.ok(inside(realpathSync('builds'), realpathSync(directory)), 'Output must resolve inside builds/');
mkdirSync(resolve(directory, 'records'), { recursive: true });
const lockPath = resolve(directory, 'run.lock'), lock = openSync(lockPath, 'wx'); closeSync(lock);
process.once('exit', () => unlinkSync(lockPath));
process.once('SIGINT', () => process.exit(130)); process.once('SIGTERM', () => process.exit(143));
const atomicJson = (path: string, value: unknown) => { const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(value) + '\n'); renameSync(temp, path); };
const input = readFileSync('assets/levels/unlock-internal-100.json');
const fileHash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const bases = lockStudyBases(JSON.parse(input.toString()));
const binding = { recipe: LOCK_WIDTH_RECIPE, inputSha256: fileHash(input), sources: [
  'scripts/lib/unlockLockWidthStudy.ts', 'scripts/lib/unlockRatingGraph.ts', 'scripts/lib/unlockStageDifficulty.ts', 'scripts/lib/unlockStageRhythm.ts',
  'scripts/lib/unlockBatchGeneration.ts', 'src/game/engine.ts', 'src/game/engineModel.ts', 'src/game/engineSearch.ts', 'src/game/transfer.ts',
].map(path => ({ path, sha256: fileHash(readFileSync(path)) })) };
const bindingSha256 = sha256(binding), manifest = resolve(directory, 'manifest.json');
if (existsSync(manifest)) assert.deepEqual(JSON.parse(readFileSync(manifest, 'utf8')), { ...binding, bindingSha256 }, 'Inputs or algorithms changed; use a fresh output directory');
else { assert.equal(command, 'run', 'No study to verify'); atomicJson(manifest, { ...binding, bindingSha256 }); }
const records: LockStudyRecord[] = [];
const recordPath = (base: LockStudyBase) => resolve(directory, 'records', `${base.number}.json`);

// Independent reconstruction, evidence binding and route/split replay; this does
// not advertise independent full graph/policy recomputation.
function verifyRecord(record: LockStudyRecord, base: LockStudyBase) {
  assert.deepEqual(record.base, base);
  const overlays = lockStudyOverlays(base);
  assert.equal(record.results.length, overlays.length, 'Missing probes');
  for (const [i, result] of record.results.entries()) {
    const overlay = overlays[i];
    const { method, baseSha256, width, locked, definitionSha256, limits, evidenceSha256, ...evidence } = result;
    const resultBinding = { method, baseSha256, width, locked, definitionSha256, limits };
    assert.equal(evidenceSha256, sha256({ binding: resultBinding, evidence }));
    assert.equal(method, LOCK_WIDTH_RECIPE.method); assert.equal(baseSha256, base.sourceSha256);
    assert.equal(width, overlay.width); assert.deepEqual(locked, overlay.locked);
    assert.equal(definitionSha256, sha256(overlay.puzzle)); assert.deepEqual(limits, LOCK_WIDTH_RECIPE);
    const runtime = compileSortingPuzzle(overlay.puzzle), initial = initialEngineState(runtime);
    if (result.graph.status === 'complete' && result.solvability === 'solvable') replayEngineRoute(runtime, initial, result.graph.route);
    if (result.stage.status === 'rated') {
      const stage = result.stage, final = replayEngineRoute(runtime, initial, stage.witness.route);
      assert.equal(stage.rank, Math.max(stage.beforeRank!, stage.afterRank));
      assert.ok(stage.beforeRank && stage.witness.splitPour !== null);
      let frame = initial;
      for (const [n, action] of stage.witness.route.slice(0, stage.witness.splitPour).entries()) {
        assert.equal(frame.state.fired.length, 0, 'Key fired before split');
        const next = transitionEngine(runtime, frame.state, frame.known, action); assert.ok(next.accepted);
        frame = { state: next.state, known: next.known };
        if (frame.state.fired.length) assert.equal(n + 1, stage.witness.splitPour);
      }
      assert.deepEqual(frame, stage.witness.unlockedFrame); assert.deepEqual(frame.state.fired, ['key-a']);
      assert.equal(result.rhythm.before, colorRuns(runtime, initial) - colorRuns(runtime, frame));
      assert.equal(result.rhythm.after, colorRuns(runtime, frame) - colorRuns(runtime, final));
    }
  }
}

const pending = bases.filter(base => {
  if (!existsSync(recordPath(base))) return true;
  const saved = JSON.parse(readFileSync(recordPath(base), 'utf8'));
  assert.equal(saved.bindingSha256, bindingSha256); verifyRecord(saved.record, base); records.push(saved.record); return false;
});
if (command === 'verify') assert.equal(pending.length, 0, 'Study incomplete');
if (pending.length) {
  const workers = Array.from({ length: 3 }, () => new Worker(new URL('./lib/unlockLockWidthWorker.ts', import.meta.url)));
  let cursor = 0;
  try {
    await Promise.all(workers.map(async worker => {
      while (cursor < pending.length) {
        const base = pending[cursor++];
        const record = await new Promise<LockStudyRecord>((resolve, reject) => {
          const failed = (error: Error) => { worker.off('message', received); reject(error); };
          const received = (message: { progress?: { base: number; done: number; total: number }; error?: string; record?: LockStudyRecord }) => {
            if (message.progress) { console.log(`Base ${message.progress.base}: ${message.progress.done}/${message.progress.total} probes`); return; }
            worker.off('message', received); worker.off('error', failed);
            if (message.error) reject(new Error(message.error)); else if (message.record) resolve(message.record); else reject(new Error('Missing worker record'));
          };
          worker.once('error', failed); worker.on('message', received); worker.postMessage(base);
        });
        verifyRecord(record, base); atomicJson(recordPath(base), { bindingSha256, record }); records.push(record);
        console.log(`Completed ${records.length}/${bases.length}: base ${base.number}`);
      }
    }));
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}
records.sort((a, b) => a.base.number - b.base.number);
const summary = summarizeLockStudy(records);
const frozenRows = JSON.parse(input.toString()).entries as { number: number; overlay: { locked: number[] }; rank: number; beforeRank: number; afterRank: number }[];
const controls = records.map(record => {
  const original = frozenRows[record.base.number - 1], locks = [...original.overlay.locked].sort((a, b) => a - b);
  const probe = record.results.find(r => JSON.stringify(r.locked) === JSON.stringify(locks));
  assert.ok(probe);
  return { base: record.base.number, locked: locks, frozen: [original.beforeRank, original.afterRank, original.rank],
    fixedPositions: probe.stage.status === 'rated' ? [probe.stage.beforeRank, probe.stage.afterRank, probe.stage.rank] : probe.stage.status };
});
const support = ([1, 2, 3] as const).map(width => ({ width,
  solvable: records.flatMap(r => r.results).filter(r => r.width === width && r.solvability === 'solvable').length,
  solvabilityUnknown: records.flatMap(r => r.results).filter(r => r.width === width && r.solvability === 'unknown').length,
  basesWithRating: records.filter(r => r.results.some(s => s.width === width && s.stage.status === 'rated')).length,
  rootsWithRating: records.filter(r => r.base.isRoot && r.results.some(s => s.width === width && s.stage.status === 'rated')).length,
}));
const unknown = records.flatMap(r => r.results.filter(p => p.stage.status === 'unknown').map(p => ({ base: r.base.number,
  width: p.width, locked: p.locked, solvability: p.solvability, reason: p.stage.reason })));
const examples: { base: number; from: number; direction: 'lower' | 'higher'; smaller: number[]; larger: number[]; before: number[]; after: number[]; whole: number[] }[] = [];
for (const { base, results } of records) for (const small of results) for (const large of results) {
  if (large.width !== small.width + 1 || !small.locked.every(i => large.locked.includes(i)) || small.stage.status !== 'rated' || large.stage.status !== 'rated') continue;
  const direction = large.stage.rank < small.stage.rank ? 'lower' : large.stage.rank > small.stage.rank ? 'higher' : 'same';
  if (direction === 'same' || examples.some(e => e.from === small.width && e.direction === direction)) continue;
  examples.push({ base: base.number, from: small.width, direction, smaller: small.locked, larger: large.locked,
    before: [small.stage.beforeRank!, large.stage.beforeRank!], after: [small.stage.afterRank, large.stage.afterRank], whole: [small.stage.rank, large.stage.rank] });
}
const audit = { controls, controlsMatch: controls.every(c => JSON.stringify(c.frozen) === JSON.stringify(c.fixedPositions)), support, unknown, examples };
const payload = { bindingSha256, reportGeneratorSha256: fileHash(readFileSync(new URL(import.meta.url))),
  recordEvidenceSha256: sha256(records.map(r => r.results.map(s => s.evidenceSha256))), summary, audit };
if (command === 'verify') assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'summary.json'), 'utf8')), { ...payload, evidenceSha256: sha256(payload) });
else atomicJson(resolve(directory, 'summary.json'), { ...payload, evidenceSha256: sha256(payload) });
const hist = (h: Record<string, number>) => Object.entries(h).map(([rank, n]) => `${rank}档:${n}`).join('，') || '—';
function cohortTable(cohort: typeof summary.all) {
  return `| 锁瓶数 | 全部组合 | 已评级 | 已证明无解 | 难度未知 | 钥匙前档位分布 | 钥匙后档位分布 |\n| --- | --- | --- | --- | --- | --- | --- |\n${cohort.widths.map(w => `| ${w.width} | ${w.probes} | ${w.rated} | ${w.unsolvable} | ${w.unknown} | ${hist(w.histogram.before)} | ${hist(w.histogram.after)} |`).join('\n')}\n\n| 嵌套比较 | 全部配对 | 两边已评级 | 排除配对 | 前段 降／同／升 | 后段 降／同／升 | 整题 降／同／升 |\n| --- | --- | --- | --- | --- | --- | --- |\n${cohort.pairs.map(p => `| ${p.from}→${p.to} | ${p.total} | ${p.rated} | ${p.excluded} | ${Object.values(p.changes.before).join('／')} | ${Object.values(p.changes.after).join('／')} | ${Object.values(p.changes.whole).join('／')} |`).join('\n')}\n`;
}
const findings = `## 主要发现

原百题锁法在固定经典瓶位下的前／后／整题档位对照：${audit.controlsMatch ? '全部一致' : '存在差异，详见 summary.json controls，须先调查'}。

| 锁瓶数 | 已证明可解 / 全部组合 | 可解性未知 | 难度未知 | 至少有一种已评级锁法的底题数 |
| --- | --- | --- | --- | --- |
${support.map(w => `| ${w.width} | ${w.solvable} / ${summary.all.widths[w.width - 1].probes} | ${w.solvabilityUnknown} | ${summary.all.widths[w.width - 1].unknown} | ${w.basesWithRating} |`).join('\n')}

本批锁得更多时，可解组合明显减少；难度未知的组合应与无解分开。原三瓶匣来源的底题改锁一瓶、两瓶或三瓶时，开锁后分布依次为：${summary.profiles[2].widths.map(w => `锁${w.width}瓶 ${hist(w.histogram.after)}`).join('；')}。这说明该来源的后段轻松并非三瓶锁独有。原单瓶匣来源改锁两瓶的后段仍有 ${hist(summary.profiles[0].widths[1].histogram.after)}，也不能把双瓶匣后段必为 1 档视为规则。

取钥前和整题档位均存在上升与下降；以下是按底题编号、锁集合顺序自动提取的首个升／降实例，不挑选漂亮结果。瓶号是经典源的 b0 起编号。

| 底题 | 锁集合增加 | 前段 | 后段 | 整题 |
| --- | --- | --- | --- | --- |
${examples.map(e => `| ${e.base} | ${e.smaller.map(i => `b${i}`).join('+')} → ${e.larger.map(i => `b${i}`).join('+')} | ${e.before.join('→')} | ${e.after.join('→')} | ${e.whole.join('→')} |`).join('\n')}

因此，本批后段偏轻主要应先查底题／钥匙选择与生成筛选，锁数量的结构影响首先体现在可解空间收缩。这个结果支持改进生成配方，不支持给多瓶匣直接加难度分或改变整题取最大阶段档的定义。尚不能推出全部经典底题或其他钥匙布局都如此。
`;
writeFileSync(resolve(directory, 'report.md'), `# 同底题锁瓶数量研究\n\n方法：${LOCK_WIDTH_RECIPE.method}。冻结百题来源 SHA-256：${binding.inputSha256}。全部 ${bases.length} 道经典底题，每题固定原钥匙、库存、容量、瓶位、规则与预算，枚举其余非空瓶所有 1／2／3 瓶锁集合。不按分数、节奏、隐藏配色或可解性选组合。定义与完整证书在 records/。\n\n${findings}\n## 全部百题\n\n${cohortTable(summary.all)}\n## 不含同源交换变体\n\n仅原始来源 ${summary.roots.bases} 道，用于核对同源扩展的偏向；仍是旧入选来源，并非新随机总体。\n\n${cohortTable(summary.roots)}\n## 按旧底题配方分层\n\n${summary.profiles.map(p => `### 原 ${p.profile} 瓶匣配方，${p.bases} 个底题\n\n${cohortTable(p)}`).join('\n')}\n## 难度与整理量预筛\n\n这里仅套用旧生成器的整题 4–6 档及整理量节奏两项，展示筛选后分布；不是完整自动验收，公开信息和模板未验。\n\n| 锁瓶数 | 两项预筛通过 | 通过后的前段档位 | 通过后的后段档位 |\n| --- | --- | --- | --- |\n${summary.all.widths.map(w => `| ${w.width} | ${w.prefilterPass} | ${hist(w.prefiltered.before)} | ${hist(w.prefiltered.after)} |`).join('\n')}\n\n## 解释边界\n\n- 整题沿用两阶段最大档，阶段分数来自同一完整证书及实际解锁局面；不改评价器，不加权或人工修分。新解锁局面的经典百分分未计算，不能套用旧解锁局面的分数；各底题的冻结原经典分另存于 records/。\n- 已评级不等于成题通过。未知不计为无解或高难；配对只在两边均已评级时比较档位，全部状态转移矩阵、排除数量及确定性反例另存 summary.json。\n- 嵌套配对固定同一底题及钥匙，小锁集合是大锁集合的子集。更多锁在开锁前只会删去合法动作，因此不能让原本已证明无解的局面恢复可解；程序核对这一关系。它不保证代理难度随锁瓶数单调变化。\n- 每题使用原入选钥匙；底题仍来自旧生成器的入选来源，三种原配方不同。全枚举消除了本轮锁集合的挑选，但没有消除原底题／钥匙的入选偏向。配对不是独立统计样本；根来源分层只作稳健性检查。\n- 计算采用完整真实库存的规则探针，没有枚举公开隐藏世界，也没有重新排列瓶位来匹配木匣模板。这些不是可直接上线的新题。正式题库、内部百题、玩家数据均未修改。\n\n复验：npm run unlock:lock-width -- verify。复验重建来源、重放所有可解路线与阶段切分、检查哈希及汇总，不声称独立重算全部图与评级。\n`);
console.log(`Lock-width study ${command}: ${records.length} bases, ${summary.all.widths.reduce((n, w) => n + w.probes, 0)} probes; ${directory}/report.md`);
