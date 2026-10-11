import { engineFixture } from '../../src/game/engineExamples.ts';
import type { SortingTrigger } from '../../src/game/engineModel.ts';

const A = 'coral', B = 'jade', C = 'amber', D = 'azure';
const key = (id: string, container: number, unlock: number[]): SortingTrigger => ({ id, when: { type: 'empty', container: `b${container}` }, unlock: unlock.map(i => `b${i}`) });
/** Small fixed algorithm fixtures, not a difficulty-selected trial bank. The
 * mechanical control deliberately remains easy and must not gain key bonuses. */
export const DOUBLE_KEY_SAMPLES = Object.freeze([
  { name: '单瓶连锁机械对照', puzzle: engineFixture('two-key-single-control', [[B,B], [A,A], [A,A], [B,B], [C,C], [C,C]], {
    locked: [3,4], triggers: [key('first', 1, [3]), key('second', 3, [4])],
  }) },
  { name: '双瓶连锁与一半遮盖', puzzle: engineFixture('two-key-double-control', [[B,B], [A,A], [A,A], [D,D,D,D], [B,B], [C,C], [C], [C]], {
    locked: [4,5,6,7], triggers: [key('first', 1, [4,5]), key('second', 4, [6,7])],
  }) },
  { name: '混色准备与跨组整理', puzzle: engineFixture('two-key-mixed', [[B,B,A], [A,B,A], [], [B,A], [C,C], [C,C]], {
    locked: [3,4], triggers: [key('first', 1, [3]), key('second', 3, [4])],
  }) },
]);
