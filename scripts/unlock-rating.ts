import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { UNLOCK_BASELINE } from '../src/game/unlockBaseline.ts';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { extractUnlockRating, ratingComparisonSet, UNLOCK_RATING_METHOD, RATING_LIMITS, type RatingDesign, type RatingInput } from './lib/unlockRatingEvidence.ts';
import { scoreUnlockRating } from './lib/unlockRatingScores.ts';

// Roles are editorial declarations, never selected by the evaluator to maximize Q.
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
for (let i = 0; i < args.length; i += 2) if (!['--out', '--max-states', '--max-edges', '--set'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete option: ${args[i]}`);
const set = option('--set', 'trial');
if (set !== 'trial' && set !== 'calibration' && set !== 'baseline') throw new Error('Expected --set trial, calibration or baseline');
const directory = resolve(option('--out', set === 'trial' ? 'builds/unlock-rating' : `builds/unlock-${set}-rating`)!);
const withinBuilds = relative(resolve('builds'), directory);
if (!withinBuilds || withinBuilds === '..' || withinBuilds.startsWith(`..${sep}`) || resolve(directory) === resolve('builds')) throw new Error('Output must be a subdirectory of ignored builds/');
const maxStates = Number(option('--max-states', '250000')), maxEdges = Number(option('--max-edges', '4000000'));
const inputs: RatingInput[] = set === 'trial' ? UNLOCK_TRIAL.map((entry, i) => ({ puzzle: entry.puzzle, design: designs[i] }))
  : set === 'baseline' ? UNLOCK_BASELINE.map(entry => ({ puzzle:entry.puzzle, design:{role:'challenge',family:entry.focus,
    purpose:{event:entry.variant === 'key' ? 'key' : 'sort',description:'Compare a rated classic base near 50 with its midpoint-key overlay. The overlay does not inherit the classic difficulty score.'}} }))
  : UNLOCK_CALIBRATION.map(entry => ({ puzzle: entry.puzzle, design: { role: entry.extraEmpty ? 'recovery' : 'challenge', family: entry.pair,
    purpose: { event: entry.puzzle.triggers.some(t => t.when.type === 'empty') ? 'key' : entry.puzzle.triggers.length ? 'cover' : entry.puzzle.hidden.length ? 'reveal' : 'sort',
      description: 'Calibration intent only: compare preparation, post-milestone sorting and compatible space with its paired board; human challenge is unconfirmed.' } } }));
const comparison = ratingComparisonSet(inputs);
mkdirSync(directory, { recursive: true });
const summary = [];
for (const [i, input] of inputs.entries()) {
  console.log(`Evaluating ${i + 1}/${inputs.length}: ${input.puzzle.id}`);
  const report = extractUnlockRating(input, comparison, maxStates, maxEdges);
  const scores = scoreUnlockRating(input.puzzle.id, report);
  writeFileSync(resolve(directory, `${input.puzzle.id}.json`), JSON.stringify({ ...report, scores }, null, 2) + '\n');
  summary.push({ number: i + 1, puzzle: input.puzzle.id, role: input.design.role, family: input.design.family,
    status: report.status, solvability: scores.solvability, evidenceSha256: report.evidenceSha256,
    shortestMoves: report.status === 'complete' && report.evidence.graph.status === 'complete' ? report.evidence.graph.shortestMoves : null,
    shortestStates: report.evidence?.shortest.states ?? null, plusTwoStates: report.evidence?.plusTwo.states ?? null,
    D6: scores.metrics.D6.grade, D6Status: scores.metrics.D6.status, Q: scores.Q, D: scores.D });
}
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ method: UNLOCK_RATING_METHOD, comparisonSha256: comparison.sha256, limits: RATING_LIMITS, summary }, null, 2) + '\n');
function axisStatus(axis: ReturnType<typeof scoreUnlockRating>['Q']) {
  return axis.score ?? (axis.blocked.length ? 'blocked' : axis.unknown.length ? 'unknown' : 'unimplemented');
}
const table = summary.map(r => `| ${r.number} | ${r.role} | ${r.family} | ${r.shortestMoves ?? r.solvability} | ${r.shortestStates ?? 'unknown'} / ${r.plusTwoStates ?? 'unknown'} | ${r.D6 ?? r.D6Status} | ${axisStatus(r.Q)} | ${axisStatus(r.D)} |`).join('\n');
writeFileSync(resolve(directory, 'report.md'), `# Classic quality and difficulty evidence\n\nMethod: ${UNLOCK_RATING_METHOD}\n\n${RATING_LIMITS}\n\n| Trial | Role | Family | Shortest pours | N / N+2 states | D6 grade | Q | D |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |\n${table}\n\nScores accept automatic algorithms only; no manual grade input or override is supported. D6 is implemented. Other automatic grade mappings remain unimplemented. Proven unsolvable originals block all grades; incomplete required searches remain unknown. Any missing metric blocks its Q or D total; no defaults or weight redistribution are used. See summary.json for separate unimplemented, unknown and blocked metric lists.\n\nPer-puzzle JSON includes complete-graph counts, route replay, all-shortest and plus-two distributions, bounded examples with all alternatives, public information trace, structural/dynamic trigger dependencies, individual/all-open/fully-visible ablations and duplicate/base comparisons. Descriptive consequence classes and count distances are not automatic quality grades. Public-world fairness, cue similarity and distinguishing foresight remain unproved.\n`);
console.log(`Wrote ${directory}/report.md`);
