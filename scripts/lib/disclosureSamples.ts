import { readFileSync } from 'node:fs';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { parseSortingPuzzle } from '../../src/game/engineModel.ts';

/** Fixed algorithm controls only; no generator, playable bank or UI entry. */
export const CLOTH_EVALUATION_SAMPLES = [
  engineFixture('cloth-one-control', [['jade'], ['coral','amber','coral'], ['amber','coral','amber'], ['jade'], [], ['coral','amber'], ['jade','jade'], []], {
    locked: [0,3,4,7], triggers: [{ id: 'coral-cover', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b0','b3','b4','b7'] }],
  }),
  engineFixture('cloth-two-control', [['amber'],['coral','jade'],['coral','jade'],['amber'],['amber'],['coral','jade'],['coral','jade'],['amber']], {
    locked: [0,3,4,7], triggers: [{ id: 'coral-cover', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b0','b3'] },
      { id: 'jade-cover', when: { type: 'color-full', color: 'jade', count: 4 }, unlock: ['b4','b7'] }],
  }),
  ...([3, 4] as const).map(keys => {
    const colors = ['coral', 'jade', 'azure', 'violet'].slice(0, keys), corners = [0, 5, 6, 11];
    const sizes = keys === 3 ? [2, 1, 1] : [1, 1, 1, 1];
    const stacks = colors.flatMap(c => [[c, c], [c, c]]);
    while (stacks.length < 8) stacks.push([]);
    let cursor = 0, offset = 0;
    return engineFixture(`cloth-${keys}-control`, Array.from({ length: 12 }, (_, i) => corners.includes(i) ? ['amber'] : stacks[cursor++]), {
      locked: corners, triggers: sizes.map((size, i) => ({ id: `cover-${i}`, when: { type: 'color-full', color: colors[i], count: 4 },
        unlock: corners.slice(offset, offset += size).map(n => `b${n}`) })),
    });
  }),
];
export function existingRevealEvaluationSamples() {
  const bank = JSON.parse(readFileSync(new URL('../../assets/levels/progressive-reveal-four.json', import.meta.url), 'utf8'));
  return (bank.entries as { puzzle: unknown }[]).map(e => parseSortingPuzzle(e.puzzle));
}
