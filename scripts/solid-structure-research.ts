/** Offline construction experiment for one/two solid anchors. No app behavior changes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { applyPour, getPour, isSolved, type Board, type Pour } from '../src/game/rules.ts';
import { solveBoard } from '../src/game/solver.ts';
import { canonicalBottleStrings } from '../src/game/structure.ts';

const CAPACITY = 4;
const MAX_STATES = 200_000;
const MAX_MS = 1_500;
const TRIALS = 1_500;
let seed = 918_431;
const random = () => ((seed = Math.imul(seed, 1_664_525) + 1_013_904_223 >>> 0) / 2 ** 32);

type Config = { name: string; depths: number[]; reserveEmpty: boolean };
type Result = { status: 'solved'; moves: number; route: Pour[]; visited: number }
  | { status: 'unsolvable' | 'unknown'; visited: number };
type Node = { board: Board; key: string; steps: number; estimate: number; parent: number; pour: Pour | null };

function restrictedPour(board: Board, depths: readonly number[], source: number, target: number): Pour | null {
  const ordinary = getPour(board, source, target, CAPACITY);
  if (!ordinary) return null;
  const amount = Math.min(ordinary.amount, board[source].length - depths[source]);
  return amount > 0 ? { ...ordinary, amount } : null;
}

function applyRestricted(board: Board, pour: Pour): Board {
  const source = board[pour.source];
  return board.map((bottle, index) => index === pour.source ? source.slice(0, -pour.amount)
    : index === pour.target ? [...bottle, ...Array(pour.amount).fill(pour.color)] : [...bottle]);
}

function solveRestricted(start: Board, depths: readonly number[]): Result {
  const begun = performance.now();
  const colorCount = new Set(start.flat()).size;
  const key = (board: Board) => board.map((bottle, index) => ({ text: bottle.join(''), depth: depths[index], index }))
    .filter(item => !item.depth).map(item => item.text).sort().join('|') + '#'
    + board.map((bottle, index) => depths[index] ? `${index}:${bottle.join('')}` : '').filter(Boolean).join('|');
  const estimate = (board: Board) => board.reduce((sum, bottle) => sum + bottle.reduce((runs, color, index) =>
    runs + (index === 0 || color !== bottle[index - 1] ? 1 : 0), 0), 0) - colorCount;
  const nodes: Node[] = [{ board: start, key: key(start), steps: 0, estimate: estimate(start), parent: -1, pour: null }];
  const best = new Map<string, number>([[nodes[0].key, 0]]);
  const heap = [0];
  const less = (a: number, b: number) => nodes[a].steps + nodes[a].estimate < nodes[b].steps + nodes[b].estimate
    || nodes[a].steps + nodes[a].estimate === nodes[b].steps + nodes[b].estimate && nodes[a].estimate < nodes[b].estimate;
  function push(index: number) {
    heap.push(index);
    for (let child = heap.length - 1; child > 0;) {
      const parent = (child - 1) >> 1;
      if (!less(heap[child], heap[parent])) break;
      [heap[child], heap[parent]] = [heap[parent], heap[child]]; child = parent;
    }
  }
  function pop() {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let parent = 0; 2 * parent + 1 < heap.length;) {
        let child = 2 * parent + 1;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
        if (!less(heap[child], heap[parent])) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]]; parent = child;
      }
    }
    return first;
  }
  while (heap.length) {
    if (nodes.length >= MAX_STATES || performance.now() - begun >= MAX_MS) return { status: 'unknown', visited: nodes.length };
    const index = pop(), current = nodes[index];
    if (best.get(current.key) !== index) continue;
    if (isSolved(current.board, CAPACITY)) {
      const route: Pour[] = [];
      for (let cursor = index; nodes[cursor].parent >= 0; cursor = nodes[cursor].parent) route.push(nodes[cursor].pour!);
      route.reverse();
      let replay = start;
      for (const pour of route) {
        const expected = restrictedPour(replay, depths, pour.source, pour.target);
        if (!expected || expected.amount !== pour.amount || expected.color !== pour.color) throw new Error('Invalid restricted route');
        replay = applyRestricted(replay, pour);
      }
      if (!isSolved(replay, CAPACITY)) throw new Error('Restricted route does not solve');
      return { status: 'solved', moves: route.length, route, visited: nodes.length };
    }
    for (let source = 0; source < start.length; source++) for (let target = 0; target < start.length; target++) {
      const pour = restrictedPour(current.board, depths, source, target);
      if (!pour) continue;
      const board = pour.amount === getPour(current.board, source, target, CAPACITY)!.amount
        ? applyPour(current.board, pour, CAPACITY) : applyRestricted(current.board, pour);
      const nextKey = key(board), steps = current.steps + 1;
      const old = best.get(nextKey);
      if (old !== undefined && nodes[old].steps <= steps) continue;
      const next = nodes.length;
      nodes.push({ board, key: nextKey, steps, estimate: estimate(board), parent: index, pour });
      best.set(nextKey, next); push(next);
    }
  }
  return { status: 'unsolvable', visited: nodes.length };
}

function reverseNeighbors(board: Board, depths: readonly number[]): Board[] {
  const neighbors: Board[] = [];
  for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
    if (source === target || board[source].length === CAPACITY || !board[target].length) continue;
    const color = board[target].at(-1)!;
    let run = 0;
    for (let index = board[target].length - 1; index >= 0 && board[target][index] === color; index--) run++;
    for (let amount = 1; amount <= Math.min(run, CAPACITY - board[source].length); amount++) {
      if (board[target].length - amount < depths[target]) continue;
      const prior = board.map((bottle, index) => index === source ? [...bottle, ...Array(amount).fill(color)]
        : index === target ? bottle.slice(0, -amount) : [...bottle]);
      const forward = restrictedPour(prior, depths, source, target);
      if (!forward || forward.amount !== amount || forward.color !== color) continue;
      if (JSON.stringify(applyRestricted(prior, forward)) !== JSON.stringify(board)) throw new Error('Invalid reverse edge');
      neighbors.push(prior);
    }
  }
  return neighbors;
}

function colorRuns(board: Board): number {
  return board.reduce((sum, bottle) => sum + bottle.reduce((runs, color, index) =>
    runs + (index === 0 || color !== bottle[index - 1] ? 1 : 0), 0), 0);
}

if (process.argv.includes('--assemble-side50')) {
  type Candidate = { board: Board; risk: number; moves: number; source: string };
  const seedPool = JSON.parse(readFileSync(new URL('../experiments/solid-target/seed-pool.json', import.meta.url), 'utf8'));
  const candidates: Candidate[] = seedPool.candidates.map((item: any) => ({
    board: item.board, risk: item.riskIncrease, moves: item.frozenMoves, source: 'three-color-exhaustive',
  }));
  for (const [name, count] of [['four', 4], ['five', 5], ['six', 6]] as const) {
    const data = JSON.parse(readFileSync(new URL(`../experiments/solid-target/lifted-${name}-color.json`, import.meta.url), 'utf8'));
    for (const item of data.examples) candidates.push({ board: item.board, risk: item.riskGap,
      moves: item.frozenMoves, source: `${count}-color-constructive-lift` });
  }
  // The target stays distinguished under bottle exchange and color renaming.
  // Its one-off sentinel cannot be permuted with any four-layer color.
  function structure(board: Board): string {
    const codes = new Map([...new Set(board.flat())].sort().map((color, index) => [color, index]));
    return canonicalBottleStrings([...board.slice(0, -1).map(bottle => bottle.map(color => codes.get(color)!)),
      [99, ...board.at(-1)!.map(color => codes.get(color)!)] ]);
  }
  const seen = new Set<string>();
  const chosen: Candidate[] = [];
  const ranges = [
    { colors: 3, count: 2, riskMin: 0, riskMax: 0.01 },
    { colors: 3, count: 3, riskMin: 0.24, riskMax: 0.34 },
    { colors: 3, count: 3, riskMin: 0.34, riskMax: 0.51 },
    { colors: 3, count: 2, riskMin: 0.51, riskMax: 1 },
    { colors: 4, count: 12, riskMin: 0.5, riskMax: 1 },
    { colors: 5, count: 14, riskMin: 0.5, riskMax: 1 },
    { colors: 6, count: 14, riskMin: 0.5, riskMax: 1 },
  ];
  for (const range of ranges) {
    const eligible = candidates.filter(candidate => new Set(candidate.board.flat()).size === range.colors
      && candidate.risk >= range.riskMin && candidate.risk < range.riskMax
      && candidate.board.every(bottle => bottle.length > 0)
      && candidate.board.at(-1)!.length >= 2)
      .sort((a, b) => a.risk - b.risk || a.moves - b.moves || JSON.stringify(a.board).localeCompare(JSON.stringify(b.board)));
    let count = 0;
    for (const candidate of eligible) {
      const key = structure(candidate.board);
      if (seen.has(key)) continue;
      seen.add(key); chosen.push(candidate); count++;
      if (count === range.count) break;
    }
    if (count !== range.count) throw new Error(`Only ${count}/${range.count} unique ${range.colors}-color side puzzles in band ${range.riskMin}`);
  }
  if (chosen.length !== 50) throw new Error('Side-level count mismatch');
  const levels = chosen.map((candidate, index) => {
    const board = candidate.board;
    const colors = [...new Set(board.flat())].sort();
    if (board.length !== colors.length + 1 || board.some(bottle => !bottle.length || bottle.length > 4
      || [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))
      || colors.some(color => board.flat().filter(layer => layer === color).length !== 4)) throw new Error(`Invalid side board ${index + 1}`);
    const depths = [...Array(board.length - 1).fill(0), 1];
    const frozen = solveRestricted(board, depths);
    const melted = solveBoard(board, { capacity: 4, algorithm: 'astar', maxStates: MAX_STATES, maxMilliseconds: MAX_MS });
    if (frozen.status !== 'solved' || melted.status !== 'solved') throw new Error(`Unproved side board ${index + 1}: ${frozen.status}/${melted.status}`);
    if (frozen.moves !== candidate.moves) throw new Error(`Frozen shortest route changed at ${index + 1}`);
    const firstChoices = (locked: boolean, shortest: number) => {
      const options = new Set<string>();
      const result = { choices: 0, safe: 0, costly: 0, dead: 0 };
      for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
        const pour = locked ? restrictedPour(board, depths, source, target) : getPour(board, source, target, CAPACITY);
        if (!pour) continue;
        const next = applyRestricted(board, pour);
        const key = locked ? next.slice(0, -1).map(bottle => bottle.join('')).sort().join('|') + '#' + next.at(-1)!.join('')
          : next.map(bottle => bottle.join('')).sort().join('|');
        if (options.has(key)) continue;
        options.add(key); result.choices++;
        const outcome = locked ? solveRestricted(next, depths)
          : solveBoard(next, { capacity: 4, algorithm: 'astar', maxStates: MAX_STATES, maxMilliseconds: MAX_MS });
        if (outcome.status === 'unsolvable') result.dead++;
        else if (outcome.status !== 'solved') throw new Error(`Unknown first choice at side ${index + 1}`);
        else if (1 + outcome.route.length - shortest >= 3) result.costly++;
        else result.safe++;
      }
      return result;
    };
    const frozenFirstChoices = firstChoices(true, frozen.moves);
    const meltedFirstChoices = firstChoices(false, melted.route.length);
    const riskGap = (frozenFirstChoices.dead + frozenFirstChoices.costly) / frozenFirstChoices.choices
      - (meltedFirstChoices.dead + meltedFirstChoices.costly) / meltedFirstChoices.choices;
    if (Math.abs(riskGap - candidate.risk) > 1e-8) throw new Error(`Risk evidence changed at side ${index + 1}`);
    return { number: index + 1, afterMainline: (index + 1) * 20, id: `solid-side-${String(index + 1).padStart(2, '0')}`,
      colors, bottles: board, frozenBottle: board.length - 1, frozenDepth: 1, structureKey: structure(board),
      difficulty: { frozenMoves: frozen.moves, meltedMoves: melted.route.length, frozenFirstChoices, meltedFirstChoices, riskGap },
      frozenRoute: frozen.route, meltedRoute: melted.route, source: candidate.source };
  });
  const output = { format: 'bottle-harmony-solid-side', version: 1, catalog: 'solid-side-50-v1', capacity: 4,
    mainlineCount: 1000, interval: 20, levels };
  writeFileSync(new URL('../assets/levels/solid-side-50.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ count: levels.length, colors: levels.reduce((a, item) => (a[item.colors.length] = (a[item.colors.length] ?? 0) + 1, a), {} as Record<number, number>),
    risk: [levels[0].difficulty.riskGap, levels[9].difficulty.riskGap, levels[49].difficulty.riskGap] }) + '\n');
  process.exit(0);
}

if (process.argv.includes('--alternate-goal')) {
  const reports = [];
  for (const reserveEmpty of [false, true]) {
    const counts = { attempted: 0, accepted: 0, unsolvedFrozen: 0, unknown: 0, positive: 0, atLeastThree: 0, maxExtraMoves: 0 };
    const examples: Example[] = [];
    for (const colors of [4, 5, 6]) for (let trial = 0; trial < 6000; trial++) {
      counts.attempted++;
      // A will be the frozen bottom at the start. The deliberately constructed
      // ordinary finish instead puts B in that bottle and A in another bottle.
      let board: Board = [Array(3).fill('A'), ...Array.from({ length: colors - 2 }, (_, i) => Array(4).fill(String.fromCharCode(67 + i))),
        Array(4).fill('B'), ['A']];
      const zeroDepths = Array(board.length).fill(0);
      let previous = '';
      for (let step = 0; step < 10 + Math.floor(random() * 24); step++) {
        const alternatives = reverseNeighbors(board, zeroDepths).filter(next => next.at(-1)![0] === 'A'
          && next.map(bottle => bottle.join('')).join('|') !== previous);
        if (!alternatives.length) break;
        const peakRuns = Math.max(...alternatives.map(colorRuns));
        const preferred = alternatives.filter(next => colorRuns(next) === peakRuns);
        const pool = random() < 0.6 ? preferred : alternatives;
        previous = board.map(bottle => bottle.join('')).join('|');
        board = pool[Math.floor(random() * pool.length)];
      }
      if (reserveEmpty) board = [...board.slice(0, -1), [], board.at(-1)!];
      if (board.some(bottle => bottle.length === CAPACITY && new Set(bottle).size === 1)) continue;
      if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
      if (board.filter(bottle => bottle.length === 0).length !== (reserveEmpty ? 1 : 0)) continue;
      const depths = [...Array(board.length - 1).fill(0), 1];
      const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
      const frozen = solveRestricted(board, depths);
      if (melted.status === 'limitReached' || frozen.status === 'unknown') { counts.unknown++; continue; }
      if (melted.status !== 'solved') throw new Error('Constructed ordinary path failed');
      if (frozen.status !== 'solved') { counts.unsolvedFrozen++; continue; }
      counts.accepted++;
      const extraMoves = frozen.moves - melted.route.length;
      if (extraMoves > 0) counts.positive++;
      if (extraMoves >= 3) counts.atLeastThree++;
      counts.maxExtraMoves = Math.max(counts.maxExtraMoves, extraMoves);
      if (extraMoves > 0) examples.push({ colors, board, depths, meltedMoves: melted.route.length,
        frozenMoves: frozen.moves, extraMoves, meltedRoute: melted.route, frozenRoute: frozen.route });
    }
    examples.sort((a, b) => b.extraMoves - a.extraMoves);
    reports.push({ reserveEmpty, counts, examples: examples.slice(0, 20) });
    process.stdout.write(JSON.stringify({ reserveEmpty, counts, top: examples.slice(0, 2).map(example =>
      ({ colors: example.colors, board: example.board, extraMoves: example.extraMoves })) }) + '\n');
  }
  writeFileSync(new URL('../experiments/solid-target/alternate-goal-research.json', import.meta.url), JSON.stringify(reports, null, 2) + '\n');
  process.exit(0);
}

if (process.argv.includes('--random-structure')) {
  const reports = [];
  for (const frozenDepths of [[1], [2], [1, 1]]) {
    const counts = { generated: 0, accepted: 0, unsolvableFrozen: 0, unknown: 0, positive: 0, atLeastThree: 0, maxExtraMoves: 0 };
    const examples: Example[] = [];
    for (const colors of [4, 5, 6]) for (let trial = 0; trial < 6000; trial++) {
      counts.generated++;
      const bottleCount = colors + 1;
      const depths = [...Array(bottleCount - frozenDepths.length).fill(0), ...frozenDepths];
      const lockedColors = frozenDepths.map((_, index) => String.fromCharCode(65 + index));
      const layers = Array.from({ length: colors }, (_, index) => {
        const color = String.fromCharCode(65 + index);
        return Array(4 - (index < frozenDepths.length ? frozenDepths[index] : 0)).fill(color) as string[];
      }).flat();
      const slots: (string | null)[] = [...layers, null, null, null, null];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      let cursor = 0;
      const board = depths.map((depth, index) => {
        const top = slots.slice(cursor, cursor + CAPACITY - depth).filter((color): color is string => color !== null);
        cursor += CAPACITY - depth;
        return [...(depth ? Array(depth).fill(lockedColors[index - (bottleCount - frozenDepths.length)]) : []), ...top];
      });
      if (board.some(bottle => bottle.length === 0 || bottle.length === CAPACITY && new Set(bottle).size === 1)) continue;
      if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
      const frozen = solveRestricted(board, depths);
      if (frozen.status === 'unknown') { counts.unknown++; continue; }
      if (frozen.status !== 'solved') { counts.unsolvableFrozen++; continue; }
      const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
      if (melted.status !== 'solved') { counts.unknown++; continue; }
      counts.accepted++;
      const extraMoves = frozen.moves - melted.route.length;
      if (extraMoves > 0) counts.positive++;
      if (extraMoves >= 3) counts.atLeastThree++;
      counts.maxExtraMoves = Math.max(counts.maxExtraMoves, extraMoves);
      if (extraMoves > 0) examples.push({ colors, board, depths, meltedMoves: melted.route.length,
        frozenMoves: frozen.moves, extraMoves, meltedRoute: melted.route, frozenRoute: frozen.route });
    }
    examples.sort((a, b) => b.extraMoves - a.extraMoves);
    const withEmpty = [];
    for (const example of examples.slice(0, 20)) {
      const lockedCount = frozenDepths.length;
      const board: Board = [...example.board.slice(0, -lockedCount), [], ...example.board.slice(-lockedCount)];
      const depths = [...example.depths.slice(0, -lockedCount), 0, ...example.depths.slice(-lockedCount)];
      const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
      const frozen = solveRestricted(board, depths);
      withEmpty.push({ originalExtraMoves: example.extraMoves, extraMovesWithEmpty: melted.status === 'solved' && frozen.status === 'solved'
        ? frozen.moves - melted.route.length : null });
    }
    const name = frozenDepths.join('-');
    reports.push({ name, depths: frozenDepths, counts, examples: examples.slice(0, 20), withEmpty });
    process.stdout.write(JSON.stringify({ name, counts, top: examples.slice(0, 2).map(example => ({ board: example.board, extraMoves: example.extraMoves })), withEmpty }) + '\n');
  }
  writeFileSync(new URL('../experiments/solid-target/random-structure-research.json', import.meta.url), JSON.stringify(reports, null, 2) + '\n');
  process.exit(0);
}

if (process.argv.includes('--validate-risk20') || process.argv.includes('--validate-constructed20')) {
  const constructed = process.argv.includes('--validate-constructed20');
  const input = JSON.parse(readFileSync(new URL(constructed ? '../experiments/solid-target/constructed-20.json'
    : '../experiments/solid-target/risk-gap-20.json', import.meta.url), 'utf8'));
  type Opening = { choices: number; safe: number; costly: number; dead: number; unknown: number };
  type Section = { meltedMoves: number; frozenMoves: number; ordinaryChoices: Opening; frozenChoices: Opening };
  const reports: { number: number; original: Section; withEmpty: Section }[] = [];
  function opening(board: Board, depths: number[], frozenMode: boolean, shortest: number) {
    const result = { choices: 0, safe: 0, costly: 0, dead: 0, unknown: 0 };
    const seen = new Set<string>();
    for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
      const pour = frozenMode ? restrictedPour(board, depths, source, target) : getPour(board, source, target, CAPACITY);
      if (!pour) continue;
      const next = applyRestricted(board, pour);
      const key = frozenMode
        ? next.slice(0, -1).map(bottle => bottle.join('')).sort().join('|') + '#' + next.at(-1)!.join('')
        : next.map(bottle => bottle.join('')).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key); result.choices++;
      const follow = frozenMode ? solveRestricted(next, depths)
        : solveBoard(next, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
      if (follow.status === 'unsolvable') result.dead++;
      else if (follow.status !== 'solved') result.unknown++;
      else if (1 + follow.route.length - shortest >= 3) result.costly++;
      else result.safe++;
    }
    return result;
  }
  for (const sample of input.samples) {
    const board: Board = constructed ? sample.bottles : sample.board;
    const depths = [...Array(board.length - 1).fill(0), 1];
    const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    const frozen = solveRestricted(board, depths);
    if (melted.status !== 'solved' || frozen.status !== 'solved'
      || melted.route.length !== (constructed ? sample.meltedMoves : sample.ordinaryMoves)
      || frozen.moves !== sample.frozenMoves) throw new Error(`Sample ${sample.number} distance mismatch`);
    const ordinaryChoices = opening(board, depths, false, melted.route.length);
    const frozenChoices = opening(board, depths, true, frozen.moves);
    const expectedOrdinary = constructed ? sample.meltedFirstChoices : sample.ordinaryFirstChoices;
    const expectedFrozen = sample.frozenFirstChoices;
    for (const field of ['choices', 'safe', 'costly', 'dead'] as const) {
      const ordinaryExpected = field === 'choices' ? expectedOrdinary.choices ?? expectedOrdinary.legal : expectedOrdinary[field];
      const frozenExpected = field === 'choices' ? expectedFrozen.choices ?? expectedFrozen.legal : expectedFrozen[field];
      if (ordinaryChoices[field] !== ordinaryExpected || frozenChoices[field] !== frozenExpected)
        throw new Error(`Sample ${sample.number} opening mismatch: ${field}`);
    }
    const withEmpty: Board = [...board.slice(0, -1), [], board.at(-1)!];
    const extraDepths = [...Array(withEmpty.length - 1).fill(0), 1];
    const meltedExtra = solveBoard(withEmpty, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    const frozenExtra = solveRestricted(withEmpty, extraDepths);
    if (meltedExtra.status !== 'solved' || frozenExtra.status !== 'solved') throw new Error(`Sample ${sample.number} extra bottle unknown`);
    reports.push({ number: sample.number, original: { meltedMoves: melted.route.length, frozenMoves: frozen.moves,
      ordinaryChoices, frozenChoices }, withEmpty: { meltedMoves: meltedExtra.route.length, frozenMoves: frozenExtra.moves,
      ordinaryChoices: opening(withEmpty, extraDepths, false, meltedExtra.route.length),
      frozenChoices: opening(withEmpty, extraDepths, true, frozenExtra.moves) } });
  }
  writeFileSync(new URL(constructed ? '../experiments/solid-target/constructed-20-validation.json'
    : '../experiments/solid-target/risk-gap-20-validation.json', import.meta.url), JSON.stringify(reports, null, 2) + '\n');
  const summarize = (field: 'original' | 'withEmpty') => reports.reduce((sum, item) => ({
    ordinaryDead: sum.ordinaryDead + item[field].ordinaryChoices.dead,
    frozenDead: sum.frozenDead + item[field].frozenChoices.dead,
    frozenLonger: sum.frozenLonger + Number(item[field].frozenMoves > item[field].meltedMoves),
    unknown: sum.unknown + item[field].ordinaryChoices.unknown + item[field].frozenChoices.unknown,
  }), { ordinaryDead: 0, frozenDead: 0, frozenLonger: 0, unknown: 0 });
  process.stdout.write(JSON.stringify({ samples: reports.length, original: summarize('original'), withEmpty: summarize('withEmpty') }) + '\n');
  process.exit(0);
}

if (process.argv.includes('--analyze-constructed20')) {
  const input = JSON.parse(readFileSync(new URL('../experiments/solid-target/constructed-20.json', import.meta.url), 'utf8'));
  const records = [];
  for (const sample of input.samples) {
    const board: Board = sample.bottles;
    const depths = [...Array(board.length - 1).fill(0), 1];
    const before = colorRuns(board);
    const seen = new Set<string>();
    const choices = [];
    for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
      const pour = restrictedPour(board, depths, source, target);
      if (!pour) continue;
      const next = applyRestricted(board, pour);
      const key = next.slice(0, -1).map(bottle => bottle.join('')).sort().join('|') + '#' + next.at(-1)!.join('');
      if (seen.has(key)) continue;
      seen.add(key);
      const outcome = solveRestricted(next, depths);
      if (outcome.status === 'unknown') throw new Error(`Unknown branch in constructed sample ${sample.number}`);
      choices.push({ source, target, color: pour.color, amount: pour.amount,
        outcome: outcome.status === 'unsolvable' ? 'dead' : 'solvable', deceptive: colorRuns(next) < before });
    }
    records.push({ number: sample.number, colors: sample.colors, choices });
  }
  writeFileSync(new URL('../experiments/solid-target/constructed-20-decisions.json', import.meta.url), JSON.stringify(records, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ samples: records.length,
    dead: records.reduce((sum, record) => sum + record.choices.filter(choice => choice.outcome === 'dead').length, 0),
    deceptiveDead: records.reduce((sum, record) => sum + record.choices.filter(choice => choice.outcome === 'dead' && choice.deceptive).length, 0),
    levelsWithDeceptiveDead: records.filter(record => record.choices.some(choice => choice.outcome === 'dead' && choice.deceptive)).length }) + '\n');
  process.exit(0);
}

if (process.argv.includes('--lift-risk20') || process.argv.includes('--lift-five') || process.argv.includes('--lift-six')) {
  const six = process.argv.includes('--lift-six'), five = process.argv.includes('--lift-five');
  const inputPath = six ? '../experiments/solid-target/lifted-five-color.json'
    : five ? '../experiments/solid-target/lifted-four-color.json' : '../experiments/solid-target/risk-gap-20.json';
  const outputPath = six ? '../experiments/solid-target/lifted-six-color.json'
    : five ? '../experiments/solid-target/lifted-five-color.json' : '../experiments/solid-target/lifted-four-color.json';
  const input = JSON.parse(readFileSync(new URL(inputPath, import.meta.url), 'utf8'));
  const sources = five || six ? input.examples : input.samples;
  const newColor = six ? 'F' : five ? 'E' : 'D';
  const seen = new Set<string>();
  const results = [];
  const counts = { attempted: 0, structurallyValid: 0, frozenSolved: 0, unknown: 0, strong: 0 };
  function opening(board: Board, depths: number[], frozenMode: boolean, shortest: number) {
    const result = { legal: 0, safe: 0, dead: 0, costly: 0, unknown: 0 };
    const canonical = (state: Board) => frozenMode
      ? state.slice(0, -1).map(bottle => bottle.join('')).sort().join('|') + '#' + state.at(-1)!.join('')
      : state.map(bottle => bottle.join('')).sort().join('|');
    const successors = new Set<string>();
    for (let source = 0; source < board.length; source++) for (let target = 0; target < board.length; target++) {
      const pour = frozenMode ? restrictedPour(board, depths, source, target) : getPour(board, source, target, CAPACITY);
      if (!pour) continue;
      const next = applyRestricted(board, pour), key = canonical(next);
      if (successors.has(key)) continue;
      successors.add(key); result.legal++;
      const solved = frozenMode ? solveRestricted(next, depths)
        : solveBoard(next, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
      if (solved.status === 'unsolvable') result.dead++;
      else if (solved.status !== 'solved') result.unknown++;
      else if (1 + solved.route.length - shortest >= 3) result.costly++;
      else result.safe++;
    }
    return result;
  }
  for (const sample of sources) for (let trial = 0; trial < 250; trial++) {
    counts.attempted++;
    const original: Board = sample.board;
    const positions = original.flatMap((bottle, bottleIndex) => bottle.map((_, layerIndex) => ({ bottleIndex, layerIndex }))
      .filter(position => position.bottleIndex !== original.length - 1 || position.layerIndex > 0));
    for (let index = positions.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(random() * (index + 1));
      [positions[index], positions[randomIndex]] = [positions[randomIndex], positions[index]];
    }
    const selected = positions.slice(0, 4), next = original.map(bottle => [...bottle]);
    const displaced = selected.map(position => next[position.bottleIndex][position.layerIndex]);
    for (const position of selected) next[position.bottleIndex][position.layerIndex] = newColor;
    const board: Board = [...next.slice(0, -1), displaced, next.at(-1)!];
    const depths = [...Array(board.length - 1).fill(0), 1];
    const key = board.map(bottle => bottle.join('')).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (board.some(bottle => bottle.length === CAPACITY && new Set(bottle).size === 1)) continue;
    if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
    counts.structurallyValid++;
    const frozen = solveRestricted(board, depths);
    if (frozen.status === 'unknown') { counts.unknown++; continue; }
    if (frozen.status !== 'solved') continue;
    const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    if (melted.status !== 'solved') { counts.unknown++; continue; }
    counts.frozenSolved++;
    const frozenChoices = opening(board, depths, true, frozen.moves);
    const ordinaryChoices = opening(board, depths, false, melted.route.length);
    if (frozenChoices.unknown || ordinaryChoices.unknown) { counts.unknown++; continue; }
    const riskGap = (frozenChoices.dead + frozenChoices.costly) / frozenChoices.legal
      - (ordinaryChoices.dead + ordinaryChoices.costly) / ordinaryChoices.legal;
    if (riskGap >= 0.5 && frozenChoices.dead >= 2 && ordinaryChoices.dead === 0) {
      counts.strong++;
      results.push({ source: sample.number ?? sample.source, board, depths, riskGap, meltedMoves: melted.route.length, frozenMoves: frozen.moves,
        ordinaryChoices, frozenChoices, meltedRoute: melted.route, frozenRoute: frozen.route });
    }
  }
  results.sort((a, b) => b.riskGap - a.riskGap || a.frozenMoves - b.frozenMoves);
  writeFileSync(new URL(outputPath, import.meta.url), JSON.stringify({ counts, examples: results.slice(0, 30) }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ counts, examples: results.slice(0, 3).map(item => ({ board: item.board, riskGap: item.riskGap,
    ordinaryChoices: item.ordinaryChoices, frozenChoices: item.frozenChoices })) }) + '\n');
  process.exit(0);
}

const configurations: Config[] = [
  { name: 'one-layer-no-empty', depths: [1], reserveEmpty: false },
  { name: 'two-layers-no-empty', depths: [2], reserveEmpty: false },
  { name: 'one-layer-real-empty', depths: [1], reserveEmpty: true },
  { name: 'two-layers-real-empty', depths: [2], reserveEmpty: true },
  { name: 'two-bottles-no-empty', depths: [1, 1], reserveEmpty: false },
  { name: 'two-bottles-real-empty', depths: [1, 1], reserveEmpty: true },
];
type Example = { colors: number; board: Board; depths: number[]; meltedMoves: number; frozenMoves: number; extraMoves: number;
  meltedRoute: readonly Pour[]; frozenRoute: readonly Pour[] };
const reports = [];
for (const config of configurations) {
  const counts = { attempted: 0, accepted: 0, unsolved: 0, unknown: 0, positive: 0, atLeastThree: 0, maxExtraMoves: 0 };
  const examples: Example[] = [];
  const seen = new Set<string>();
  for (const colors of [4, 5, 6]) for (let trial = 0; trial < TRIALS; trial++) {
    counts.attempted++;
    const ordinaryColors = Array.from({ length: colors - config.depths.length }, (_, index) => String.fromCharCode(65 + config.depths.length + index));
    const lockedColors = Array.from({ length: config.depths.length }, (_, index) => String.fromCharCode(65 + index));
    let board: Board = [...ordinaryColors.map(color => Array(4).fill(color)), [], ...lockedColors.map(color => Array(4).fill(color))];
    const depths = [...Array(colors - config.depths.length + 1).fill(0), ...config.depths];
    let previous = '';
    for (let step = 0; step < 10 + Math.floor(random() * 24); step++) {
      const alternatives = reverseNeighbors(board, depths).filter(next => next.map(bottle => bottle.join('')).join('|') !== previous);
      if (!alternatives.length) break;
      const peakRuns = Math.max(...alternatives.map(colorRuns));
      const preferred = alternatives.filter(next => colorRuns(next) === peakRuns);
      const pool = random() < 0.6 ? preferred : alternatives;
      previous = board.map(bottle => bottle.join('')).join('|');
      board = pool[Math.floor(random() * pool.length)];
    }
    if (config.reserveEmpty) {
      board = [...board.slice(0, -config.depths.length), [], ...board.slice(-config.depths.length)];
      depths.splice(depths.length - config.depths.length, 0, 0);
    }
    const structure = board.map(bottle => bottle.join('')).join('|');
    if (seen.has(structure)) continue;
    seen.add(structure);
    if (board.some(bottle => bottle.length === CAPACITY && new Set(bottle).size === 1)) continue;
    if (board.some(bottle => [...new Set(bottle)].some(color => bottle.filter(layer => layer === color).length > 2))) continue;
    if (board.filter(bottle => bottle.length === 0).length !== (config.reserveEmpty ? 1 : 0)) continue;
    const melted = solveBoard(board, { capacity: CAPACITY, maxStates: MAX_STATES, maxMilliseconds: MAX_MS, algorithm: 'astar' });
    const frozen = solveRestricted(board, depths);
    if (melted.status === 'limitReached' || frozen.status === 'unknown') { counts.unknown++; continue; }
    if (melted.status !== 'solved' || frozen.status !== 'solved') { counts.unsolved++; continue; }
    counts.accepted++;
    const extraMoves = frozen.moves - melted.route.length;
    if (extraMoves > 0) counts.positive++;
    if (extraMoves >= 3) counts.atLeastThree++;
    counts.maxExtraMoves = Math.max(counts.maxExtraMoves, extraMoves);
    if (extraMoves > 0) examples.push({ colors, board, depths, meltedMoves: melted.route.length,
      frozenMoves: frozen.moves, extraMoves, meltedRoute: melted.route, frozenRoute: frozen.route });
  }
  examples.sort((a, b) => b.extraMoves - a.extraMoves || a.colors - b.colors);
  reports.push({ name: config.name, lockedDepths: config.depths, reserveEmpty: config.reserveEmpty, counts, examples: examples.slice(0, 20) });
  process.stdout.write(JSON.stringify({ name: config.name, counts }) + '\n');
}
writeFileSync(new URL('../experiments/solid-target/structure-research.json', import.meta.url), JSON.stringify({ seed: 918_431, trialsPerColor: TRIALS, reports }, null, 2) + '\n');
