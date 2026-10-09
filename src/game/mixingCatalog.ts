import type { MixingPuzzle, RawColor } from './mixing.ts';
export const MIXING_CATALOG = 'mixing-six-v1';
const R: RawColor = 'coral', Y: RawColor = 'amber', B: RawColor = 'indigo', W: RawColor = 'silver';
/** Intentional matched pair 1/4 compares the result templates, not puzzle difficulty. */
export const MIXING_PUZZLES: readonly MixingPuzzle[] = [
  { id: 'lab-rainbow-01', number: 1, artwork: 'rainbow', bottles: [[R], [Y, Y], [B], [], []], goals: ['labOrange', 'labGreen'] },
  { id: 'lab-rainbow-02', number: 2, artwork: 'rainbow', bottles: [[Y, Y, R, B], [R], [], []], goals: ['labOrange', 'labGreen'] },
  { id: 'lab-rainbow-03', number: 3, artwork: 'rainbow', bottles: [[R, R], [Y, Y], [B, B], [], []], goals: ['labOrange', 'labGreen', 'labPurple'] },
  { id: 'lab-flower-01', number: 4, artwork: 'flower', bottles: [[R], [Y, Y], [B], [], []], goals: ['labOrange', 'labGreen'] },
  { id: 'lab-flower-02', number: 5, artwork: 'flower', bottles: [[B, B, R, Y], [Y], [], []], goals: ['labPurple', 'labGreen'] },
  { id: 'lab-flower-03', number: 6, artwork: 'flower', bottles: [[R, Y, W, B], [Y, W], [], []], goals: ['labPink', 'labGreen', 'labCream'] },
];
export function mixingPuzzle(id: string) {
  const puzzle = MIXING_PUZZLES.find(p => p.id === id);
  if (!puzzle) throw new Error('Unknown mixing trial'); return puzzle;
}
