import { useMemo } from 'react';
import type { VesselDesign } from '../art/vesselDesigns';
import { AnimatedTutorial } from './AnimatedTutorial';
import { MAINLINE } from './mainlineContent';

export function Tutorial({ visible, vessel, sound, symbols, reduceMotion, onStart }: {
  visible: boolean; vessel: VesselDesign; sound: boolean; symbols: boolean; reduceMotion: boolean; onStart: () => void;
}) {
  const content = useMemo(() => ({ level: MAINLINE.entries[0].level, solution: MAINLINE.entries[0].solution }), []);
  return <AnimatedTutorial visible={visible} content={content} vessel={vessel} sound={sound} symbols={symbols} reduceMotion={reduceMotion} onStart={onStart} />;
}
