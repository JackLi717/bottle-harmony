import { engineFixture } from './engineExamples.ts';
import { UNLOCK_BASELINE_PAIRS } from './unlockBaseline.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';

export const STAGE_CALIBRATION_METHOD = 'stage-calibration-v1';
/** Source score bands select controls; they never assign a new stage rank. */
export const STAGE_CALIBRATION_SOURCES = Object.freeze([
  { pair: 'A', mainline: 11, classicScore: 20, key: 0, locked: 1, board: [
    ['amber','jade','azure','violet'], ['violet','jade','coral','violet'], ['azure','coral','amber','coral'],
    ['violet','amber','azure','jade'], ['azure','jade','coral','amber'], [], [],
  ] },
  { pair: 'B', ...UNLOCK_BASELINE_PAIRS[0] },
  { pair: 'C', mainline: 759, classicScore: 62, key: 1, locked: 3, board: [
    ['coral','coral','rose','amber'], ['azure','violet','rose','amber'], ['rose','jade','azure','violet'],
    ['coral','azure','jade','jade'], ['rose','violet','amber','amber'], ['violet','jade','coral','azure'], [],
  ] },
]);
export type StageCalibrationLevel = UnlockTrialLevel & {
  readonly pair: string;
  readonly variant: 'classic' | 'key' | 'mechanical';
  readonly source: { readonly kind: 'mainline'; readonly number: number }
    | { readonly kind: 'mechanical'; readonly colors: 1 | 2; readonly pieces: 2 | 4 };
};
function entry(number: number, pair: string, variant: StageCalibrationLevel['variant'], board: readonly (readonly string[])[],
  source: StageCalibrationLevel['source'], options: Parameters<typeof engineFixture>[2] = {}): StageCalibrationLevel {
  const key = variant === 'key';
  const names = { classic: ['经典', 'Classic'], key: ['钥匙', 'Key'], mechanical: ['整理对照', 'Sorting control'] };
  return Object.freeze({ pair, variant, source: Object.freeze(source), focus: `stage-${pair}`,
    title: [`${pair} · ${names[variant][0]}`, `${pair} · ${names[variant][1]}`] as const,
    introduction: key
      ? ['清空钥匙瓶，打开相连瓶组，再整理全部液体；可免费撤销或重来。', 'Empty the key bottle to open its group, then sort all liquid. Undo and reset are free.'] as const
      : ['整理全部液体；可免费撤销或重来。', 'Sort all liquid. Undo and reset are free.'] as const,
    puzzle: Object.freeze({ ...engineFixture(`classic-stage-calibration-${String(number).padStart(2, '0')}`, board, options), revision: STAGE_CALIBRATION_METHOD }),
  });
}
/** Deterministic split-only controls: more merging operations, no mixed stacks. */
export function mechanicalCalibrationBoard(colors: 1 | 2, pieces: 2 | 4): readonly (readonly string[])[] {
  const board = ['coral','jade'].slice(0, colors).flatMap(color => Array.from({ length: pieces }, () => Array<string>(4 / pieces).fill(color)));
  return [...board, ...Array.from({ length: Math.max(0, 4 - board.length) }, () => [] as string[])];
}
/** Nine internal comparisons, at most two initial empties. No player state. */
export const UNLOCK_STAGE_CALIBRATION: readonly StageCalibrationLevel[] = Object.freeze([
  ...STAGE_CALIBRATION_SOURCES.flatMap((s, i) => (['classic','key'] as const).map((variant, j) =>
    entry(i * 2 + j + 1, s.pair, variant, s.board, { kind: 'mainline', number: s.mainline },
      variant === 'classic' ? {} : { locked: [s.locked], triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${s.key}` }, unlock: [`b${s.locked}`] }] }))),
  ...([{ colors: 1, pieces: 2 }, { colors: 1, pieces: 4 }, { colors: 2, pieces: 4 }] as const).map((s, i) =>
    entry(7 + i, `M${i + 1}`, 'mechanical', mechanicalCalibrationBoard(s.colors, s.pieces), { kind: 'mechanical', ...s })),
]);
