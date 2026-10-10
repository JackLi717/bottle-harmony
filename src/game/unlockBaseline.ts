import { engineFixture } from './engineExamples.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';

export type UnlockBaselinePair = {
  readonly mainline: number;
  readonly classicScore: number;
  readonly key: number;
  readonly locked: number;
  readonly board: readonly (readonly string[])[];
};
// Frozen existing classic boards, bottom to top. Full source/rating evidence is offline only.
export const UNLOCK_BASELINE_PAIRS: readonly UnlockBaselinePair[] = Object.freeze([
  {"mainline":496,"classicScore":49,"key":1,"locked":3,"board":[["jade","azure","coral","coral"],["coral","violet","violet","jade"],["amber","azure","jade","azure"],["jade","amber","rose","rose"],["rose","violet","coral","amber"],["violet","rose","amber","azure"],[]]},
  {"mainline":775,"classicScore":50,"key":3,"locked":2,"board":[["jade","jade","violet","rose"],["coral","rose","violet","jade"],["amber","tangerine","tangerine","jade"],["azure","amber","coral","azure"],["violet","amber","coral","azure"],["rose","coral","azure","violet"],["tangerine","tangerine","rose","amber"],[]]},
  {"mainline":220,"classicScore":51,"key":3,"locked":4,"board":[["coral","violet","amber","jade"],["rose","azure","jade","amber"],["amber","jade","azure","amber"],["violet","violet","azure","jade"],["rose","coral","azure","rose"],["coral","violet","coral","rose"],[]]},
 ]);
export type UnlockBaselineLevel = UnlockTrialLevel & {
  readonly pair: number;
  readonly variant: 'classic' | 'key';
  readonly classicScore: number;
};
/** Three paired internal experiences; variant difficulty is not inherited from its classic base. */
export const UNLOCK_BASELINE: readonly UnlockBaselineLevel[] = Object.freeze(UNLOCK_BASELINE_PAIRS.flatMap((pair, i) =>
  (['classic','key'] as const).map((variant,j): UnlockBaselineLevel => {
    const key = variant === 'key';
    const puzzle = engineFixture(`classic-unlock-baseline-${String(i * 2 + j + 1).padStart(2,'0')}`,pair.board,key ? {
      locked:[pair.locked],triggers:[{id:'key-a',when:{type:'empty',container:`b${pair.key}`},unlock:[`b${pair.locked}`]}],
    } : {});
    const label = String.fromCharCode(65 + i);
    return Object.freeze<UnlockBaselineLevel>({ pair:i,variant,classicScore:pair.classicScore,focus:`classic-baseline-${pair.mainline}`,
      title: key ? [`钥匙 ${label} · 同底题`,`Key ${label} · paired board`] : [`经典 ${label} · 基准 ${pair.classicScore}`,`Classic ${label} · baseline ${pair.classicScore}`],
      introduction: key ? ['清空钥匙瓶，打开原题中的混色瓶，再整理全部液体。选错可免费撤销或重来。','Empty the key bottle to open a mixed bottle from the original board, then sort everything. Undo and reset are free.']
        : ['先体验经典底题，再比较下一题的钥匙变化。选错可免费撤销或重来。','Try this classic board first, then compare its key variation next. Undo and reset are free.'],
      puzzle:Object.freeze({...puzzle,revision:'classic-baseline-trial-v1'}),
    });
  })));
