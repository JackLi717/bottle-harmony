import { engineFixture } from './engineExamples.ts';
import type { UnlockTrialLevel } from './unlockTrial.ts';

export type UnlockCalibrationLevel = UnlockTrialLevel & {
  readonly pair: string;
  readonly source: { readonly kind: 'candidate'; readonly recipe: 'key-shared-inventory-v1' | 'cover-shared-inventory-v1'; readonly seed: number; readonly candidate: number }
    | { readonly kind: 'classic'; readonly sample: 'C06' };
  readonly extraEmpty: boolean;
};
const A = 'coral', B = 'jade', C = 'amber', D = 'azure', E = 'violet';
// Frozen offline candidates; arrays are bottom-to-top. Nothing is generated on the phone.
const keyA = [[D,C,B,A],[A,B,A,D],[C,B,D,C],[],[],[E,C,B,E],[A,E,D,E]];
const keyB = [[D,A,B,A],[A,B,D,C],[B,C,C,D],[],[],[D,E,A,E],[E,B,C,E]];
const coverA = [[B,A,D,A],[C,B,A,C],[A,D,C,B],[],[],[D,C,E,E],[D,E,E,B]];
const classic = [[D,A,B,D],[D,B,C,B],[C,D,C,A],[A,C,B,A],[],[]];
function entry(number: number, title: UnlockTrialLevel['title'], introduction: UnlockTrialLevel['introduction'], pair: string,
  board: string[][], source: UnlockCalibrationLevel['source'], options: Parameters<typeof engineFixture>[2] = {}, extraEmpty = false): UnlockCalibrationLevel {
  const puzzle = engineFixture(`classic-unlock-calibration-${String(number).padStart(2,'0')}`, extraEmpty ? [...board,[]] : board, options);
  return Object.freeze({ title, introduction, pair, source: Object.freeze(source), extraEmpty, focus: pair,
    puzzle: Object.freeze({ ...puzzle, revision: 'difficulty-trial-v1' }) });
}
const keyOptions = { locked: [5,6], triggers: [{ id: 'key-a', when: { type: 'empty' as const, container: 'b0' }, unlock: ['b5','b6'] }] };
const coverOptions = { locked: [5,6], triggers: [{ id: 'cover-a', when: { type: 'color-full' as const, color: A, count: 4 as const }, unlock: ['b5','b6'] }] };
const keyText = ['清空带钥匙的整瓶，打开相连瓶组，整理全部液体。','Empty the key bottle to open its group, then sort the whole board.'] as const;
const coverText = ['装满四份亮红色，揭开对应盖布，整理全部液体。','Fill a bottle with four coral portions to open its covers, then sort the whole board.'] as const;
/** Four controlled pairs, not eight promised challenge grades. No progress, wallet or public content changes. */
export const UNLOCK_CALIBRATION: readonly UnlockCalibrationLevel[] = Object.freeze([
  entry(1,['钥匙 · A','Key · A'],keyText,'key-arrangement',keyA,{kind:'candidate',recipe:'key-shared-inventory-v1',seed:101128,candidate:5},keyOptions),
  entry(2,['钥匙 · B','Key · B'],keyText,'key-arrangement',keyA,{kind:'candidate',recipe:'key-shared-inventory-v1',seed:101128,candidate:5},keyOptions,true),
  entry(3,['钥匙 · C','Key · C'],keyText,'key-continuation',keyB,{kind:'candidate',recipe:'key-shared-inventory-v1',seed:101128,candidate:394},keyOptions),
  entry(4,['钥匙 · D','Key · D'],keyText,'key-continuation',keyB,{kind:'candidate',recipe:'key-shared-inventory-v1',seed:101128,candidate:394},keyOptions,true),
  entry(5,['盖布 · A','Cover · A'],coverText,'cover-arrangement',coverA,{kind:'candidate',recipe:'cover-shared-inventory-v1',seed:101131,candidate:126},coverOptions),
  entry(6,['盖布 · B','Cover · B'],coverText,'cover-arrangement',coverA,{kind:'candidate',recipe:'cover-shared-inventory-v1',seed:101131,candidate:126},coverOptions,true),
  entry(7,['整理 · A','Sorting · A'],['整理全部液体。','Sort the whole board.'],'progressive',classic,{kind:'classic',sample:'C06'}),
  entry(8,['显色 · B','Reveal · B'],['移走上层后显色；遇未知边界停倒，再点击继续。','Hidden portions reveal when exposed. Pouring stops at a hidden boundary; tap again to continue.'],'progressive',classic,{kind:'classic',sample:'C06'},
    {hidden:[[0,0],[0,1],[1,1],[1,2],[2,0],[2,2],[3,1],[3,2]]}),
]);
