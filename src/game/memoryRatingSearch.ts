/** Offline black-rule search. Even a fully informed solver may use a black
 * portion as a bridge onto a different true color. Colors only judge the goal. */
export type RatingBoard = readonly (readonly number[])[];
export type RatingMove = { source: number; target: number; amount: number; code: number };
export type RatingBudget = { maxStates?: number; maxMilliseconds?: number };
export type RatingSearch = {
  status: 'solved' | 'unsolvable' | 'beyondBound' | 'unknown';
  route: RatingMove[]; visited: number; reason: 'states' | 'time' | null;
};
// Even codes are visible; odd codes hide the same floor(code / 2) true color.
export const ratingColor = (code: number) => Math.floor(code / 2);
export const ratingKey = (board: RatingBoard) => board.map(b => b.map(c => String.fromCharCode(65 + c)).join('')).sort().join('/');
export const ratingSolved = (board: RatingBoard) => board.every(b => !b.length || b.length === 4 && b.every(c => ratingColor(c) === ratingColor(b[0])));
export const ratingAnswer = (board: RatingBoard) => board.some(b => b.length) && board.every(b => !b.length || b.length === 4 && new Set(b.filter(c => c % 2 === 0).map(ratingColor)).size <= 1);
export function ratingMoves(board: RatingBoard): RatingMove[] {
  if (ratingAnswer(board)) return [];
  const moves: RatingMove[] = [];
  board.forEach((from, source) => {
    if (!from.length) return;
    const code = from.at(-1)!;
    let run = 1;
    if (!(code % 2)) while (run < from.length && from[from.length - 1 - run] === code) run++;
    board.forEach((to, target) => {
      if (source === target || to.length === 4) return;
      const receiver = to.at(-1);
      if (receiver !== undefined && !(code % 2) && !(receiver % 2) && code !== receiver) return;
      moves.push({ source, target, code, amount: Math.min(run, 4 - to.length) });
    });
  });
  return moves;
}
export function ratingApply(board: RatingBoard, move: RatingMove): RatingBoard {
  const next = board.map(b => [...b]);
  next[move.target].push(...next[move.source].splice(-move.amount));
  return next;
}
/** Each original visible run must leave its bottle at least once; every black
 * portion leaves separately. At most one bottom true-color run per color can
 * remain in its final bottle. Taking the largest saving per color is optimistic
 * (ignores space and compatibility), so this is an admissible lower bound. */
export function ratingLowerBound(board: RatingBoard): number {
  const groups = (b: readonly number[]) => b.reduce((n, code, i) => n + (i === 0 || code % 2 || b[i - 1] !== code ? 1 : 0), 0);
  let total = 0;
  const savings = new Map<number, number>();
  for (const bottle of board) {
    total += groups(bottle);
    if (!bottle.length) continue;
    const color = ratingColor(bottle[0]);
    let length = 1;
    while (length < bottle.length && ratingColor(bottle[length]) === color) length++;
    savings.set(color, Math.max(savings.get(color) ?? 0, groups(bottle.slice(0, length))));
  }
  return total - [...savings.values()].reduce((a, b) => a + b, 0);
}
/** Exact joint canonicalization: hidden/visible flags are fixed, color labels
 * and bottle permutations are free. Ties are explored, never guessed. */
export function canonicalRatingBoard(board: RatingBoard): RatingBoard {
  function visit(items: RatingBoard, labels: ReadonlyMap<number, number>): string {
    if (!items.length) return '';
    let minimum = '\uffff';
    const candidates: { index: number; text: string; labels: Map<number, number> }[] = [], duplicates = new Set<string>();
    items.forEach((b, index) => {
      const raw = b.join(',');
      if (duplicates.has(raw)) return;
      duplicates.add(raw);
      const next = new Map(labels);
      const text = b.map(code => {
        const color = ratingColor(code);
        if (!next.has(color)) next.set(color, next.size);
        return String.fromCharCode(65 + next.get(color)! * 2 + code % 2);
      }).join('');
      if (text < minimum) { minimum = text; candidates.length = 0; }
      if (text === minimum) candidates.push({ index, text, labels: next });
    });
    let best = '\uffff';
    for (const c of candidates) {
      const suffix = visit(items.filter((_, i) => i !== c.index), c.labels);
      const text = c.text + (items.length > 1 ? '/' + suffix : '');
      if (text < best) best = text;
    }
    return best;
  }
  return visit(board, new Map()).split('/').map(b => [...b].map(c => c.charCodeAt(0) - 65));
}
export function searchRatingBoard(start: RatingBoard, budget: RatingBudget = {}, maxCost = Infinity, allowBridges = true): RatingSearch {
  const maxStates = budget.maxStates ?? 200000, maxMs = budget.maxMilliseconds ?? 2000;
  if (!Number.isSafeInteger(maxStates) || maxStates < 1 || !Number.isFinite(maxMs) || maxMs <= 0
    || !(maxCost === Infinity || Number.isSafeInteger(maxCost) && maxCost >= 0)) throw new Error('Invalid rating search budget');
  type Node = { board: RatingBoard; g: number; h: number; parent: Node | null; move: RatingMove | null; order: number };
  const started = performance.now(), seen = new Map<string, number>([[ratingKey(start), 0]]), heap: Node[] = [];
  const less = (a: Node, b: Node) => a.g + a.h < b.g + b.h || a.g + a.h === b.g + b.h && (a.h < b.h || a.h === b.h && a.order < b.order);
  const push = (node: Node) => {
    heap.push(node); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
  };
  const pop = () => {
    const result = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
        if (!less(heap[child], heap[i])) break;
        [heap[i], heap[child]] = [heap[child], heap[i]]; i = child;
      }
    }
    return result;
  };
  const finish = (status: RatingSearch['status'], reason: RatingSearch['reason'] = null, route: RatingMove[] = []): RatingSearch => ({ status, reason, route, visited: seen.size });
  let order = 0, pruned = false;
  push({ board: start, g: 0, h: ratingLowerBound(start), parent: null, move: null, order: order++ });
  while (heap.length) {
    if (performance.now() - started >= maxMs) return finish('unknown', 'time');
    const node = pop();
    if (seen.get(ratingKey(node.board)) !== node.g) continue;
    if (node.g + node.h > maxCost) { pruned = true; continue; }
    if (ratingSolved(node.board)) {
      const route: RatingMove[] = [];
      for (let n = node; n.parent; n = n.parent) route.push(n.move!);
      return finish('solved', null, route.reverse());
    }
    for (const move of ratingMoves(node.board)) {
      const receiver = node.board[move.target].at(-1);
      if (!allowBridges && receiver !== undefined && ratingColor(receiver) !== ratingColor(move.code)) continue;
      const board = ratingApply(node.board, move), g = node.g + 1, key = ratingKey(board);
      if ((seen.get(key) ?? Infinity) <= g) continue;
      const h = ratingLowerBound(board);
      if (g + h > maxCost) { pruned = true; continue; }
      if (seen.size >= maxStates && !seen.has(key)) return finish('unknown', 'states');
      seen.set(key, g); push({ board, g, h, parent: node, move, order: order++ });
    }
  }
  return finish(pruned ? 'beyondBound' : 'unsolvable');
}
