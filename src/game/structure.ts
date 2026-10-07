/** Exact canonical labeling of an unordered collection of ordered color strings.
 * Assign the smallest unused label at first occurrence, then individualize only
 * tied minimal next bottles. This avoids enumerating every color permutation.
 * Layer order is never changed. Duplicate bottles share one branch. */
export function canonicalBottleStrings(bottles: readonly (readonly number[])[]): string {
  const rawKey = (items: readonly (readonly number[])[]) => items.map(bottle => bottle.join(',')).sort().join('/');
  function interchangeable(items: readonly (readonly number[])[], left: number, right: number, labels: ReadonlyMap<number, number>): boolean {
    const permutation = new Map<number, number>();
    const targets = new Set<number>();
    for (let layer = 0; layer < items[left].length; layer++) {
      const from = items[left][layer], to = items[right][layer];
      if ((labels.has(from) || labels.has(to)) && from !== to) return false;
      if (permutation.has(from)) { if (permutation.get(from) !== to) return false; }
      else { if (targets.has(to)) return false; permutation.set(from, to); targets.add(to); }
    }
    const missingFrom = [...targets].filter(color => !permutation.has(color));
    const missingTo = [...permutation.keys()].filter(color => !targets.has(color));
    missingFrom.forEach((color, i) => permutation.set(color, missingTo[i]));
    return rawKey(items) === rawKey(items.map(bottle => bottle.map(color => permutation.get(color) ?? color)));
  }
  function visit(remaining: readonly (readonly number[])[], labels: ReadonlyMap<number, number>): string {
    if (!remaining.length) return '';
    let minimum: string | null = null;
    const candidates: { index: number; encoded: string; labels: Map<number, number> }[] = [];
    const duplicates = new Set<string>();
    remaining.forEach((bottle, index) => {
      const identity = bottle.join(',');
      if (duplicates.has(identity)) return;
      duplicates.add(identity);
      const nextLabels = new Map(labels);
      const encoded = bottle.map(color => {
        if (!nextLabels.has(color)) nextLabels.set(color, nextLabels.size);
        return String.fromCharCode(65 + nextLabels.get(color)!);
      }).join('');
      if (minimum === null || encoded < minimum) { minimum = encoded; candidates.length = 0; }
      if (encoded === minimum && !candidates.some(candidate => interchangeable(remaining, candidate.index, index, labels))) {
        candidates.push({ index, encoded, labels: nextLabels });
      }
    });
    let best: string | null = null;
    for (const candidate of candidates) {
      const suffix = visit(remaining.filter((_, index) => index !== candidate.index), candidate.labels);
      const key = candidate.encoded + (remaining.length > 1 ? `/${suffix}` : '');
      if (best === null || key < best) best = key;
    }
    return best!;
  }
  return visit(bottles, new Map());
}
