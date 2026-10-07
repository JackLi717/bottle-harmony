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
