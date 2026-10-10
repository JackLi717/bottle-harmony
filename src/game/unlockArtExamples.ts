import { engineFixture } from './engineExamples.ts';

export const UNLOCK_ART_CASES = [
  { family: 'wood', count: 1, condition: 'key' }, { family: 'wood', count: 3, condition: 'key' },
  { family: 'louver', count: 1, condition: 'color' }, { family: 'louver', count: 3, condition: 'key' },
  { family: 'cloth', count: 1, condition: 'color' }, { family: 'cloth', count: 3, condition: 'color' },
  { family: 'roller', count: 2, condition: 'key' }, { family: 'roller', count: 3, condition: 'color' },
] as const;

/** Internal appearance samples only: one move opens one/two/three bottles, without player writes. */
export function unlockArtExample(count: 1 | 2 | 3, condition: 'key' | 'color') {
  const board: string[][] = Array.from({ length: 12 }, () => []);
  board[0] = ['coral']; board[1] = ['coral', 'coral', 'coral'];
  if (count === 1) { board[2] = ['amber', 'jade', 'amber', 'jade']; board[6] = ['jade', 'amber', 'jade', 'amber']; }
  if (count === 2) { board[6] = ['jade', 'jade', 'amber', 'amber']; board[7] = ['amber', 'amber', 'jade', 'jade']; }
  if (count === 3) { board[6] = ['jade', 'jade', 'amber', 'amber']; board[7] = ['amber', 'amber', 'azure', 'azure']; board[8] = ['azure', 'azure', 'jade', 'jade']; }
  const locked = Array.from({ length: count }, (_, i) => i + 6);
  return engineFixture(`art-${condition}-${count}`, board, { locked,
    triggers: [{ id: 'art-gate', when: condition === 'key' ? { type: 'empty', container: 'b0' } : { type: 'color-full', color: 'coral', count: 4 }, unlock: locked.map(i => `b${i}`) }] });
}
