/** Shared, presentation-free transfer primitive. Units are ordered bottom to top. */
export type TransferPolicy = {
  readonly capacity: number;
  readonly amount?: 'run' | 'one';
  readonly receive?: 'same' | 'any';
  readonly sourceEnabled?: boolean;
  readonly targetEnabled?: boolean;
  readonly floor?: number;
  readonly acceptColors?: readonly string[] | null;
};

export function transferAmount<T>(from: readonly T[], to: readonly T[], color: (unit: T) => string,
  policy: TransferPolicy, known?: (unit: T) => boolean): number {
  if (!Number.isInteger(policy.capacity) || policy.capacity < 1 || !from.length || to.length >= policy.capacity
    || policy.sourceEnabled === false || policy.targetEnabled === false) return 0;
  const floor = policy.floor ?? 0;
  if (!Number.isInteger(floor) || floor < 0 || from.length <= floor) return 0;
  const top = from[from.length - 1];
  if (known && !known(top)) return 0;
  const topColor = color(top);
  if (policy.acceptColors && !policy.acceptColors.includes(topColor)) return 0;
  // Unknown receiver tops must not act as an oracle for their true colors.
  if (to.length && (known && !known(to[to.length - 1]) || policy.receive !== 'any' && color(to[to.length - 1]) !== topColor)) return 0;
  let count = 1;
  if (policy.amount !== 'one') {
    for (let i = from.length - 2; i >= floor && color(from[i]) === topColor && (!known || known(from[i])); i--) count++;
  }
  return Math.min(count, policy.capacity - to.length);
}

export function sortedContainers<T>(contents: readonly (readonly T[])[], capacity: (index: number) => number, color: (unit: T) => string): boolean {
  return contents.some(units => units.length > 0) && contents.every((units, i) => !units.length
    || units.length === capacity(i) && units.every(unit => color(unit) === color(units[0])));
}
