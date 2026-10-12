import { engineFixture } from '../../src/game/engineExamples.ts';
import type { CombinationKind } from './combinationScope.ts';

/** Small fixed algorithm controls, never generated/installed playable content. */
export const COMBINATION_SAMPLES: readonly { kind: CombinationKind; puzzle: ReturnType<typeof engineFixture> }[] = [
  { kind: 'key-cloth', puzzle: engineFixture('key-cloth-space-control', [
    ['azure'], ['amber'], ['azure'], ['coral','jade','amber'], ['azure'], ['azure'],
    ['jade','jade','jade','coral'], ['amber','amber','coral','coral'], ['violet','violet','violet','violet'], [],
  ], { locked: [0,2,4,5,9], triggers: [
    { id: 'key', when: { type: 'empty', container: 'b1' }, unlock: ['b2'] },
    { id: 'cloth', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b0','b4','b5','b9'] },
  ] }) },
  { kind: 'key-reveal', puzzle: engineFixture('key-reveal-control', [
    ['coral','jade'], ['jade','jade'], ['coral','coral'], [], ['coral','jade'],
  ], { locked: [4], hidden: [[0,0],[2,0]], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: ['b4'] }] }) },
  { kind: 'two-key-reveal', puzzle: engineFixture('two-key-reveal-control', [
    ['coral','jade','coral'], ['jade','jade','jade'], ['coral','coral'], ['amber'], ['amber','amber','amber'], [],
  ], { locked: [3,4], hidden: [[0,0]], triggers: [
    { id: 'first', when: { type: 'empty', container: 'b0' }, unlock: ['b3'] },
    { id: 'second', when: { type: 'empty', container: 'b3' }, unlock: ['b4'] },
  ] }) },
];
