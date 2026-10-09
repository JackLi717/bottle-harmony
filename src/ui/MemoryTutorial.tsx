import { useMemo } from 'react';
import type { VesselDesign } from '../art/vesselDesigns';
import type { MemoryPuzzle } from '../game/memory';
import { AnimatedTutorial } from './AnimatedTutorial';

export function MemoryTutorial({ visible, puzzle, vessel, sound, symbols, reduceMotion, onStart, onBack }: {
  visible: boolean; puzzle: MemoryPuzzle; vessel: VesselDesign; sound: boolean; symbols: boolean; reduceMotion: boolean;
  onStart: () => void; onBack: () => void;
}) {
  const content = useMemo(() => ({ level: puzzle.level, solution: puzzle.solution, memory: puzzle }), [puzzle]);
  return <AnimatedTutorial visible={visible} content={content} vessel={vessel} sound={sound} symbols={symbols} reduceMotion={reduceMotion} onStart={onStart} onBack={onBack} />;
}
