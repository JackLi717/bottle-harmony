import type { ColorId } from '../game/rules.ts';

export type CompletionEffect = 'gold' | 'cork' | 'halo';
export const COMPLETION_EFFECTS: readonly { id: CompletionEffect; name: string }[] = [
  { id: 'gold', name: '金边' }, { id: 'cork', name: '瓶塞' }, { id: 'halo', name: '光环' },
];

export function isBottleComplete(colors: readonly ColorId[], capacity = 4) {
  return colors.length === capacity && colors.every(color => color === colors[0]);
}

/** Visible completion follows liquid transfer, independent of other bottles' animation. */
export function completionVisible(completeColors: boolean, visibleLayers: number, capacity = 4) {
  'worklet';
  return completeColors && visibleLayers >= capacity - 0.000001;
}

export const COMPLETION_DURATION = 1200;
export const SYMBOL_FADE_DURATION = 180;

/** Uses the existing visible-completion clock; restored/cancelled scenes are already settled. */
export function completionSymbolOpacity(complete: boolean, timeline: number, animations: boolean) {
  'worklet';
  if (!complete) return 1;
  return animations ? 1 - Math.max(0, Math.min(1, timeline * COMPLETION_DURATION / SYMBOL_FADE_DURATION)) : 0;
}

export type CompletionFrame = { complete: boolean; scene: string; effect: CompletionEffect; replay: number; enabled: boolean };

/** Completion is an edge of this bottle's state, never of the global pour clock. */
export function shouldCelebrateCompletion(current: CompletionFrame, previous: CompletionFrame | null) {
  'worklet';
  return current.complete && current.enabled && previous !== null && current.scene === previous.scene
    && (!previous.complete || current.effect !== previous.effect || current.replay !== previous.replay);
}

export function completionPose(progress: number) {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  const glow = Math.sin(Math.PI * Math.min(1, p / 0.78));
  let corkY = -30;
  if (p >= 0.28 && p < 0.72) {
    const t = (p - 0.28) / 0.44;
    corkY = -30 + 33 * (1 - Math.pow(1 - t, 3));
  } else if (p >= 0.72 && p < 0.86) corkY = 3 - 4 * (p - 0.72) / 0.14;
  else if (p >= 0.86) corkY = -1 + (p - 0.86) / 0.14;
  return { glow: p >= 0.78 ? 0 : glow, spread: Math.min(1, p / 0.78), corkY,
    corkOpacity: Math.max(0, Math.min(1, (p - 0.2) / 0.12)) };
}
