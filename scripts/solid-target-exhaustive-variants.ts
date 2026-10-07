/** Exhaustive small-board comparison of several frozen-prefix structures. */
import { writeFileSync } from 'node:fs';
import { applyPour, getPour, type Board } from '../src/game/rules.ts';

const CAPACITY = 4;
const LIMIT = 1_000_000;
type Configuration = { name: string; goal: Board; depths: number[] };
const configurations: Configuration[] = [
  { name: 'one-layer', goal: [['B', 'B', 'B', 'B'], ['C', 'C', 'C', 'C'], [], ['A', 'A', 'A', 'A']], depths: [0, 0, 0, 1] },
  { name: 'two-layers', goal: [['B', 'B', 'B', 'B'], ['C', 'C', 'C', 'C'], [], ['A', 'A', 'A', 'A']], depths: [0, 0, 0, 2] },
  { name: 'two-bottles', goal: [['C', 'C', 'C', 'C'], [], ['A', 'A', 'A', 'A'], ['B', 'B', 'B', 'B']], depths: [0, 0, 1, 1] },
];

function key(board: Board, depths: readonly number[]): string {
  const loose = board.filter((_, index) => !depths[index]).map(bottle => bottle.join('')).sort().join('|');
  const fixed = board.map((bottle, index) => depths[index] ? `${index}:${bottle.join('')}` : '').filter(Boolean).join('|');
  return `${loose}#${fixed}`;
}
function ordinaryKey(board: Board): string { return board.map(bottle => bottle.join('')).sort().join('|'); }

function predecessors(board: Board, depths: readonly number[]): Board[] {
  const results: Board[] = [];
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    if (source === target || board[source].length === CAPACITY || !board[target].length) continue;
    const color = board[target].at(-1)!;
    let run = 0;
    for (let index = board[target].length - 1; index >= 0 && board[target][index] === color; index--) run++;
    for (let amount = 1; amount <= Math.min(run, CAPACITY - board[source].length); amount++) {
      if (board[target].length - amount < depths[target]) continue;
      const prior = board.map((bottle, index) => index === source ? [...bottle, ...Array(amount).fill(color)]
        : index === target ? bottle.slice(0, -amount) : [...bottle]);
      const pour = getPour(prior, source, target, CAPACITY);
      if (!pour) continue;
      const allowed = Math.min(pour.amount, prior[source].length - depths[source]);
      if (allowed === amount) results.push(prior);
    }
  }
  return results;
}

function bfs(goal: Board, depths: readonly number[], ordinary: boolean) {
  const states: Board[] = [goal];
  const encode = ordinary ? ordinaryKey : (board: Board) => key(board, depths);
  const distances = new Map<string, number>([[encode(goal), 0]]);
  let cursor = 0;
  for (; cursor < states.length && states.length < LIMIT; cursor++) {
    const board = states[cursor], distance = distances.get(encode(board))!;
    for (const prior of predecessors(board, ordinary ? Array(board.length).fill(0) : depths)) {
      const priorKey = encode(prior);
      if (distances.has(priorKey)) continue;
      distances.set(priorKey, distance + 1); states.push(prior);
    }
  }
  return { states, distances, complete: cursor === states.length };
}

const ordinary = bfs(configurations[0].goal, configurations[0].depths, true);
if (!ordinary.complete) throw new Error('Ordinary enumeration exceeded limit');
type ChoiceMetrics = { choices: number; safe: number; costly: number; dead: number };
const riskSamples: { board: Board; ordinary: ChoiceMetrics; frozen: ChoiceMetrics; riskIncrease: number;
  ordinaryMoves: number; frozenMoves: number }[] = [];
const seedCandidates: typeof riskSamples = [];
function choices(board: Board, depths: readonly number[], distances: Map<string, number>, currentDistance: number,
  ordinaryMode: boolean): ChoiceMetrics {
  const metrics: ChoiceMetrics = { choices: 0, safe: 0, costly: 0, dead: 0 };
  const seen = new Set<string>();
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    const pour = getPour(board, source, target, CAPACITY);
    if (!pour) continue;
    const amount = Math.min(pour.amount, board[source].length - depths[source]);
    if (amount < 1) continue;
    const next = amount === pour.amount ? applyPour(board, pour, CAPACITY) : board.map((bottle, index) =>
      index === source ? bottle.slice(0, -amount) : index === target ? [...bottle, ...Array(amount).fill(pour.color)] : [...bottle]);
    const nextKey = ordinaryMode ? ordinaryKey(next) : key(next, depths);
    if (seen.has(nextKey)) continue;
    seen.add(nextKey); metrics.choices++;
    const remaining = distances.get(nextKey);
    if (remaining === undefined) metrics.dead++;
    else if (1 + remaining - currentDistance >= 3) metrics.costly++;
    else metrics.safe++;
  }
  return metrics;
}
function shortestRoute(board: Board, depths: readonly number[], distances: Map<string, number>, ordinaryMode: boolean) {
  const route = [];
  let current = board;
  const encode = ordinaryMode ? ordinaryKey : (state: Board) => key(state, depths);
  let remaining = distances.get(encode(current));
  if (remaining === undefined) throw new Error('No route to reconstruct');
  while (remaining > 0) {
    let progress = false;
    for (let source = 0; source < current.length && !progress; source++) for (let target = 0; target < current.length && !progress; target++) {
      const pour = getPour(current, source, target, CAPACITY);
      if (!pour) continue;
      const amount = Math.min(pour.amount, current[source].length - depths[source]);
      if (amount < 1) continue;
      const next = amount === pour.amount ? applyPour(current, pour, CAPACITY) : current.map((bottle, index) =>
        index === source ? bottle.slice(0, -amount) : index === target ? [...bottle, ...Array(amount).fill(pour.color)] : [...bottle]);
      if (distances.get(encode(next)) !== remaining - 1) continue;
      route.push({ ...pour, amount }); current = next; remaining--; progress = true;
    }
    if (!progress) throw new Error('Could not reconstruct complete shortest route');
  }
  if (!current.every(bottle => !bottle.length || bottle.length === CAPACITY && new Set(bottle).size === 1))
    throw new Error('Reconstructed route does not solve');
  return route;
}
const reports = [];
let oneLayerDistances: Map<string, number> | null = null;
for (const config of configurations) {
  const frozen = bfs(config.goal, config.depths, false);
  if (!frozen.complete) throw new Error(`${config.name} enumeration exceeded limit`);
  if (config.name === 'one-layer') oneLayerDistances = frozen.distances;
  const byEmpty: Record<string, { count: number; positive: number; maxExtra: number }> = {};
  let unmatched = 0, bestGap = 0;
  let example: Board | null = null;
  let riskIncreased = 0, riskRaisedByQuarter = 0, maxRiskIncrease = 0;
  const riskByEmpty: Record<string, { checked: number; increased: number; quarter: number; maxIncrease: number }> = {};
  const strongByTargetLength: Record<string, number> = {};
  let riskExample: { board: Board; ordinary: ChoiceMetrics; frozen: ChoiceMetrics } | null = null;
  for (const board of frozen.states) {
    const normalDistance = ordinary.distances.get(ordinaryKey(board));
    if (normalDistance === undefined) { unmatched++; continue; }
    const gap = frozen.distances.get(key(board, config.depths))! - normalDistance;
    const empty = board.filter(bottle => bottle.length === 0).length;
    const bucket = byEmpty[empty] ??= { count: 0, positive: 0, maxExtra: 0 };
    bucket.count++;
    if (gap > 0) bucket.positive++;
    bucket.maxExtra = Math.max(bucket.maxExtra, gap);
    if (gap > bestGap) { bestGap = gap; example = board; }
    if (board.every(bottle => bottle.length < CAPACITY || new Set(bottle).size > 1)
      && board.every(bottle => [...new Set(bottle)].every(color => bottle.filter(layer => layer === color).length <= 2))) {
      const ordinaryChoices = choices(board, Array(board.length).fill(0), ordinary.distances, normalDistance, true);
      const frozenChoices = choices(board, config.depths, frozen.distances, frozen.distances.get(key(board, config.depths))!, false);
      const normalRisk = (ordinaryChoices.costly + ordinaryChoices.dead) / ordinaryChoices.choices;
      const frozenRisk = (frozenChoices.costly + frozenChoices.dead) / frozenChoices.choices;
      const increase = frozenRisk - normalRisk;
      if (config.name === 'one-layer' && empty === 0 && board.at(-1)!.length >= 2 && board.at(-1)!.length <= 3
        && ordinaryChoices.costly === 0 && ordinaryChoices.dead === 0 && frozenChoices.safe >= 1)
        seedCandidates.push({ board, ordinary: ordinaryChoices, frozen: frozenChoices, riskIncrease: increase,
          ordinaryMoves: normalDistance, frozenMoves: frozen.distances.get(key(board, config.depths))! });
      if (config.name === 'one-layer' && empty === 0 && increase >= 0.5 && board.at(-1)!.length <= 3)
        riskSamples.push({ board, ordinary: ordinaryChoices, frozen: frozenChoices, riskIncrease: increase,
          ordinaryMoves: normalDistance, frozenMoves: frozen.distances.get(key(board, config.depths))! });
      const riskBucket = riskByEmpty[empty] ??= { checked: 0, increased: 0, quarter: 0, maxIncrease: 0 };
      riskBucket.checked++;
      if (increase > 0) riskBucket.increased++;
      if (increase >= 0.25) riskBucket.quarter++;
      riskBucket.maxIncrease = Math.max(riskBucket.maxIncrease, increase);
      if (increase > 0) riskIncreased++;
      if (increase >= 0.25) riskRaisedByQuarter++;
      if (increase >= 0.5 && empty === 0) {
        const length = board.at(-1)!.length;
        strongByTargetLength[length] = (strongByTargetLength[length] ?? 0) + 1;
      }
      if (increase > maxRiskIncrease) {
        maxRiskIncrease = increase;
        riskExample = { board, ordinary: ordinaryChoices, frozen: frozenChoices };
      }
    }
  }
  if (unmatched) throw new Error(`${config.name}: frozen-solvable structure missing ordinary route`);
  const report = { name: config.name, frozenStructures: frozen.states.length, maxExtraMoves: bestGap, byEmpty, example,
    riskIncreased, riskRaisedByQuarter, maxRiskIncrease, riskByEmpty, strongByTargetLength, riskExample };
  reports.push(report);
  process.stdout.write(JSON.stringify(report) + '\n');
}
writeFileSync(new URL('../experiments/solid-target/exhaustive-variants.json', import.meta.url), JSON.stringify({ ordinaryStructures: ordinary.states.length, reports }, null, 2) + '\n');
const permutations = [['A', 'B', 'C'], ['A', 'C', 'B'], ['B', 'A', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['C', 'B', 'A']];
const canonical = (board: Board) => permutations.map(permutation => {
  const code = board.map(bottle => bottle.map(color => permutation[color.charCodeAt(0) - 65]).join(''));
  return `${code.slice(0, -1).sort().join('|')}#${code.at(-1)}`;
}).sort()[0];
const unique = new Map<string, typeof riskSamples[number]>();
for (const sample of riskSamples.sort((a, b) => b.riskIncrease - a.riskIncrease || a.frozenMoves - b.frozenMoves)) {
  const structure = canonical(sample.board);
  if (!unique.has(structure)) unique.set(structure, sample);
}
const selected = [...unique.values()].filter(sample => sample.board.at(-1)!.length === 2).slice(0, 10)
  .concat([...unique.values()].filter(sample => sample.board.at(-1)!.length === 3).slice(0, 10));
const prototype = selected.map((sample, index) => ({ number: index + 1, board: sample.board, frozenBottle: 3,
  frozenBottomColor: sample.board[3][0], ordinaryMoves: sample.ordinaryMoves, frozenMoves: sample.frozenMoves,
  riskIncrease: sample.riskIncrease, ordinaryFirstChoices: sample.ordinary, frozenFirstChoices: sample.frozen,
  ordinaryRoute: shortestRoute(sample.board, [0, 0, 0, 0], ordinary.distances, true),
  frozenRoute: shortestRoute(sample.board, [0, 0, 0, 1], oneLayerDistances!, false) }));
writeFileSync(new URL('../experiments/solid-target/risk-gap-20.json', import.meta.url), JSON.stringify({
  colors: 3, totalBottles: 4, actualEmptyBottles: 0, totalEmptySlots: 4, uniqueEligible: unique.size,
  samples: prototype,
}, null, 2) + '\n');
process.stdout.write(JSON.stringify({ riskGapCandidates: riskSamples.length, uniqueEligible: unique.size,
  selected: prototype.length, byTargetLength: prototype.reduce((counts, sample) =>
    (counts[sample.board[3].length] = (counts[sample.board[3].length] ?? 0) + 1, counts), {} as Record<number, number>) }) + '\n');
const seedPool = new Map<string, typeof seedCandidates[number]>();
for (const candidate of seedCandidates) {
  const structure = canonical(candidate.board);
  if (!seedPool.has(structure)) seedPool.set(structure, candidate);
}
const pool = [...seedPool.values()].sort((a, b) => a.riskIncrease - b.riskIncrease || a.frozenMoves - b.frozenMoves);
writeFileSync(new URL('../experiments/solid-target/seed-pool.json', import.meta.url), JSON.stringify({
  unique: pool.length,
  candidates: pool,
}, null, 2) + '\n');
process.stdout.write(JSON.stringify({ seedPool: pool.length, riskBuckets: pool.reduce((counts, candidate) => {
  const key = candidate.riskIncrease.toFixed(2);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {} as Record<string, number>) }) + '\n');
