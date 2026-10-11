import { parseSortingPuzzle } from './engineModel.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';

/** Only a frozen, offline-accepted internal projection enters this preview.
 * Full provenance and solver evidence stay offline; this loader never rates,
 * generates, persists or changes classic progression. */
export function generatedUnlockTrials(input: unknown): readonly UnlockTrialLevel[] {
  const fail = (): never => { throw new Error('Invalid internal single-key bank'); };
  if (!input || typeof input !== 'object') return fail();
  const bank = input as Record<string, unknown>;
  if (bank.format !== 'bottle-harmony-internal-key-bank' || bank.version !== 1 || bank.method !== 'classic-key-batch-v1'
    || !Array.isArray(bank.entries) || bank.entries.length !== 100 || !/^[a-f0-9]{64}$/.test(String(bank.evidenceSha256))) return fail();
  const recipe = bank.recipe as { count?: number; target?: { min?: number; max?: number } } | null;
  if (recipe?.count !== 100 || recipe.target?.min !== 4 || recipe.target.max !== 6) return fail();
  const ids = new Set<string>(), widths = new Set<number>();
  const trials = bank.entries.map((entry: unknown, i) => {
    if (!entry || typeof entry !== 'object') return fail();
    const row = entry as { number?: number; puzzle?: unknown; rank?: number; beforeRank?: number; afterRank?: number;
      origin?: { template?: number }; acceptance?: { status?: string; label?: string; evidenceSha256?: string } };
    const puzzle = parseSortingPuzzle(row.puzzle), width = puzzle.locked.length, trigger = puzzle.triggers[0];
    if (row.number !== i + 1 || !row.rank || row.rank < 4 || row.rank > 6 || !Number.isSafeInteger(row.rank)
      || !Number.isSafeInteger(row.beforeRank) || !Number.isSafeInteger(row.afterRank) || row.beforeRank! < 1 || row.afterRank! < 0
      || row.rank !== Math.max(row.beforeRank!, row.afterRank!)
      || row.acceptance?.status !== 'pass' || row.acceptance.label !== '通过' || !/^[a-f0-9]{64}$/.test(String(row.acceptance.evidenceSha256))
      || ![1, 2, 3].includes(width) || row.origin?.template !== width || puzzle.hidden.length || puzzle.triggers.length !== 1
      || trigger.when.type !== 'empty' || trigger.unlock.length !== width || puzzle.locked.some(id => !trigger.unlock.includes(id)) || ids.has(puzzle.id)) return fail();
    ids.add(puzzle.id); widths.add(width);
    const names = ['', '单瓶匣', '双瓶匣', '三瓶匣'];
    return Object.freeze({ puzzle, focus: `generated-box-${width}`, title: [names[width], `${width}-bottle box`] as const,
      introduction: ['清空钥匙瓶，打开瓶匣，再整理全部液体。可免费撤销或重来。', 'Empty the key bottle to open its box, then sort all liquid. Undo and reset are free.'] as const });
  });
  if (widths.size !== 3) return fail();
  return Object.freeze(trials);
}
