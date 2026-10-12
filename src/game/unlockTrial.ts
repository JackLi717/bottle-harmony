import { engineFixture } from './engineExamples.ts';
import type { SortingPuzzle, SortingTrigger } from './engineModel.ts';
import type { TwoKeyHintTable } from './unlockTwoKeyHints.ts';
import type { SingleKeyHintTable } from './unlockHints.ts';
import type { RevealHintTable } from './progressiveRevealHints.ts';

export type UnlockTrialLevel = {
  readonly puzzle: SortingPuzzle;
  readonly title: readonly [string, string];
  readonly introduction: readonly [string, string];
  readonly focus: string;
  readonly hints?: SingleKeyHintTable;
  readonly twoKeyHints?: TwoKeyHintTable;
  readonly revealHints?: RevealHintTable;
  readonly combinationHints?: RevealHintTable;
};
const A = 'coral', B = 'jade', C = 'amber', D = 'azure';
const key = (id: string, bottle: number, targets: number[]): SortingTrigger => ({ id, when: { type: 'empty', container: `b${bottle}` }, unlock: targets.map(i => `b${i}`) });
const cover = (id: string, color: string, targets: number[]): SortingTrigger => ({ id, when: { type: 'color-full', color, count: 4 }, unlock: targets.map(i => `b${i}`) });
function level(number: number, title: UnlockTrialLevel['title'], introduction: UnlockTrialLevel['introduction'], focus: string,
  board: readonly (readonly string[])[], options: Parameters<typeof engineFixture>[2] = {}): UnlockTrialLevel {
  const fixture = engineFixture(`classic-unlock-trial-${String(number).padStart(2, '0')}`, board, options);
  return Object.freeze({ title, introduction, focus, puzzle: Object.freeze({ ...fixture, revision: 'handcrafted-trial-v1' }) });
}

/** Fixed, reviewable internal content. Arrays are bottom-to-top; no runtime generation or player writes. */
export const UNLOCK_TRIAL = Object.freeze([
  level(1, ['整理热身', 'Warm-up'], ['整理全部液体；每种颜色四份。', 'Sort the whole board; four portions of each color.'], 'ordinary',
    [[A,B,C,A], [B,C,A,B], [C,A,B,C], [], []]),
  level(2, ['先取钥匙', 'Reach the key'], ['清空带钥匙的整瓶，自动打开相连瓶组。', 'Empty the entire key bottle to open its linked group.'], 'key-teaching',
    [[A,B,A], [B,A,B], [], [C,A,C,B], [C,C], []], { locked: [3,4,5], triggers: [key('key-a', 0, [3,4,5])] }),
  level(3, ['完成色开布', 'Finish a color'], ['任意一瓶装满四份珊瑚色，自动揭开对应布盖。', 'Fill any bottle with four coral portions to lift the matching covers.'], 'cover-teaching',
    [[A,B,A], [B,A,B,A], [], [B,C,C], [C,C], []], { locked: [3,4,5], triggers: [cover('cover-a', A, [3,4,5])] }),
  level(4, ['未知边界', 'Hidden boundary'], ['移走上层才显露下一份；遇未知边界停倒，再点击继续。', 'Expose the next portion by pouring above it. A hidden boundary stops the pour; tap again to continue.'], 'reveal-teaching',
    [[A,B,A,A], [B,A,B,B], [], []], { hidden: [[0,1],[0,2],[1,1],[1,2]] }),
  level(5, ['腾挪取钥', 'Make room'], ['先安排中转，再清空钥匙瓶。', 'Arrange temporary space before emptying the key bottle.'], 'key-preparation',
    [[A,B,C], [B,C,A], [C,A,B], [], [], [D,A,D,B], [D,C,D], []],
    { locked: [5,6,7], triggers: [key('key-a', 1, [5,6,7])] }),
  level(6, ['先开哪组', 'Which group first?'], ['珊瑚色和翡翠色各开一组，两种先后顺序均可完成。', 'Coral and jade each open a group. Both opening orders can finish.'], 'cover-order',
    [[A,B,A,B], [B,A,B,A], [], [], [C,D,C], [D,C,D,C], [D], []],
    { locked: [4,5,6,7], triggers: [cover('cover-a', A, [4,7]), cover('cover-b', B, [5,6])] }),
  level(7, ['连取两钥', 'Two keys'], ['第二把钥匙在后续瓶组里，前段整理结果继续参与。', 'The next group contains the second key. Keep using the earlier liquid and space.'], 'key-chain',
    [[A,B,A], [B,A,B], [], [C,A,C,D], [C,B], [], [D,C,D,D]],
    { locked: [3,4,5,6], triggers: [key('key-a', 0, [3,4,5]), key('key-b', 4, [6])] }),
  level(8, ['显色后的取舍', 'Replan after reveal'], ['先探索，再为新见的颜色留出空间。', 'Explore, then make space for the newly exposed colors.'], 'reveal-planning',
    [[A,B,C,A], [C,A,B,C], [B,C,A,B], [], []], { hidden: [[0,0],[0,1],[1,0],[1,2],[2,1],[2,2]] }),
  level(9, ['一起打开', 'Open together'], ['一次倒水可以同时取得钥匙并完成对应颜色，全部条件同步生效。', 'One pour can empty the key bottle and finish a color. All matching conditions open together.'], 'simultaneous',
    [[A,B,A], [B,A,B,A], [], [], [C,B,C], [C,C], []],
    { locked: [4,5,6], triggers: [key('key-a', 0, [4]), cover('cover-a', A, [5,6])] }),
  level(10, ['钥匙后再开布', 'Key, then cover'], ['先打开含有最后一份珊瑚色的瓶组，再完成色开下一组。', 'Open the group containing the last coral portion, then finish coral to open the next group.'], 'key-cover-chain',
    [[A,B,A], [B,A,B], [], [C,A,C,D], [C,B], [], [D,C,D,D]],
    { locked: [3,4,5,6], triggers: [key('key-a', 0, [3,4,5]), cover('cover-a', A, [6])] }),
  level(11, ['钥匙与未知层', 'Key and hidden layers'], ['钥匙打开新组；未知份仍只在露顶时显色。', 'The key opens a new group; hidden portions still reveal only at the top.'], 'key-reveal',
    [[A,B,A], [B,A,B], [], [C,A,C,B], [C,C], []],
    { locked: [3,4,5], hidden: [[0,1],[1,1],[3,0],[3,2]], triggers: [key('key-a', 0, [3,4,5])] }),
  level(12, ['双阶段收官', 'Final ascent'], ['先整理已知液体，再开布、取钥匙，最后处理新显露的颜色。', 'Sort visible liquid, lift covers, reach the key, then handle the newly revealed colors.'], 'cover-key-reveal',
    [[A,B,C,A], [B,C,B], [C,A,A], [], [D,B,'violet',D], ['violet',C,D], ['violet',D,'violet'], []],
    { locked: [4,5,6], hidden: [[4,0],[4,2],[6,0],[6,1]], triggers: [cover('cover-a', A, [4,5]), key('key-b', 5, [6])] }),
]);

export function nextUnlockTrialIndex(index: number, solved: boolean, length = UNLOCK_TRIAL.length): number | null {
  return solved && Number.isInteger(length) && length > 0 && Number.isInteger(index) && index >= 0 && index + 1 < length ? index + 1 : null;
}
