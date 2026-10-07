/** Offline experiment only. This does not change the shipped game rules or catalog. */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyPour, getPour, isSolved, type Board, type Pour } from '../src/game/rules.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';

type Search = { status: 'solved'; route: Pour[]; visited: number } | { status: 'unsolvable' | 'unknown'; visited: number };
type Node = { board: Board; key: string; g: number; h: number; parent: number; pour: Pour | null };
const CAPACITY = 4;
const MAX_STATES = 300000;
const MAX_MS = 5000;

function frozenPour(board: Board, source: number, target: number): Pour | null {
  const pour = getPour(board, source, target, CAPACITY);
  if (!pour) return null;
  if (source !== board.length - 1) return pour;
  const amount = Math.min(pour.amount, board[source].length - 1);
  return amount ? { ...pour, amount } : null;
}

function applyFrozenPour(board: Board, pour: Pour): Board {
  if (pour.source !== board.length - 1) return applyPour(board, pour, CAPACITY);
  const expected = frozenPour(board, pour.source, pour.target);
  if (!expected || expected.amount !== pour.amount || expected.color !== pour.color) throw new Error('Illegal frozen pour');
  return board.map((bottle, index) => index === pour.source ? bottle.slice(0, -pour.amount)
    : index === pour.target ? [...bottle, ...Array(pour.amount).fill(pour.color)] : [...bottle]);
}

function solveFrozen(start: Board): Search {
  const begun = performance.now();
  const colors = new Set(start.flat());
  const fixed = start.length - 1;
  const key = (board: Board) => board.slice(0, fixed).map(bottle => bottle.join(',')).sort().join('|') + '#' + board[fixed].join(',');
  const heuristic = (board: Board) => board.reduce((sum, bottle) => sum + bottle.reduce((runs, color, i) => runs + (i === 0 || color !== bottle[i - 1] ? 1 : 0), 0), 0) - colors.size;
  const nodes: Node[] = [{ board: start, key: key(start), g: 0, h: heuristic(start), parent: -1, pour: null }];
  const best = new Map<string, number>([[nodes[0].key, 0]]);
  const heap = [0];
  const less = (a: number, b: number) => nodes[a].g + nodes[a].h < nodes[b].g + nodes[b].h
    || nodes[a].g + nodes[a].h === nodes[b].g + nodes[b].h && nodes[a].h < nodes[b].h;
  const push = (index: number) => {
    heap.push(index);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]]; i = p;
    }
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; 2 * i + 1 < heap.length;) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
        if (!less(heap[child], heap[i])) break;
        [heap[i], heap[child]] = [heap[child], heap[i]]; i = child;
      }
    }
    return first;
  };
  while (heap.length) {
    if (nodes.length >= MAX_STATES || performance.now() - begun >= MAX_MS) return { status: 'unknown', visited: nodes.length };
    const index = pop(), current = nodes[index];
    if (best.get(current.key) !== index) continue;
    if (isSolved(current.board, CAPACITY)) {
      const route: Pour[] = [];
      for (let cursor = index; nodes[cursor].parent >= 0; cursor = nodes[cursor].parent) route.push(nodes[cursor].pour!);
      route.reverse();
      let replay = start;
      for (const pour of route) replay = applyFrozenPour(replay, pour);
      if (!isSolved(replay, CAPACITY)) throw new Error('Frozen route replay failed');
      return { status: 'solved', route, visited: nodes.length };
    }
    for (let source = 0; source < current.board.length; source++) for (let target = 0; target < current.board.length; target++) {
      const pour = frozenPour(current.board, source, target);
      if (!pour) continue;
      const board = applyFrozenPour(current.board, pour), nextKey = key(board), g = current.g + 1;
      const prior = best.get(nextKey);
      if (prior !== undefined && nodes[prior].g <= g) continue;
      const next = nodes.length;
      nodes.push({ board, key: nextKey, g, h: heuristic(board), parent: index, pour });
      best.set(nextKey, next); push(next);
    }
  }
  return { status: 'unsolvable', visited: nodes.length };
}

let seed = 927451;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
function candidate(colors: number): Board {
  const slots: (string | null)[] = [
    ...Array.from({ length: colors }, (_, i) => Array(4).fill(String.fromCharCode(65 + i)) as string[]).flat(),
    null, null, null, null,
  ];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return [...Array.from({ length: colors + 1 }, (_, i) => slots.slice(i * 4, i * 4 + 4).filter((color): color is string => color !== null)), []];
}

type Choices = { legal: number; safe: number; detours: number; deadEnds: number; unknown: number };
function firstChoices(board: Board, frozen: boolean, shortest: number): Choices {
  const choices: Choices = { legal: 0, safe: 0, detours: 0, deadEnds: 0, unknown: 0 };
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    const pour = frozen ? frozenPour(board, source, target) : getPour(board, source, target, CAPACITY);
    if (!pour) continue;
    choices.legal++;
    const next = frozen ? applyFrozenPour(board, pour) : applyPour(board, pour, CAPACITY);
    const result = frozen ? solveFrozen(next) : solveBoard(next, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    if (result.status === 'unsolvable') choices.deadEnds++;
    else if (result.status !== 'solved') choices.unknown++;
    else if (1 + result.route.length - shortest >= 3) choices.detours++;
    else choices.safe++;
  }
  return choices;
}

if (process.argv.includes('--reverse-construct')) {
  let constructionSeed = 684217;
  const constructionRandom = () => ((constructionSeed = Math.imul(constructionSeed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  const runs = (board: Board) => board.reduce((sum, bottle) => sum + bottle.reduce((count, color, i) =>
    count + (i === 0 || color !== bottle[i - 1] ? 1 : 0), 0), 0);
  const reverseNeighbors = (board: Board): Board[] => {
    const neighbors: Board[] = [];
    for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
      if (source === target || board[source].length === CAPACITY || board[target].length === 0) continue;
      const color = board[target].at(-1)!;
      let run = 0;
      for (let i = board[target].length - 1; i >= 0 && board[target][i] === color; i--) run++;
      for (let amount = 1; amount <= Math.min(run, CAPACITY - board[source].length); amount++) {
        if (target === board.length - 1 && board[target].length - amount < 1) continue;
        const predecessor = board.map((bottle, index) => index === source ? [...bottle, ...Array(amount).fill(color)]
          : index === target ? bottle.slice(0, -amount) : [...bottle]);
        const pour = frozenPour(predecessor, source, target);
        if (!pour || pour.amount !== amount || pour.color !== color) continue;
        if (JSON.stringify(applyFrozenPour(predecessor, pour)) !== JSON.stringify(board)) throw new Error('Bad reverse edge');
        neighbors.push(predecessor);
      }
    }
    return neighbors;
  };
  const records: { colors: number; spareCapacity: number; bottles: Board; melted: number; frozen: number; gap: number; runs: number }[] = [];
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const colors of [4, 5]) for (const spareCapacity of [1, 2]) for (let trial = 0; trial < 2500; trial++) {
    let board: Board = [...Array.from({ length: colors - 1 }, (_, i) => Array(4).fill(String.fromCharCode(66 + i)) as string[]),
      ...Array.from({ length: spareCapacity }, () => [] as string[]), Array(4).fill('A')];
    for (let step = 0; step < 8 + Math.floor(constructionRandom() * 18); step++) {
      const neighbors = reverseNeighbors(board);
      if (!neighbors.length) break;
      const peak = Math.max(...neighbors.map(runs));
      const preferred = neighbors.filter(next => runs(next) === peak);
      const pool = constructionRandom() < 0.65 ? preferred : neighbors;
      board = pool[Math.floor(constructionRandom() * pool.length)];
    }
    const key = board.map(bottle => bottle.join(',')).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (board.some(bottle => bottle.length === 4 && new Set(bottle).size === 1)) continue;
    if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
    if (spareCapacity === 2 && board.filter(bottle => bottle.length === 0).length < 1) continue;
    const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    const frozen = solveFrozen(board);
    if (melted.status !== 'solved' || frozen.status !== 'solved') { counts.unknown = (counts.unknown ?? 0) + 1; continue; }
    const gap = frozen.route.length - melted.route.length;
    counts[`${spareCapacity}-${gap}`] = (counts[`${spareCapacity}-${gap}`] ?? 0) + 1;
    if (gap > 0) records.push({ colors, spareCapacity, bottles: board, melted: melted.route.length, frozen: frozen.route.length, gap, runs: runs(board) });
  }
  records.sort((a, b) => b.gap - a.gap || b.runs - a.runs);
  writeFileSync(new URL('../experiments/solid-target/reverse-construction-audit.json', import.meta.url), JSON.stringify({ counts, top: records.slice(0, 40) }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ counts, top: records.slice(0, 5) }) + '\n');
  process.exit(0);
}

if (process.argv.includes('--optimize-gap')) {
  let optimizationSeed = 721155;
  const optimizationRandom = () => ((optimizationSeed = Math.imul(optimizationSeed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  const initial: Board = [['A', 'A', 'D'], ['B', 'C', 'A'], ['D', 'B', 'B', 'D'], ['C', 'B', 'D'], ['C', 'C', 'A']];
  const evaluate = (board: Board) => {
    if (board.some(bottle => bottle.length === 0 || bottle.length === 4 && new Set(bottle).size === 1)) return null;
    if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) return null;
    const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    if (melted.status !== 'solved') return null;
    const frozen = solveFrozen(board);
    if (frozen.status !== 'solved') return null;
    return { melted: melted.route.length, frozen: frozen.route.length, gap: frozen.route.length - melted.route.length };
  };
  let board = initial, current = evaluate(initial);
  if (!current || current.gap !== 2) throw new Error('Invalid optimization seed');
  const best: { board: Board; melted: number; frozen: number; gap: number }[] = [{ board, ...current }];
  let evaluated = 0;
  for (let iteration = 0; iteration < 30000; iteration++) {
    const next = board.map(bottle => [...bottle]);
    if (optimizationRandom() < 0.75) {
      const positions = next.flatMap((bottle, bi) => bottle.map((_, li) => ({ bi, li })).filter(position => position.bi !== next.length - 1 || position.li > 0));
      const a = positions[Math.floor(optimizationRandom() * positions.length)], b = positions[Math.floor(optimizationRandom() * positions.length)];
      [next[a.bi][a.li], next[b.bi][b.li]] = [next[b.bi][b.li], next[a.bi][a.li]];
    } else {
      const source = Math.floor(optimizationRandom() * next.length), target = Math.floor(optimizationRandom() * next.length);
      if (source === target || next[source].length < (source === next.length - 1 ? 2 : 1) || next[target].length === CAPACITY) continue;
      next[target].push(next[source].pop()!);
    }
    const result = evaluate(next);
    if (!result) continue;
    evaluated++;
    if (result.gap > best[0].gap) best.unshift({ board: next, ...result });
    if (result.gap >= current.gap || optimizationRandom() < 0.04) { board = next; current = result; }
    if (iteration % 3000 === 2999) { board = best[0].board; current = best[0]; }
  }
  writeFileSync(new URL('../experiments/solid-target/gap-optimization-audit.json', import.meta.url), JSON.stringify({ evaluated, best }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ evaluated, best }) + '\n');
  process.exit(0);
}

if (process.argv.includes('--analyze-existing')) {
  const catalog = JSON.parse(readFileSync(new URL('../assets/levels/mainline-catalog.json', import.meta.url), 'utf8'));
  const records = catalog.records.filter((record: { content: { level: { colors: string[]; bottles: { layers: string[] }[] } } }) =>
    record.content.level.colors.length >= 4 && record.content.level.colors.length <= 6
    && record.content.level.bottles.filter(bottle => bottle.layers.length === 0).length === 1)
    .sort((a: { human: { score: { trapPeak: number } } }, b: { human: { score: { trapPeak: number } } }) => b.human.score.trapPeak - a.human.score.trapPeak);
  const reports: { number: number; colors: number; priorTrapPeak: number; meltedMoves: number; frozenMoves: number;
    meltedPoints: (Choices & { index: number })[]; frozenPoints: (Choices & { index: number })[] }[] = [];
  for (const record of records) {
    if (reports.length === 20) break;
    const original: Board = record.content.level.bottles.map((bottle: { layers: string[] }) => bottle.layers);
    const bottles = [...original.slice(1), original[0]];
    const melted = solveBoard(bottles, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    const frozen = solveFrozen(bottles);
    if (melted.status !== 'solved' || frozen.status === 'unknown') throw new Error(`Unverified existing level ${record.number}`);
    if (frozen.status !== 'solved') continue;
    const frozenRoute = frozen.route;
    const points = (route: readonly Pour[], isFrozen: boolean) => {
      const locations = [0, Math.floor(route.length / 3), Math.floor(2 * route.length / 3)];
      const out = [];
      let board: Board = bottles;
      for (let i = 0; i < route.length; i++) {
        if (locations.includes(i)) out.push({ index: i, ...firstChoices(board, isFrozen, route.length - i) });
        board = isFrozen ? applyFrozenPour(board, route[i]) : applyPour(board, route[i], CAPACITY);
      }
      return out;
    };
    reports.push({ number: record.number, colors: record.content.level.colors.length, priorTrapPeak: record.human.score.trapPeak,
      meltedMoves: melted.route.length, frozenMoves: frozenRoute.length,
      meltedPoints: points(melted.route, false), frozenPoints: points(frozenRoute, true) });
  }
  writeFileSync(new URL('../experiments/solid-target/existing-challenge-audit.json', import.meta.url), JSON.stringify(reports, null, 2) + '\n');
  const aggregate = (mode: 'meltedPoints' | 'frozenPoints') => reports.flatMap(report => report[mode]).reduce((sum, point) =>
    ({ legal: sum.legal + point.legal, safe: sum.safe + point.safe, detours: sum.detours + point.detours,
      deadEnds: sum.deadEnds + point.deadEnds, unknown: sum.unknown + point.unknown }), { legal: 0, safe: 0, detours: 0, deadEnds: 0, unknown: 0 });
  process.stdout.write(JSON.stringify({ levels: reports.length, melted: aggregate('meltedPoints'), frozen: aggregate('frozenPoints'),
    longerFrozen: reports.filter(report => report.frozenMoves > report.meltedMoves).length }) + '\n');
  process.exit(0);
}

type Sample = { number: number; colors: number; bottles: Board; frozenBottle: number; frozenColor: string;
  meltedMoves: number; frozenMoves: number; extraMoves: number; meltedRoute: readonly Pour[]; frozenRoute: readonly Pour[];
  meltedVisited: number; frozenVisited: number; meltedFirstChoices: Choices; frozenFirstChoices: Choices };
const desired = [4, 5, 6].flatMap((colors, i) => Array(i === 2 ? 6 : 7).fill(colors)) as number[];
const samples: Sample[] = [];
const seen = new Set<string>();
let attempts = 0;
for (const colors of desired) {
  let accepted = false;
  for (let tries = 0; tries < 10000 && !accepted; tries++) {
    attempts++;
    const board = candidate(colors);
    if (board.filter(bottle => bottle.length === 0).length !== 1) continue;
    if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
    if (board.some(bottle => bottle.length === 4 && new Set(bottle).size < 3)) continue;
    const target = board.findIndex(bottle => bottle.length > 0 && bottle.length < 4);
    if (target < 0) continue;
    const bottles = [...board.slice(0, target), ...board.slice(target + 1), board[target]];
    const structure = bottles.map(bottle => bottle.join('')).join('|');
    if (seen.has(structure)) continue;
    const melted = solveBoard(bottles, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    if (melted.status !== 'solved') continue;
    replaySolution(bottles, melted.route, CAPACITY);
    const frozen = solveFrozen(bottles);
    if (frozen.status !== 'solved') continue;
    seen.add(structure);
    samples.push({ number: samples.length + 1, colors, bottles, frozenBottle: bottles.length - 1, frozenColor: bottles.at(-1)![0],
      meltedMoves: melted.route.length, frozenMoves: frozen.route.length, extraMoves: frozen.route.length - melted.route.length,
      meltedRoute: melted.route, frozenRoute: frozen.route,
      meltedVisited: melted.stats.visitedStates, frozenVisited: frozen.visited,
      meltedFirstChoices: firstChoices(bottles, false, melted.route.length),
      frozenFirstChoices: firstChoices(bottles, true, frozen.route.length) });
    accepted = true;
  }
  if (!accepted) throw new Error(`Could not find sample with ${colors} colors`);
}
const output = { experiment: 'solid-bottom-v1', seed: 927451, attempts, capacity: CAPACITY,
  rule: 'Only the bottom layer of frozenBottle cannot leave; upper layers pour normally. Heating restores ordinary pours.',
  samples };
writeFileSync(new URL('../experiments/solid-target/20-candidates.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
process.stdout.write(JSON.stringify({ attempts, samples: samples.length,
  differences: samples.reduce((counts, sample) => (counts[sample.extraMoves] = (counts[sample.extraMoves] ?? 0) + 1, counts), {} as Record<number, number>),
  moreRiskyOpenings: samples.filter(sample =>
    (sample.frozenFirstChoices.detours + sample.frozenFirstChoices.deadEnds) / sample.frozenFirstChoices.legal
    > (sample.meltedFirstChoices.detours + sample.meltedFirstChoices.deadEnds) / sample.meltedFirstChoices.legal).length,
  unknownOpeningBranches: samples.reduce((sum, sample) => sum + sample.meltedFirstChoices.unknown + sample.frozenFirstChoices.unknown, 0),
  maxVisited: Math.max(...samples.map(sample => Math.max(sample.meltedVisited, sample.frozenVisited))) }) + '\n');
