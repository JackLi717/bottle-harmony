import { engineFixture } from './engineExamples.ts';

/** Small internal visual controls; never content, progression or player saves. */
export const POUR_HANDOFF_CASES = [
  { label: 'S 1→0 / T 0→1', source: ['coral'], target: [] },
  { label: 'S 2→1 / T 3→4 · same', source: ['coral', 'coral'], target: ['coral', 'coral', 'coral'] },
  { label: 'S 3→2 / T 3→4 · same', source: ['coral', 'coral', 'coral'], target: ['coral', 'coral', 'coral'] },
  { label: 'S 2→1 / T 0→1 · mixed', source: ['jade', 'coral'], target: [] },
  { label: 'S 3→2 / T 1→2 · mixed', source: ['jade', 'jade', 'coral'], target: ['coral'] },
  { label: 'S 4→3 / T 2→3 · control', source: ['jade', 'jade', 'jade', 'coral'], target: ['coral', 'coral'] },
  { label: 'S 2→0 / T 0→2', source: ['coral', 'coral'], target: [] },
  { label: 'S 3→0 / T 0→3', source: ['coral', 'coral', 'coral'], target: [] },
].map((entry, i) => ({ ...entry, puzzle: engineFixture(`pour-handoff-${i}`, [entry.source, entry.target, [], []]) }));
