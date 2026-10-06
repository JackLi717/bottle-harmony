import type { Board } from './rules';
import { parseLevel } from './model.ts';

/** A solver-checked demonstration fixture, not a published first level. */
export const DEMO_BOARD: Board = [
  ['jade', 'coral', 'jade', 'coral'],
  ['coral', 'jade', 'coral', 'jade'],
  [],
  [],
];

export const DEMO_LEVEL = parseLevel({
  format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'visual-demo', capacity: 4,
  colors: ['jade', 'coral'],
  bottles: DEMO_BOARD.map((layers, index) => ({ id: `bottle-${index + 1}`, layers })),
});
