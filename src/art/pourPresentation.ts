import { FLOW_END, FLOW_START, POUR_DURATION_MS, STREAM_FADE_FRACTION } from './pourGeometry.ts';

// The tail overlaps the existing return; it never extends the accepted move.
export const RIPPLE_SETTLE_MS = 210;
const STOP = FLOW_END + STREAM_FADE_FRACTION;

export function receiverResponse(progress: number, enabled: boolean) {
  'worklet';
  if (!enabled || progress <= FLOW_START) return 0;
  if (progress < STOP) return Math.min(1, (progress - FLOW_START) / STREAM_FADE_FRACTION);
  return Math.max(0, 1 - (progress - STOP) * POUR_DURATION_MS / RIPPLE_SETTLE_MS);
}

/** Three small traveling rings at the impact, bounded by the actual cavity. */
export function ripplePose(progress: number, ring: number, halfWidth: number, enabled: boolean) {
  'worklet';
  const response = receiverResponse(progress, enabled);
  const elapsed = Math.max(0, progress - FLOW_START) * POUR_DURATION_MS;
  const phase = (elapsed / 480 + ring / 3) % 1;
  const noNewRing = progress < STOP || Math.floor(elapsed / 480 + ring / 3)
    === Math.floor((STOP - FLOW_START) * POUR_DURATION_MS / 480 + ring / 3);
  const limit = Math.max(0, Math.min(18, halfWidth - 1));
  const rx = limit * (.12 + .88 * phase);
  return { rx, ry: rx * .15, opacity: limit > 1 && noNewRing ? response * .32 * (1 - phase) : 0 };
}

export function pourFocus(progress: number, active: boolean) {
  'worklet';
  if (!active) return 0;
  return Math.max(0, Math.min(1, (progress - .1) / .18, (.94 - progress) / .2));
}

export function corkContact(progress: number, enabled: boolean) {
  'worklet';
  if (!enabled || progress <= .67 || progress >= .96) return 0;
  return Math.sin(Math.PI * (progress - .67) / .29);
}

/** A brief board-local response shares the beginning of the existing fireworks. */
export function finaleGlow(progress: number) {
  'worklet';
  return progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) * .16 : 0;
}
