import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { postKeyRoot, postKeyOrigin, postKeyOverlays, reconstructPostKeyClassic, POST_KEY_RECIPE, type PostKeyRecord, type PostKeyOrigin } from './lib/unlockPostKeyGeneration.ts';
import { extractUnlockRating, ratingComparisonSet, sha256, type RatingInput } from './lib/unlockRatingEvidence.ts';
import { acceptSingleKey } from './lib/unlockSingleKeyAcceptance.ts';
import { unlockClassicReferences } from './lib/unlockClassicReference.ts';
import { unlockTrialStructure } from './lib/unlockTrialAudit.ts';
import { initialBoard } from '../src/game/model.ts';
import { replaySolution } from '../src/game/solver.ts';
import { structureKey } from '../src/game/generation.ts';
import { postKeyDiversityIssue, auditPostKeyDiversity } from './lib/unlockPostKeyDiversity.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';

const args = process.argv.slice(2), command = args.shift() ?? 'generate';
assert.ok(command === 'generate' || command === 'verify', 'Expected generate or verify');
const allowed = ['--out', '--limit'];
for (let i = 0; i < args.length; i += 2) assert.ok(allowed.includes(args[i]) && args[i + 1] && args.indexOf(args[i]) === i, 'Unknown, duplicate or incomplete option');
const option = (name: string, fallback: string) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const directory = resolve(option('--out', 'builds/unlock-post-key-20-v2'));
const child = relative(resolve('builds'), directory);
assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith(sep), 'Output must be inside ignored builds/');
const count = POST_KEY_RECIPE.count;
const maxAttempts = POST_KEY_RECIPE.maxCandidates * POST_KEY_RECIPE.templates.length;
const limit = Number(option('--limit', String(maxAttempts)));
assert.ok(Number.isSafeInteger(limit) && limit >= 1 && limit <= maxAttempts, 'Invalid run attempt limit');
mkdirSync(resolve(directory, 'records'), { recursive: true });
const lockPath = resolve(directory, 'run.lock');
let lock: number;
try { lock = openSync(lockPath, 'wx'); }
catch { throw new Error(`Output is locked by another run: ${lockPath}`); }
writeSync(lock, String(process.pid)); closeSync(lock);
process.once('exit', () => { if (existsSync(lockPath)) unlinkSync(lockPath); });
process.once('SIGINT', () => process.exit(130)); process.once('SIGTERM', () => process.exit(143));

const recipe = { ...POST_KEY_RECIPE, count }, recipeSha256 = sha256(recipe);
const checkpointPath = resolve(directory, 'checkpoint.json');
const atomicJson = (path: string, value: unknown) => { const temp = `${path}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(value) + '\n'); renameSync(temp, path); };
type Checkpoint = { recipeSha256: string; next: Record<number, number>; files: string[]; attempts: number; counts: Record<string, number> };
const state: Checkpoint = existsSync(checkpointPath) ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
  : { recipeSha256, next: { 2: 0, 3: 0 }, files: [], attempts: 0, counts: {} };
assert.equal(state.recipeSha256, recipeSha256, 'Checkpoint recipe differs; use a new output directory');
const records: PostKeyRecord[] = state.files.map(file => {
  assert.ok(/^post-key2-[0-9-]+\.json$/.test(file), 'Invalid checkpoint record name');
  return JSON.parse(readFileSync(resolve(directory, 'records', file), 'utf8'));
});
const baseKeys = new Set(records.map(r => r.source.structureKey));
const overlayKeys = new Set(records.map(r => unlockTrialStructure(r.puzzle)));
assert.equal(baseKeys.size, records.length, 'Duplicate checkpoint classics'); assert.equal(overlayKeys.size, records.length, 'Duplicate checkpoint overlays');
const quotas = [0, 0, count / 2, count / 2];
let lastProgress = 0;
if (command === 'generate' && records.length < count) {
  const workers = Array.from({ length: 4 }, () => new Worker(new URL('./lib/unlockPostKeyWorker.ts', import.meta.url)));
  type Result = { record: PostKeyRecord | null; counts: Record<string, number>; error?: string };
  const evaluate = (workerIndex: number, origin: PostKeyOrigin) => new Promise<Result>((resolve, reject) => {
    const worker = workers[workerIndex];
    const failed = (error: Error) => { worker.off('message', received); reject(error); };
    const received = (result: Result) => { worker.off('error', failed); if (result.error) reject(new Error(result.error)); else resolve(result); };
    worker.once('message', received); worker.once('error', failed); worker.postMessage(origin);
  });
  try {
    while (records.length < count && state.attempts < limit) {
      // Dispatch in source order even after a bounded run or interruption.
      // Results mutate selection only in this same order, never completion order.
      const tasks: { template: 2 | 3; origin: PostKeyOrigin }[] = [];
      while (tasks.length < workers.length && state.attempts + tasks.length < limit) {
        const pending = (t: number) => tasks.filter(task => task.template === t).length;
        const choices = ([2, 3] as const).filter(t => records.filter(r => r.source.origin.template === t).length + pending(t) < quotas[t]
          && state.next[t] + pending(t) < recipe.maxCandidates)
          .sort((a, b) => state.next[a] + pending(a) - state.next[b] - pending(b) || a - b);
        if (!choices.length) break;
        const template = choices[0];
        tasks.push({ template, origin: postKeyOrigin(template, state.next[template] + pending(template)) });
      }
      if (!tasks.length) break;
      const results = await Promise.all(tasks.map(({ origin }, index) => baseKeys.has(structureKey(reconstructPostKeyClassic(origin)))
        ? Promise.resolve<Result>({ record: null, counts: { 'classic-duplicate:fail:already-selected': 1 } }) : evaluate(index, origin)));
      for (const [index, { record: result, counts }] of results.entries()) {
        const { template } = tasks[index];
        state.next[template]++; state.attempts++;
        for (const [key, value] of Object.entries(counts)) {
          state.counts[key] = (state.counts[key] ?? 0) + value;
          const scoped = `box-${template}:${key}`;
          state.counts[scoped] = (state.counts[scoped] ?? 0) + value;
        }
        if (result) {
          const key = unlockTrialStructure(result.puzzle);
          const diversityIssue = postKeyDiversityIssue(result, records);
          if (diversityIssue) {
            state.counts[`diversity:fail:${diversityIssue}`] = (state.counts[`diversity:fail:${diversityIssue}`] ?? 0) + 1;
            appendFileSync(resolve(directory, 'diversity-rejections.jsonl'), JSON.stringify({ origin: result.source.origin, reason: diversityIssue }) + '\n');
          }
          if (!baseKeys.has(result.source.structureKey) && !overlayKeys.has(key) && !diversityIssue) {
            const file = `${result.puzzle.id}.json`; atomicJson(resolve(directory, 'records', file), result);
            state.files.push(file); records.push(result); baseKeys.add(result.source.structureKey); overlayKeys.add(key);
            console.log(`Accepted ${records.length}/${count}: box ${template}, rank ${result.rating.evidence?.stageDifficulty.rank}, ${result.puzzle.id}`);
          }
        }
        atomicJson(checkpointPath, state);
        if (Date.now() - lastProgress > 10000) { lastProgress = Date.now(); console.log(`Examined ${state.attempts}; accepted ${[2, 3].map(t => records.filter(r => r.source.origin.template === t).length).join('/')} (double/triple)`); }
      }
    }
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}

if (records.length !== count) {
  writeFileSync(resolve(directory, 'report.md'), `# 单钥匙后段挑战：未完成\n\n已验收 ${records.length}／${count} 道（双／三瓶匣 ${[2, 3].map(t => records.filter(r => r.source.origin.template === t).length).join('／')}），检查 ${state.attempts} 个候选。断点和失败／未知原因计数保存在 checkpoint.json。未输出试玩题库。\n`);
  console.error(`Incomplete: ${records.length}/${count} after ${state.attempts} candidates; checkpoint retained. No playable bank published.`);
  process.exitCode = 1;
} else {
  const roots = new Map<string, number>();
  for (const record of records) { const key = postKeyRoot(record.source.origin); roots.set(key, (roots.get(key) ?? 0) + 1); }
  assert.ok([...roots.values()].every(n => n <= recipe.diversity.maxPerRoot), 'Root-family cap exceeded');
  const diversity = auditPostKeyDiversity(records); assert.equal(diversity.status, 'pass', JSON.stringify(diversity));
  const checks = [];
  // Verify each frozen source and every derived definition independently before
  // emitting the playable projection. Unknown never becomes a fallback puzzle.
  for (const [i, record] of records.entries()) {
    const origin = record.source.origin;
    const indexedOrigin = postKeyOrigin(origin.template, origin.seed - recipe.seed - recipe.templateSeedOffset[origin.template]);
    assert.deepEqual(origin, indexedOrigin, 'Origin is outside the frozen recipe');
    assert.equal(record.sourceSha256, sha256(record.source), 'Source hash differs');
    assert.deepEqual(record.source.classic, reconstructPostKeyClassic(record.source.origin), 'Source reconstruction differs');
    assert.ok(hasCleanStart(record.source.classic), 'Source start filter differs');
    replaySolution(initialBoard(record.source.classic), record.source.solution, 4);
    assert.equal(record.source.structureKey, structureKey(record.source.classic));
    const expected = postKeyOverlays(record.source.origin).find(o => o.key === record.source.overlay.key
      && JSON.stringify(o.locked) === JSON.stringify(record.source.overlay.locked));
    assert.ok(expected);
    assert.deepEqual(expected.order, record.source.overlay.order); assert.deepEqual(expected.puzzle, record.puzzle);
    const input: RatingInput = { puzzle: record.puzzle, design: record.rating.design };
    const rating = extractUnlockRating(input, ratingComparisonSet([input]), recipe.graph.maxStates, recipe.graph.maxEdges, recipe.maxStageWork);
    assert.deepEqual(rating, record.rating, 'Independently recomputed rating differs');
    let accepted = acceptSingleKey(record.puzzle, rating, { target: recipe.target, disclosureBudget: recipe.disclosure });
    // Wall-clock contention can interrupt a previously complete proof. Retry only
    // that unknown, with the same budget; failure and other unknowns stay fatal.
    for (let retry = 1; retry < 3 && accepted.status === 'unknown' && accepted.publicInformation?.reason === 'public-time-budget'; retry++) {
      console.log(`Retrying timed-out public proof ${retry}/2: ${record.puzzle.id}`);
      accepted = acceptSingleKey(record.puzzle, rating, { target: recipe.target, disclosureBudget: recipe.disclosure });
    }
    assert.equal(rating.status, 'complete');
    assert.ok(rating.status === 'complete' && rating.evidence.stageDifficulty.status === 'rated'
      && rating.evidence.stageDifficulty.afterRank >= recipe.afterMin, 'Independent post-key floor differs');
    assert.equal(accepted.status, 'pass', `Independent acceptance ${accepted.label}: ${record.puzzle.id}; ${accepted.reasons.map(r => r.code).join(',')}`);
    assert.deepEqual(accepted, record.acceptance, 'Independent acceptance evidence differs');
    assert.deepEqual(unlockClassicReferences(record.puzzle, rating.status === 'complete' ? rating.evidence.stageDifficulty : null, rating.evidenceSha256), record.classicReferences);
    checks.push({ puzzle: record.puzzle.id, status: 'pass', sourceSha256: record.sourceSha256, acceptanceSha256: accepted.evidenceSha256 });
    console.log(`Verified ${i + 1}/${count}: ${record.puzzle.id}`);
  }
  const ordered = [2, 3].map(t => records.filter(r => r.source.origin.template === t));
  assert.deepEqual(ordered.map(g => g.length), quotas.slice(2), 'Template quotas differ');
  const interleaved = Array.from({ length: quotas[2] }, (_, i) => ordered.flatMap(group => group[i] ? [group[i]] : [])).flat();
  assert.equal(interleaved.length, count);
  const entries = interleaved.map((r, i) => {
    assert.equal(r.rating.status, 'complete'); if (r.rating.status !== 'complete') throw new Error('Missing rating');
    const stage = r.rating.evidence.stageDifficulty; assert.equal(stage.status, 'rated');
    assert.ok(stage.status === 'rated' && stage.afterRank >= recipe.afterMin, 'Post-key floor differs'); if (stage.status !== 'rated') throw new Error('Missing stage');
    return { number: i + 1, puzzle: r.puzzle, origin: r.source.origin, overlay: r.source.overlay, sourceSha256: r.sourceSha256,
      classicStructureKey: r.source.structureKey, route: stage.witness.route, rank: stage.rank, beforeRank: stage.beforeRank, afterRank: stage.afterRank,
      classicScore: r.classicReferences.base.human?.score?.total ?? null,
      afterClassicScore: r.classicReferences.stages.find(s => s.phase === 'after-key')?.reference.human?.score?.total ?? null,
      rhythm: { before: r.rating.evidence.stageRhythm.before, after: r.rating.evidence.stageRhythm.after, structure: r.rating.evidence.stageRhythm.structure },
      acceptance: { status: r.acceptance.status, label: r.acceptance.label, evidenceSha256: r.acceptance.evidenceSha256 } };
  });
  const payload = { format: 'bottle-harmony-internal-key-bank', version: 1, method: POST_KEY_RECIPE.method, recipe, diversity, entries };
  const bank = { ...payload, evidenceSha256: sha256(payload) };
  if (command === 'verify') {
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'play.json'), 'utf8')), bank, 'Playable projection differs');
    assert.deepEqual(JSON.parse(readFileSync(resolve('assets/levels/unlock-post-key-20.json'), 'utf8')), bank, 'Packaged internal projection differs');
  } else {
    atomicJson(resolve(directory, 'play.json'), bank);
    atomicJson(resolve('assets/levels/unlock-post-key-20.json'), bank);
  }
  atomicJson(resolve(directory, 'verification.json'), { status: 'pass', recipeSha256, count, checks, evidenceSha256: sha256(checks) });
  const report = `# 单钥匙后段挑战内部体验题\n\n${count} 道，统一目标 ${recipe.target.min}–${recipe.target.max} 档、后段至少 ${recipe.afterMin} 档，全部统一验收通过并独立复验。双／三瓶匣 ${quotas.slice(2).join('／')} 道。正式题库与玩家数据未改动。\n\n| 题号 | 匣宽 | 整题档 | 前／后档 | 原经典分 | 解锁后经典分 | 前／后整理量 | 结果 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${entries.map(e => `| ${e.number} | ${e.origin.template} | ${e.rank} | ${e.beforeRank}／${e.afterRank} | ${e.classicScore ?? '未知'} | ${e.afterClassicScore ?? '未知'} | ${e.rhythm.before}／${e.rhythm.after} | ${e.acceptance.label} |`).join('\n')}\n\n结构验收：${diversity.roots} 个独立经典核心、${diversity.fillProfiles} 种填充形状、${diversity.linked} 题跨组颜色关联；忽略换色与瓶位后的下排结构互异，实际解锁后局面结构互异。\n\n制作检查 ${state.attempts} 个候选（独立种子，无换序变体）。来源、定义、路线、分段证书、公开隐藏局面和验收原因在 records/；筛选计数与断点在 checkpoint.json。原经典分数仅作对照，不换算新档位。此包用于内部体验，尚无真人档位校准或正式内容编排。\n`;
  writeFileSync(resolve(directory, 'report.md'), report);
  console.log(`Complete: ${directory}/play.json`);
}
