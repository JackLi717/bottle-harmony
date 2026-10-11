import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { UNLOCK_BASELINE } from '../src/game/unlockBaseline.ts';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { extractUnlockRating, pairedRatingComparisons, ratingComparisonSet, UNLOCK_RATING_METHOD, RATING_LIMITS, type RatingDesign, type RatingInput } from './lib/unlockRatingEvidence.ts';
import { STAGE_DIFFICULTY_METHOD } from './lib/unlockStageDifficulty.ts';
import { unlockClassicReferences } from './lib/unlockClassicReference.ts';

// Roles describe fixture intent; they are not quality or difficulty verdicts.
const designs: RatingDesign[] = [
  { role: 'teaching', family: 'ordinary-three', purpose: { event: 'sort', description: 'Practice whole-board sorting with three colors and two spare bottles.' } },
  { role: 'teaching', family: 'first-key', purpose: { event: 'key', description: 'Empty the marked bottle and use the newly opened group.' } },
  { role: 'teaching', family: 'first-cover', purpose: { event: 'cover', description: 'Complete coral to reveal the linked group.' } },
  { role: 'teaching', family: 'hidden-boundary', purpose: { event: 'reveal', description: 'Expose a hidden boundary and tap again even if colors match.' } },
  { role: 'challenge', family: 'key-preparation', purpose: { event: 'key', description: 'Arrange temporary space before emptying the key bottle.' } },
  { role: 'challenge', family: 'cover-order', purpose: { event: 'order', description: 'Compare the two feasible first-color opening orders.' } },
  { role: 'challenge', family: 'two-stage', purpose: { event: 'chain', description: 'Use the first opened group to reach the second key.' } },
  { role: 'recovery', family: 'ordinary-three', purpose: { event: 'reveal', description: 'Explore the ordinary base board with progressive disclosure.' } },
  { role: 'teaching', family: 'simultaneous', purpose: { event: 'simultaneous', description: 'Witness a key and color trigger firing in one pour.' } },
  { role: 'challenge', family: 'two-stage', purpose: { event: 'chain', description: 'Open access to the fourth coral portion before completing its cover condition.' } },
  { role: 'recovery', family: 'first-key', purpose: { event: 'reveal', description: 'Reuse the familiar key structure with hidden portions.' } },
  { role: 'challenge', family: 'final-combination', purpose: { event: 'chain', description: 'Open a cover, reach a key and sort newly disclosed liquid.' } },
];
const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--') || args.lastIndexOf(name) !== index) throw new Error(`Expected one value for ${name}`);
  return value;
}
for (let i = 0; i < args.length; i += 2) if (!['--out', '--max-states', '--max-edges', '--max-stage-work', '--set'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete option: ${args[i]}`);
const set = option('--set', 'trial');
if (set !== 'trial' && set !== 'calibration' && set !== 'baseline') throw new Error('Expected --set trial, calibration or baseline');
const directory = resolve(option('--out', set === 'trial' ? 'builds/unlock-rating' : `builds/unlock-${set}-rating`)!);
const withinBuilds = relative(resolve('builds'), directory);
if (!withinBuilds || withinBuilds === '..' || withinBuilds.startsWith(`..${sep}`) || resolve(directory) === resolve('builds')) throw new Error('Output must be a subdirectory of ignored builds/');
const maxStates = Number(option('--max-states', '250000')), maxEdges = Number(option('--max-edges', '4000000'));
const maxStageWork = Number(option('--max-stage-work', '2000000'));
const inputs: RatingInput[] = set === 'trial' ? UNLOCK_TRIAL.map((entry, i) => ({ puzzle: entry.puzzle, design: designs[i] }))
  : set === 'baseline' ? UNLOCK_BASELINE.map(entry => ({ puzzle:entry.puzzle, design:{role:'challenge',family:entry.focus,
    purpose:{event:entry.variant === 'key' ? 'key' : 'sort',description:'Compare a rated classic base near 50 with its midpoint-key overlay. The overlay does not inherit the classic difficulty score.'}} }))
  : UNLOCK_CALIBRATION.map(entry => ({ puzzle: entry.puzzle, design: { role: entry.extraEmpty ? 'recovery' : 'challenge', family: entry.pair,
    purpose: { event: entry.puzzle.triggers.some(t => t.when.type === 'empty') ? 'key' : entry.puzzle.triggers.length ? 'cover' : entry.puzzle.hidden.length ? 'reveal' : 'sort',
      description: 'Calibration intent only: compare preparation, post-milestone sorting and compatible space with its paired board; human challenge is unconfirmed.' } } }));
const comparison = ratingComparisonSet(inputs);
mkdirSync(directory, { recursive: true });
const summary = [];
const reports = [];
for (const [i, input] of inputs.entries()) {
  console.log(`Evaluating ${i + 1}/${inputs.length}: ${input.puzzle.id}`);
  const rating = extractUnlockRating(input, comparison, maxStates, maxEdges, maxStageWork);
  const classicReferences = unlockClassicReferences(input.puzzle,
    rating.status === 'complete' ? rating.evidence.stageDifficulty : null, rating.evidenceSha256);
  const report = { ...rating, classicReferences };
  reports.push(report);
  writeFileSync(resolve(directory, `${input.puzzle.id}.json`), JSON.stringify(report, null, 2) + '\n');
  const evidence = report.status === 'complete' ? report.evidence : null;
  const difficulty = evidence?.stageDifficulty;
  summary.push({ number: i + 1, puzzle: input.puzzle.id,
    solvability: evidence?.admission.solvability ?? 'unknown', evidenceSha256: report.evidenceSha256,
    difficulty: { method: STAGE_DIFFICULTY_METHOD, status: difficulty?.status ?? 'unknown', rank: difficulty?.rank ?? null,
      beforeRank: difficulty?.beforeRank ?? null, afterRank: difficulty?.afterRank ?? null,
      reason: difficulty?.reason ?? (report.status === 'unknown' ? `graph-${report.graph.reason}` : null) },
    shortestMoves: evidence?.graph.shortestMoves ?? null,
    classicBase: evidence?.ablations.classicBase.status === 'complete'
      ? { status: 'complete', shortestMoves: evidence.ablations.classicBase.shortestMoves,
        difficultyRank: evidence.ablations.classicBase.stageDifficulty.rank,
        difficultyStatus: evidence.ablations.classicBase.stageDifficulty.status,
        score: classicReferences.base.human?.score?.total ?? null, scoreStatus: classicReferences.base.status }
      : { status: 'unknown', shortestMoves: null, difficultyRank: null, difficultyStatus: 'unknown',
        score: classicReferences.base.human?.score?.total ?? null, scoreStatus: classicReferences.base.status },
    classicReferences: { model: classicReferences.model, evidenceSha256: classicReferences.evidenceSha256,
      stages: classicReferences.stages.map(s => ({ phase: s.phase, goal: s.goal, frameSha256: s.frameSha256,
        status: s.reference.status, score: s.reference.human?.score?.total ?? null, reason: s.reference.reason })) },
    milestones: evidence?.decisions.status === 'complete' ? evidence.decisions.shortest.milestones.map(m => ({
      trigger: m.trigger, mandatory: m.mandatory, minimumSuccessfulPreparation: m.minimumSuccessfulPreparation,
      beforePours: m.before.route.pours, afterPours: m.after.route.pours,
    })) : [] });
}
const pairs = pairedRatingComparisons(reports).map(pair => ({
  original: pair.original, reference: pair.reference, status: pair.status,
  originalEvidenceSha256: pair.originalEvidenceSha256, referenceEvidenceSha256: pair.referenceEvidenceSha256,
}));
const evaluation = { difficultyMethod: STAGE_DIFFICULTY_METHOD, qualityStatus: 'unimplemented',
  reason: 'Difficulty is the lowest certified planning rank, using the same policy ladder for both stages and ordinary controls. It is not a 0–100 human score. Workload rhythm and visual-template quality acceptance remain unimplemented.' };
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ method: UNLOCK_RATING_METHOD,
  comparisonSha256: comparison.sha256, limits: RATING_LIMITS, evaluation, summary, pairs }, null, 2) + '\n');
const interval = (r: { min: number | null; max: number | null }) => r.min === null || r.max === null ? 'unknown' : `${r.min}–${r.max}`;
const table = summary.map(r => `| ${r.number} | ${r.solvability} | ${r.difficulty.rank ?? r.difficulty.status} | ${r.difficulty.beforeRank ?? '—'} / ${r.difficulty.afterRank ?? '—'} | ${r.classicBase.difficultyRank ?? r.classicBase.difficultyStatus} | ${r.classicBase.score ?? r.classicBase.scoreStatus} |`).join('\n');
const classicTable = summary.flatMap(r => r.classicReferences.stages.map(s =>
  `| ${r.number} | ${s.phase} | ${s.goal} | ${s.score ?? s.status} | ${s.reason ?? '—'} |`)).join('\n');
const stageTable = summary.flatMap(r => r.milestones.map(m =>
  `| ${r.number} | ${m.trigger} | ${m.mandatory} | ${m.minimumSuccessfulPreparation ?? 'unreachable'} | ${interval(m.beforePours)} | ${interval(m.afterPours)} |`)).join('\n');
writeFileSync(resolve(directory, 'report.md'), `# Unlock puzzle diagnostics

Method: ${UNLOCK_RATING_METHOD}

${evaluation.reason}

| Trial | Solvability | Whole planning rank | Before / after rank, same witness | Classic-base rank | Original classic-base score / 100 |
| --- | --- | ---: | ---: | ---: | ---: |
${table}

## Original classic reference scores

These independent human-decision-v1 scores retain their original planning-depth-v1 calculation and components, without converting the new 1–7 ranks. The base is a whole-sort counterfactual with mechanisms removed. After-key scores use the actual selected paired unlocked frame; they neither choose the witness nor determine the new difficulty. Acquiring a key has a different goal and receives no fabricated classic percentage. Detailed companion evidence binds model versions, budgets, definitions, exact frames and the stage evidence hash. Completed tasks unsupported by the original model also retain a reason rather than an invented zero.

| Trial | Stage | Actual goal | Classic score / 100 | Reason if unavailable |
| --- | --- | --- | ---: | --- |
${classicTable}

## Stage workload

All shortest complete walks; before includes the triggering pour. These workload ranges are independent of the selected difficulty witness. Minimum successful preparation and range endpoints may belong to different walks; do not splice them into a single playthrough.

| Trial | Trigger | Mandatory | Minimum successful preparation | Before pours | After pours |
| --- | --- | --- | ---: | ---: | ---: |
${stageTable}

The key task ends at the first firing. Each retained unlocked state is evaluated anew for whole-board sorting; the whole rank is the minimum paired maximum among certified policies. Policies use preparation limits of 2/4/6/6/8/10/12 pours and lookahead of 0/1/2/3/4/6/8 progress segments. Before the key, progress means fewer key-bottle portions, then fewer open-board color runs; after the key it means fewer whole-board color runs. No exact solution distance selects a policy frontier. All tied shortest retained segments must succeed. Lower policies are checked before a higher rank; work limits or exhausting this ladder without certification return unknown, never a high fallback grade. The per-puzzle witness replays both stages together and retains the actual unlocked frame. Ordinary controls run the same sorting policies.

This version supports ordinary visible boards and one mandatory bottom key, with no progressive hidden layers or additional triggers. Unsupported combinations receive no rank. Quality will use difficulty targets, workload rhythm and approved visual templates, with no manual per-puzzle grades.

Admission requires at least one replayed legal complete solution. Unknown search results remain unknown; unsolvable puzzles are rejected. Unlocking every group is not an extra completion goal. ${RATING_LIMITS}

Detailed per-puzzle JSON retains replay, compatible space, structural deduplication, bounded-walk diagnostics and independently solved classic/mechanism comparisons. Consequence counts and the fixed public-progress policy do not establish human thinking difficulty. Evidence hashes bind definitions, methods, budgets and comparisons; these outputs neither modify the public bank nor read player data.
`);
console.log(`Wrote ${directory}/report.md`);
