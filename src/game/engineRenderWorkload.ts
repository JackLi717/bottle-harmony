import type { EngineAction } from './engine.ts';

/** Offline-proved routes, solely for the internal presentation workload. Never player hints. */
const moves = (pairs: readonly (readonly [number, number])[]): readonly EngineAction[] => Object.freeze(pairs.map(([source, target]) => Object.freeze({ type: 'transfer' as const, source: `b${source}`, target: `b${target}` })));
export const ENGINE_RENDER_ROUTES = Object.freeze([
  moves([[0, 1], [2, 0], [3, 2], [0, 3]]),
  moves([[0, 1], [2, 0], [3, 2], [0, 3]]),
  moves([[0, 2], [1, 0], [1, 2], [1, 2], [0, 1], [0, 1], [0, 2]]),
  moves([[0, 3], [1, 3], [2, 3]]),
  moves([[0, 3], [1, 3], [2, 3], [0, 3], [1, 3], [2, 3]]),
]);
export type EngineRenderRun = { readonly id: string; caseIndex: number; moveIndex: number; moves: number; cases: number };
export function engineRenderCase(caseIndex: number, styleCount: number) {
  if (!Number.isSafeInteger(caseIndex) || caseIndex < 0 || !Number.isSafeInteger(styleCount) || styleCount < 1) throw new Error('Invalid render case');
  if (caseIndex >= ENGINE_RENDER_ROUTES.length * styleCount) return null;
  return Object.freeze({ exampleIndex: caseIndex % ENGINE_RENDER_ROUTES.length, styleIndex: Math.floor(caseIndex / ENGINE_RENDER_ROUTES.length) });
}
