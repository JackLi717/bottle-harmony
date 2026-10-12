import { compileSortingPuzzle, initialEngineState, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { concealedInventoryWorlds } from './unlockPublicDisclosure.ts';

/** Joint public inventory: neither true concealed counts/colors nor true colors
 * of exposed-bottle masks restrict possible worlds. Masked open unit positions
 * are public; all counts and orders behind the locks are unknown. Every world
 * has fixed colors/IDs for its entire replay, with exactly four of each color. */
export function* combinedInventoryWorlds(puzzle: SortingPuzzle): Generator<{ runtime: EngineRuntime; frame: EngineFrame }> {
  const trueRuntime = compileSortingPuzzle(puzzle), initial = initialEngineState(trueRuntime);
  const known = new Set(initial.known);
  const masked = puzzle.units.filter(u => puzzle.hidden.includes(u.id) && !known.has(u.id)).map(u => u.id);
  const lockedIds = puzzle.containers.filter(c => puzzle.locked.includes(c.id)).flatMap(c => c.units);
  const counts = puzzle.colors.map(c => 4 - puzzle.units.filter(u => known.has(u.id) && u.color === c).length);
  const assignments = new Map<string, string>();
  function* visit(index: number): Generator<{ runtime: EngineRuntime; frame: EngineFrame }> {
    if (index < masked.length) {
      for (let c = 0; c < counts.length; c++) if (counts[c] > 0) {
        counts[c]--; assignments.set(masked[index], puzzle.colors[c]); yield* visit(index + 1); counts[c]++;
      }
      return;
    }
    // Recolor anonymous locked IDs from the remaining inventory, then enumerate
    // all count distributions and orders. No true per-bottle multiset is used.
    const inventory = puzzle.colors.flatMap((c, i) => Array.from({ length: counts[i] }, () => c));
    if (inventory.length !== lockedIds.length) throw Error('Invalid combined inventory');
    const colors = new Map(lockedIds.map((id, i) => [id, inventory[i]]));
    const runtime = compileSortingPuzzle({ ...puzzle, units: puzzle.units.map(u => ({ ...u, color: assignments.get(u.id) ?? colors.get(u.id) ?? u.color })) });
    const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
    for (const world of concealedInventoryWorlds(runtime.puzzle)) {
      const contents = initial.state.contents.map((s, i) => { const j = locked.findIndex(c => c.id === puzzle.containers[i].id); return j < 0 ? s : world.units[j]; });
      yield { runtime, frame: { state: { ...initial.state, contents }, known: initial.known } };
    }
  }
  yield* visit(0);
}
