import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { UNLOCK_BASELINE } from '../src/game/unlockBaseline.ts';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import { UNLOCK_TRIAL } from '../src/game/unlockTrial.ts';
import { extractUnlockRating, ratingComparisonSet, UNLOCK_RATING_METHOD, RATING_LIMITS, type RatingDesign, type RatingInput } from './lib/unlockRatingEvidence.ts';
import { reviewTemplate, scoreUnlockRating } from './lib/unlockRatingScores.ts';

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
for (let i = 0; i < args.length; i += 2) if (!['--out', '--reviews', '--max-states', '--max-edges', '--set'].includes(args[i]) || !args[i + 1]) throw new Error(`Unknown or incomplete option: ${args[i]}`);
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
const reviewPath = option('--reviews');
const rawReviews: unknown = reviewPath ? JSON.parse(readFileSync(reviewPath, 'utf8')) : [];
if (!Array.isArray(rawReviews)) throw new Error('Reviews must be an array');
const reviews = new Map<string, unknown>();
for (const review of rawReviews) {
  if (!review || typeof review !== 'object' || typeof review.puzzle !== 'string' || reviews.has(review.puzzle) || !inputs.some(i => i.puzzle.id === review.puzzle)) throw new Error('Unknown or duplicate review puzzle');
  reviews.set(review.puzzle, review);
}
// Never overwrite the file supplied as human evidence.
const outputNames = ['report.md', 'summary.json', 'review-template.json', ...inputs.map(i => `${i.puzzle.id}.json`)];
if (reviewPath && outputNames.some(name => resolve(reviewPath) === resolve(directory, name))) throw new Error('Use a separate reviews file, not a generated output path');
mkdirSync(directory, { recursive: true });
const summary = [], templates = [];
for (const [i, input] of inputs.entries()) {
  console.log(`Evaluating ${i + 1}/${inputs.length}: ${input.puzzle.id}`);
  const report = extractUnlockRating(input, comparison, maxStates, maxEdges);
  const scores = scoreUnlockRating(input.puzzle.id, report, reviews.get(input.puzzle.id));
  writeFileSync(resolve(directory, `${input.puzzle.id}.json`), JSON.stringify({ ...report, scores }, null, 2) + '\n');
  templates.push(reviewTemplate(input.puzzle.id, report));
  summary.push({ number: i + 1, puzzle: input.puzzle.id, role: input.design.role, family: input.design.family,
    status: report.status, evidenceSha256: report.evidenceSha256,
    shortestMoves: report.status === 'complete' && report.evidence.graph.status === 'complete' ? report.evidence.graph.shortestMoves : null,
    shortestStates: report.evidence?.shortest.states ?? null, plusTwoStates: report.evidence?.plusTwo.states ?? null,
    D6: scores.metrics.D6.grade, Q: scores.Q, D: scores.D });
}
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify({ method: UNLOCK_RATING_METHOD, comparisonSha256: comparison.sha256, limits: RATING_LIMITS, summary }, null, 2) + '\n');
writeFileSync(resolve(directory, 'review-template.json'), JSON.stringify(templates, null, 2) + '\n');
const table = summary.map(r => `| ${r.number} | ${r.role} | ${r.family} | ${r.shortestMoves ?? 'unknown'} | ${r.shortestStates ?? 'unknown'} / ${r.plusTwoStates ?? 'unknown'} | ${r.D6 ?? 'pending'} | ${r.Q.score ?? 'pending'} | ${r.D.score ?? 'pending'} |`).join('\n');
writeFileSync(resolve(directory, 'report.md'), `# Classic quality and difficulty evidence\n\nMethod: ${UNLOCK_RATING_METHOD}\n\n${RATING_LIMITS}\n\n| Trial | Role | Family | Shortest pours | N / N+2 states | D6 grade | Q | D |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |\n${table}\n\nD6 is automatic. All other grades require a named reviewer, completed metric checklist, reason and bound evidence references. Q3 additionally requires UI evidence paths. Copy review-template.json to a separate file, complete reviews and rerun with --reviews. Missing grades stay pending; no weights are redistributed.\n\nPer-puzzle JSON includes complete-graph counts, route replay, all-shortest and plus-two distributions, bounded examples with all alternatives, public information trace, structural/dynamic trigger dependencies, individual/all-open/fully-visible ablations and duplicate/base comparisons. Descriptive consequence classes and count distances are not automatic quality grades. Public-world fairness, cue similarity and distinguishing foresight remain unproved.\n`);
console.log(`Wrote ${directory}/report.md`);
