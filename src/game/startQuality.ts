import type { LevelDefinition } from './model.ts';

export type StartQualityIssue = {
  readonly bottleId: string;
  readonly color: string;
  readonly copies: number;
  readonly completed: boolean;
};

/** Presentation/content screen for the initial board. It does not change pour rules. */
export function inspectStartQuality(level: Pick<LevelDefinition, 'capacity' | 'bottles'>): readonly StartQualityIssue[] {
  const issues: StartQualityIssue[] = [];
  for (const bottle of level.bottles) {
    const counts = new Map<string, number>();
    for (const color of bottle.layers) counts.set(color, (counts.get(color) ?? 0) + 1);
    for (const [color, copies] of counts) {
      if (copies > 2) issues.push({ bottleId: bottle.id, color, copies,
        completed: bottle.layers.length === level.capacity && copies === level.capacity });
    }
  }
  return issues;
}

export function hasCleanStart(level: Pick<LevelDefinition, 'capacity' | 'bottles'>): boolean {
  return inspectStartQuality(level).length === 0;
}

/** Structural appearance of an opening, independent of display color names. */
export function measureStartVariety(level: Pick<LevelDefinition, 'bottles'>) {
  let filled = 0, bottomPairs = 0, threeColors = 0, fourColors = 0, adjacentPairs = 0;
  for (const { layers } of level.bottles) {
    if (layers.length === 0) continue;
    filled++;
    if (layers[0] === layers[1]) bottomPairs++;
    const distinct = new Set(layers).size;
    if (distinct >= 3) threeColors++;
    if (distinct === 4) fourColors++;
    for (let index = 1; index < layers.length; index++) if (layers[index] === layers[index - 1]) adjacentPairs++;
  }
  return { filled, bottomPairs, threeColors, fourColors, adjacentPairs };
}

export function hasVariedStart(level: Pick<LevelDefinition, 'bottles'>): boolean {
  const variety = measureStartVariety(level);
  return variety.filled > 0 && variety.bottomPairs < variety.filled;
}
