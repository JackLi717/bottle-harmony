import { initialUnits, memoryPour, memoryReadyToReveal, transferUnits, unitColors, type MemorySession, type UnitBoard } from './memory.ts';
import { isSolved, type Pour } from './rules.ts';

export type MemoryRouteAnchor = { bottles: readonly string[]; route: readonly Pour[] };
export function memoryEncoding(current: MemorySession) {
  const colors = unitColors(current.puzzle), codes = new Map(current.puzzle.level.colors.map((c, i) => [c, i * 2]));
  const units = colors.map((c, id) => String.fromCharCode(65 + codes.get(c)! + (current.revealed[id] < 0 ? 1 : 0)));
  const bottles = (board: UnitBoard) => board.map(b => b.map(id => units[id]).join(''));
  return { colors, bottles, key: (board: UnitBoard) => bottles(board).sort().join('|') };
}
/** Replay every move, including the automatic answer boundary, before offering assistance. */
export function verifiedMemoryRoute(current: MemorySession, route: readonly Pour[]): boolean {
  const colors = unitColors(current.puzzle);
  let units = current.units;
  for (const expected of route) {
    if (memoryReadyToReveal(units, colors, current.revealed)) return false;
    const p = memoryPour(units, colors, current.revealed, expected.source, expected.target);
    if (!p || p.amount !== expected.amount || p.color !== expected.color) return false;
    units = transferUnits(units, p);
  }
  return isSolved(units.map(b => b.map(id => colors[id])));
}
/** Bottle order is cosmetic. True color AND hidden status must match; identity stays in the live session. */
export function mappedMemoryRoute(current: MemorySession, units: UnitBoard, anchor: MemoryRouteAnchor): Pour[] | null {
  const actual = memoryEncoding(current).bottles(units), used = new Set<number>();
  const mapping = anchor.bottles.map(b => {
    const i = actual.findIndex((value, index) => value === b && !used.has(index));
    used.add(i); return i;
  });
  if (mapping.includes(-1)) return null;
  const route = anchor.route.map(p => ({ ...p, source: mapping[p.source], target: mapping[p.target] }));
  return verifiedMemoryRoute({ ...current, units }, route) ? route : null;
}
export function rememberMemoryRoute(anchors: Map<string, MemoryRouteAnchor>, current: MemorySession, route: readonly Pour[]) {
  if (!verifiedMemoryRoute(current, route)) return;
  const encode = memoryEncoding(current);
  let units = current.units;
  for (let i = 0; i <= route.length; i++) {
    const key = encode.key(units), suffix = route.slice(i), existing = anchors.get(key);
    if (!existing || suffix.length < existing.route.length) anchors.set(key, { bottles: encode.bottles(units), route: suffix });
    if (i < route.length) units = transferUnits(units, route[i]);
  }
  // Keep a bounded, disposable cache for only the active puzzle.
  while (anchors.size > 256) anchors.delete(anchors.keys().next().value!);
}
export function memoryReferenceAnchors(current: MemorySession): Map<string, MemoryRouteAnchor> {
  const initial = { ...current, units: initialUnits(current.puzzle) };
  const anchors = new Map<string, MemoryRouteAnchor>();
  rememberMemoryRoute(anchors, initial, current.puzzle.solution);
  return anchors;
}
export function memoryReferenceRoute(current: MemorySession): Pour[] | null {
  if (current.judgement !== 'hidden') return null;
  const anchor = memoryReferenceAnchors(current).get(memoryEncoding(current).key(current.units));
  return anchor ? mappedMemoryRoute(current, current.units, anchor) : null;
}
