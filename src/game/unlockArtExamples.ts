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

/** Three distinct key/lock pairs on one board, for visual and mapping acceptance. */
export function unlockKeyPairsExample() {
  return engineFixture('art-key-pairs', [
    ['coral'], ['coral','coral','coral'], ['jade'], ['jade','jade','jade'], ['amber'], ['amber','amber','amber'],
    ['jade','jade','amber','amber'], ['amber','amber','jade','jade'], ['amber','amber','coral','coral'],
    ['coral','coral','amber','amber'], ['coral','coral','jade','jade'], ['jade','jade','coral','coral'],
  ], { locked: [6,7,8,9,10,11], triggers: [
    { id: 'round-key', when: { type: 'empty', container: 'b0' }, unlock: ['b6','b7'] },
    { id: 'diamond-key', when: { type: 'empty', container: 'b2' }, unlock: ['b8','b9'] },
    { id: 'hexagon-key', when: { type: 'empty', container: 'b4' }, unlock: ['b10','b11'] },
  ] });
}
