import { compileSortingPuzzle } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { assertRatingScope } from './unlockRatingGraph.ts';
import { sequentialKeys } from './unlockSequentialKeys.ts';
import type { DisclosureKind } from './disclosureStageDifficulty.ts';

export type CombinationKind = Exclude<DisclosureKind, 'cloth' | 'reveal'>;
export function combinationScope(puzzle: SortingPuzzle, kind: CombinationKind) {
  compileSortingPuzzle(puzzle);
  try { assertRatingScope(puzzle, 12); } catch { return { status: 'unsupported' as const, reason: 'requires-classic-four-portion-board' }; }
  const keys = puzzle.triggers.filter(t => t.when.type === 'empty'), covers = puzzle.triggers.filter(t => t.when.type === 'color-full');
  const no = (reason: string) => ({ status: 'unsupported' as const, reason });
  if (puzzle.containers.length < 4 || keys.length !== (kind === 'two-key-reveal' ? 2 : 1)) return no('requires-one-or-two-keys-for-selected-combination');
  const targets = puzzle.triggers.flatMap(t => t.unlock);
  if (!puzzle.locked.length || new Set(targets).size !== targets.length || targets.length !== puzzle.locked.length
    || targets.some(id => !puzzle.locked.includes(id))) return no('requires-disjoint-groups-covering-all-locks');
  if (kind === 'key-cloth') {
    if (puzzle.hidden.length || covers.length !== 1 || ![8,10,12].includes(puzzle.containers.length)) return no('requires-one-key-one-color-cover-without-masks');
  } else {
    if (covers.length || !puzzle.hidden.length || puzzle.hidden.length > 6) return no('requires-keys-and-one-to-six-masked-portions-only');
    const masked = new Set(puzzle.hidden);
    if (puzzle.containers.some(c => puzzle.locked.includes(c.id) && c.units.some(id => masked.has(id)))) return no('masks-must-start-in-open-bottles');
  }
  if (kind === 'two-key-reveal') {
    const sequence = sequentialKeys({ ...puzzle, hidden: [] });
    if (sequence.status !== 'supported') return no(sequence.reason);
  } else {
    const when = keys[0].when;
    if (when.type !== 'empty' || puzzle.locked.includes(when.container) || !puzzle.containers.find(c => c.id === when.container)!.units.length) return no('requires-nonempty-open-key-bottle');
  }
  return { status: 'supported' as const, keys, covers };
}
