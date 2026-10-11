import { visibleEngineState, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';

/** Only public colors/counts and the public four-of-each inventory are used here.
 * An unopened bottle's amount or its private unit IDs never enters this object. */
export function publicRatingFacts(runtime: EngineRuntime, frame: EngineFrame) {
  const visible = visibleEngineState(runtime, frame.state, frame.known);
  // The secret palette is not a public clue. Use only seen colors and colors
  // explicitly printed on public cover conditions. Unopened counts stay unknown.
  const publicColors = [...new Set([...visible.flatMap(c => c.colors.filter((color): color is string => color !== null)),
    ...runtime.puzzle.triggers.flatMap(t => t.when.type === 'color-full' ? [t.when.color] : [])])].sort();
  const remaining = publicColors.map(color => ({ color, count: 4 - visible.reduce((n, c) => n + c.colors.filter(x => x === color).length, 0) }));
  const unknownPositions = visible.flatMap(c => c.colors.flatMap((color, depth) => color === null ? [{ container: c.id, depth }] : []));
  const possible = remaining.filter(c => c.count > 0).map(c => c.color);
  return { visible, inventory: remaining, unknownPositions, unopened: visible.filter(c => c.count === null).map(c => c.id),
    forcedColor: visible.every(c => c.count !== null) && possible.length === 1
      && remaining.reduce((n, c) => n + c.count, 0) === unknownPositions.length ? possible[0] : null,
    inferenceLimit: 'Only singleton remaining-inventory deductions; no inferred plan or D5 grade.' };
}

/** True receiving space: open, receiving-enabled, matching visible top, excluding the source itself. */
export function ratingSpace(runtime: EngineRuntime, frame: EngineFrame) {
  const visible = visibleEngineState(runtime, frame.state, frame.known);
  const receivers = visible.filter(c => c.canReceive && c.count !== null);
  const sources = visible.filter(c => c.canSource && c.count && c.colors.at(-1) !== null);
  return { openCapacity: receivers.reduce((n, c) => n + c.capacity, 0),
    freeSlots: receivers.reduce((n, c) => n + c.capacity - c.count!, 0), emptyReceivers: receivers.filter(c => c.count === 0).length,
    compatible: sources.map(source => ({ source: source.id, color: source.colors.at(-1)!,
      slots: receivers.filter(c => c.id !== source.id && (!c.count || c.colors.at(-1) === source.colors.at(-1)))
        .reduce((n, c) => n + c.capacity - c.count!, 0) })) };
}
export function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const histogram: Record<string, number> = {};
  for (const value of sorted) histogram[value] = (histogram[value] ?? 0) + 1;
  return { count: sorted.length, min: sorted[0] ?? null, max: sorted.at(-1) ?? null,
    median: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null, histogram };
}

