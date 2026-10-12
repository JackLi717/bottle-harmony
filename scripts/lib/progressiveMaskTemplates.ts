import { compileSortingPuzzle } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { sha256 } from './unlockRatingEvidence.ts';

/** Named production shapes, no difficulty bonus. Continuous lower masks are
 * primary; interleaved lower masks remain an allowed occasional variation.
 * Batch frequencies belong to the recipe, never to a per-puzzle manual score. */
export function auditProgressiveMasks(puzzle: SortingPuzzle) {
  compileSortingPuzzle(puzzle);
  const hidden = new Set(puzzle.hidden);
  const groups = puzzle.containers.flatMap(c => {
    const depths = c.units.flatMap((id, i) => hidden.has(id) ? [i] : []);
    return depths.length ? [{ container: c.id, depths, fill: c.units.length,
      pattern: depths.every((d, i) => d === i) ? 'continuous-bottom' : 'interleaved-lower' }] : [];
  });
  const portions = puzzle.hidden.length, bottles = groups.length;
  const size = portions >= 1 && portions <= 2 && bottles <= 2 ? 'teaching'
    : portions >= 3 && portions <= 4 && bottles >= 2 && bottles <= 3 ? 'standard'
      : portions >= 5 && portions <= 6 && bottles >= 2 && bottles <= 3 ? 'variation' : null;
  const issues: string[] = [];
  if (!size) issues.push('mask-quantity-outside-fixed-templates');
  if (groups.some(g => g.depths.includes(g.fill - 1))) issues.push('initial-top-must-be-visible');
  if (groups.some(g => puzzle.locked.includes(g.container))) issues.push('partial-masks-must-start-in-open-bottles');
  const binding = { method: 'progressive-lower-mask-templates-v1', definitionSha256: sha256(puzzle) };
  const evidence = { status: issues.length ? 'fail' as const : 'pass' as const, size, groups, portions, bottles, issues };
  return { ...binding, ...evidence, evidenceSha256: sha256({ binding, evidence }) };
}
