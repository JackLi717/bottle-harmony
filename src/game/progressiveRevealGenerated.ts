import { compileSortingPuzzle } from './engine.ts';
import { parseSortingPuzzle } from './engineModel.ts';
import { parseRevealHintTable } from './progressiveRevealHints.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';

/** Internal, frozen, verified projection; never writes player progress. */
export function generatedRevealTrials(input: unknown): readonly UnlockTrialLevel[] {
  const bank = input as { format?: string; version?: number; method?: string; evidenceSha256?: string; entries?: unknown[] } | null;
  const fail = (): never => { throw Error('Invalid internal progressive reveal bank'); };
  if (!bank || bank.format !== 'bottle-harmony-internal-progressive-bank' || bank.version !== 1
    || bank.method !== 'classic-progressive-reveal-four-v1' || !/^[a-f0-9]{64}$/.test(String(bank.evidenceSha256))
    || !Array.isArray(bank.entries) || bank.entries.length !== 4) return fail();
  const ids = new Set<string>(), roots = new Set<string>();
  return Object.freeze(bank.entries.map((entry, i) => {
    const row = entry as { number?: number; puzzle?: unknown; hints?: unknown; sourceSha256?: string; classicStructureKey?: string;
      acceptance?: { method?: string; status?: string; label?: string; worlds?: number; certificatesSha256?: string };
      difficulty?: { status?: string } };
    if (!row || row.number !== i + 1 || !/^[a-f0-9]{64}$/.test(String(row.sourceSha256)) || !row.classicStructureKey || roots.has(row.classicStructureKey)
      || row.acceptance?.method !== 'independent-progressive-reveal-acceptance-v1' || row.acceptance.status !== 'pass' || row.acceptance.label !== '通过'
      || !Number.isSafeInteger(row.acceptance.worlds) || row.acceptance.worlds! < 2
      || !/^[a-f0-9]{64}$/.test(String(row.acceptance.certificatesSha256)) || row.difficulty?.status !== 'not-rated') return fail();
    const puzzle = parseSortingPuzzle(row.puzzle), runtime = compileSortingPuzzle(puzzle);
    if (ids.has(puzzle.id)) return fail();
    ids.add(puzzle.id); roots.add(row.classicStructureKey);
    return Object.freeze({ puzzle, focus: 'generated-progressive-reveal', title: ['逐层显色', 'Progressive reveal'] as const,
      introduction: ['移走上层，逐步显露下层颜色，再完成全盘整理。', 'Pour away the upper liquid to reveal the layers below, then sort the whole board.'] as const,
      revealHints: parseRevealHintTable(row.hints, runtime) });
  }));
}
