import type { DifficultyTier } from '../game/difficulty';

export const LAUNCH_SECONDS = .86;
export const BURST_SECONDS = 2.6;
export const FIREWORK_INTERVAL = .64;
export const FIREWORK_START = .18;
export const FIREWORK_COLORS = ['#FFD578', '#FF729C', '#7CEAFF', '#AB92FF', '#84FFC7', '#FFA46F'] as const;
// Relative coordinates keep bursts large on both short and tall game stages.
export const FIREWORKS = [
  { x: 119, y: .32 }, { x: 282, y: .25 }, { x: 199, y: .46 },
  { x: 100, y: .28 }, { x: 289, y: .37 },
] as const;
export type Ember = { vx: number; vy: number; delay: number; life: number; seed: number; layer: number };
export type EmberGroup = { color: string; embers: Ember[] };
export function fireworkCount(tier: DifficultyTier): 2 | 3 | 4 | 5 {
  return tier === 'D4' ? 5 : tier === 'D3' ? 4 : tier === 'D2' ? 3 : 2;
}
export function fireworkDuration(count: number): number {
  'worklet';
  return FIREWORK_START + (count - 1) * FIREWORK_INTERVAL + LAUNCH_SECONDS + BURST_SECONDS;
}
/** Deterministic, staggered layers: broad chrysanthemum, inner petals, core and late glitter. */
export function emberGroups(shell: number): EmberGroup[] {
  const groups: EmberGroup[] = [];
  const populations = [72, 48, 24, 36];
  for (let layer = 0; layer < populations.length; layer++) {
    for (let color = 0; color < FIREWORK_COLORS.length; color++) {
      const embers: Ember[] = [];
      for (let index = color; index < populations[layer]; index += FIREWORK_COLORS.length) {
        const seed = index * 17.31 + layer * 43.17 + shell * 9.71;
        const jitter = (Math.sin(seed * 3.7) + 1) / 2;
        const angle = index * Math.PI * 2 / populations[layer] + shell * .29 + layer * .21 + (jitter - .5) * .055;
        const speed = ([245, 177, 105, 194][layer]) * (.81 + jitter * .25);
        embers.push({ vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          delay: layer === 3 ? .4 + jitter * .38 : layer * .045,
          life: layer === 3 ? 1.1 + jitter * .65 : 2.15 + jitter * .35 - layer * .15, seed, layer });
      }
      const hue = FIREWORK_COLORS[(color + shell + layer) % FIREWORK_COLORS.length];
      const group = groups.find(item => item.color === hue);
      if (group) group.embers.push(...embers); else groups.push({ color: hue, embers });
    }
  }
  return groups;
}
/** A rising shell slows to its apex before breaking open. Coordinates are SVG units. */
export function rocketPosition(x: number, y: number, seconds: number, bottom = 480) {
  'worklet';
  const t = Math.max(0, Math.min(LAUNCH_SECONDS, seconds));
  const f = t / LAUNCH_SECONDS;
  return { x: x - 24 + 24 * f, y: bottom - (bottom - y) * (2 * f - f * f) };
}
/** Air resistance slows the expansion; gravity curves even upward petals into falling trails. */
export function emberPosition(ember: Ember, seconds: number) {
  'worklet';
  const t = Math.max(0, seconds);
  const distance = (1 - Math.exp(-1.3 * t)) / 1.3;
  return { x: ember.vx * distance, y: ember.vy * distance + 49 * t * t };
}
