import { featureSimilarity } from './featureDistribution.ts';
import { FEATURE_MODEL, type LevelFeatureReport } from './levelFeatures.ts';
import type { MainlineEntry } from './mainlineCatalog.ts';
import { createProductionPlan, validateRamp, type ProductionSlot } from './productionPlan.ts';

export type WaveCandidate = { readonly entry: MainlineEntry; readonly features: LevelFeatureReport; readonly optionalReserve: boolean };

/** Augmenting paths keep a locally attractive choice from consuming the only
 * candidate another slot can accept. Exhaustion is an explicit supply failure. */
export function assignDistinctCandidates<T>(choices: ReadonlyMap<number, readonly T[]>, key: (candidate: T) => string): Map<number, T> {
  const owners = new Map<string, number>(), assignments = new Map<number, T>();
  const visit = (number: number, seen: Set<string>): boolean => {
    for (const candidate of choices.get(number) ?? []) {
      const id = key(candidate);
      if (seen.has(id)) continue;
      seen.add(id);
      const owner = owners.get(id);
      if (owner === undefined || visit(owner, seen)) {
        owners.set(id, number); assignments.set(number, candidate); return true;
      }
    }
    return false;
  };
  for (const [number] of [...choices].sort((a, b) => a[1].length - b[1].length || a[0] - b[0])) {
    if (!visit(number, new Set())) throw new Error(`Candidate supply cannot cover slot ${number}`);
  }
  return assignments;
}

/** All candidates must already have complete ratings, feature evidence and
 * one-spare eligibility. Selection does not create difficulty evidence. */
export function selectMountainLevels(candidates: readonly WaveCandidate[], teachingKeys: readonly string[]) {
  if (teachingKeys.length !== 3 || new Set(teachingKeys).size !== 3
    || new Set(candidates.map(c => c.entry.content.structureKey)).size !== candidates.length) throw new Error('Invalid candidate pool');
  for (const c of candidates) {
    if (c.features.structureKey !== c.entry.content.structureKey || c.features.humanScore !== c.entry.human.score?.total
      || c.features.early.status !== 'complete' || c.features.late.status !== 'complete') throw new Error('Incomplete or stale feature evidence');
  }
  const plan = createProductionPlan(), selected = new Map<number, WaveCandidate>();
  const pool = new Map(candidates.map(c => [c.entry.content.structureKey, c]));
  const counts = new Map<string, number>();
  const take = (slot: ProductionSlot, candidate: WaveCandidate) => {
    selected.set(slot.number, candidate); pool.delete(candidate.entry.content.structureKey);
    for (const tag of candidate.features.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  };
  const score = (c: WaveCandidate) => c.entry.human.score!.total;
  const cost = (slot: ProductionSlot, c: WaveCandidate, previous?: WaveCandidate) => {
    const colors = c.entry.content.level.colors.length;
    const outsideSize = slot.preferredColorsMinimum !== null
      && (colors < slot.preferredColorsMinimum || colors > slot.preferredColorsMaximum!);
    const useful = c.features.tags.filter(t => ['early-deception', 'preparation-chain-route', 'space-reuse-route', 'late-risk', 'midroute-risk'].includes(t));
    return (slot.number === 1000 ? -100 * score(c) : 3 * Math.abs(score(c) - slot.targetScore)) + (outsideSize ? 2 : 0)
      + (previous ? 5 * featureSimilarity(previous.features, c.features) + (previous.features.primary === c.features.primary ? 8 : 0) : 0)
      - useful.reduce((sum, tag) => sum + 3 / (1 + (counts.get(tag) ?? 0) / 20), 0);
  };
  const choose = (slot: ProductionSlot, eligible: (c: WaveCandidate) => boolean, previous?: WaveCandidate) => {
    const choices = [...pool.values()].filter(eligible);
    choices.sort((a, b) => cost(slot, a, previous) - cost(slot, b, previous)
      || a.entry.content.structureKey.localeCompare(b.entry.content.structureKey));
    if (!choices.length) throw new Error(`Candidate gap at ${slot.number}, role ${slot.waveRole}, target ${slot.targetScore}`);
    take(slot, choices[0]);
  };
  teachingKeys.forEach((key, index) => {
    const candidate = pool.get(key);
    if (!candidate) throw new Error('Missing teaching board');
    take(plan[index], candidate);
  });
  // Reserve the scarce upper tail first. Each summit sequence is nondecreasing;
  // the twentieth-level peak is at least four points above its subpeak.
  for (const main of [true, false]) {
    const summits = plan.filter(s => s.waveRole === (main ? 'peak' : 'subpeak'));
    for (const slot of [...summits].reverse()) {
      const mainScore = main ? 101 : score(selected.get(slot.number + 10)!);
      choose(slot, c => score(c) >= slot.targetScore && score(c) <= slot.targetScore + 3
        && (main || score(c) <= mainScore - 4)
        && c.entry.rating.evidence.rank! >= 4 && c.entry.human.score!.trapPeak >= (slot.targetScore < 55 ? 5 : 8));
    }
    // Ordered target intervals (and ordered main-peak ceilings for subpeaks)
    // allow sorting the selected scores without changing admissible bands.
    const ordered = summits.map(slot => selected.get(slot.number)!).sort((a, b) => score(a) - score(b));
    summits.forEach((slot, index) => selected.set(slot.number, ordered[index]));
  }
  // Reserve genuine relief, avoiding starts that silently remove a spare.
  for (const slot of plan.filter(s => s.waveRole === 'recovery').sort((a, b) => b.targetScore - a.targetScore || a.number - b.number)) {
    const previousPeak = score(selected.get(Math.floor((slot.number - 1) / 10) * 10)!);
    choose(slot, c => !c.optionalReserve && Math.abs(score(c) - slot.targetScore) <= 8
      && score(c) <= previousPeak - 12 && c.entry.human.score!.trapPeak <= 12
      && c.entry.human.score!.trapRepeat <= 3 && c.features.route.maximumPreparation <= 1);
  }
  const choices = new Map<number, WaveCandidate[]>();
  for (const slot of plan.filter(s => !selected.has(s.number))) {
    const start = Math.floor((slot.number - 1) / 10) * 10;
    const preceding = selected.get(start + (start ? 2 : 3))!;
    const peak = score(selected.get(start + 10)!);
    const eligible = [...pool.values()].filter(c => Math.abs(score(c) - slot.targetScore) <= 8
      && score(c) <= peak - 5 && score(c) >= score(preceding) - 2);
    eligible.sort((a, b) => cost(slot, a, preceding) - cost(slot, b, preceding)
      || a.entry.content.structureKey.localeCompare(b.entry.content.structureKey));
    choices.set(slot.number, eligible);
  }
  for (const [number, candidate] of assignDistinctCandidates(choices, c => c.entry.content.structureKey)) take(plan[number - 1], candidate);
  // Score intervals are ordered inside each ascent, so sorting preserves all
  // slot bands and eliminates accidental downward jumps from matching.
  for (let wave = 0; wave < 100; wave++) {
    const slots = plan.slice(wave * 10, wave * 10 + 9).filter(s => s.waveRole === 'climb' || s.waveRole === 'pressure');
    const ordered = slots.map(slot => selected.get(slot.number)!).sort((a, b) => score(a) - score(b));
    slots.forEach((slot, index) => selected.set(slot.number, ordered[index]));
  }
  const rows = plan.map(slot => ({ number: slot.number, candidate: selected.get(slot.number)! }));
  // Keep the approved twelve-bottle internal comparisons represented in the
  // actual catalog. They obey the same score, evidence and opening constraints.
  for (const colors of [10, 11]) {
    if (rows.some(row => row.candidate.entry.content.level.colors.length === colors && row.candidate.entry.content.level.bottles.length === 12)) continue;
    const examples = [...pool.values()].filter(c => c.entry.content.level.colors.length === colors && c.entry.content.level.bottles.length === 12);
    let placed = false;
    for (const candidate of examples) {
      for (let index = 3; index < rows.length; index++) {
        const slot = plan[index];
        if (slot.waveRole === 'recovery' || slot.role === 'challenge') continue;
        const previous = rows[index].candidate;
        rows[index].candidate = candidate;
        try { validateRamp(rows.map(row => ({ number: row.number, score: score(row.candidate) }))); }
        catch { rows[index].candidate = previous; continue; }
        pool.delete(candidate.entry.content.structureKey); pool.set(previous.entry.content.structureKey, previous);
        placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) throw new Error(`Missing admissible ${colors}-color twelve-bottle comparison`);
  }
  // Improve adjacency by exchanging compatible ordinary slots. Fixed peaks,
  // teaching, relief and validated per-slot score bands stay intact.
  const validSwap = (left: number, right: number) => {
    const copy = rows.map(row => ({ number: row.number, score: score(row.candidate) }));
    [copy[left].score, copy[right].score] = [copy[right].score, copy[left].score];
    try { validateRamp(copy); return true; } catch { return false; }
  };
  const pairCost = (a: WaveCandidate, b: WaveCandidate) => 5 * featureSimilarity(a.features, b.features)
    + (a.features.primary === b.features.primary ? 8 : 0);
  const nearbyCost = (indices: number[]) => [...new Set(indices.flatMap(i => [i - 1, i]))]
    .filter(i => i >= 0 && i < rows.length - 1).reduce((sum, i) => sum + pairCost(rows[i].candidate, rows[i + 1].candidate), 0);
  let swaps = 0;
  for (let pass = 0; pass < 2; pass++) for (let left = 3; left < 1000; left++) {
    if (plan[left].role === 'challenge') continue;
    const partners = Array.from({ length: Math.min(60, 999 - left) }, (_, i) => left + i + 1)
      .filter(right => plan[right].waveRole === plan[left].waveRole && Math.abs(score(rows[left].candidate) - score(rows[right].candidate)) <= 5);
    for (const right of partners) {
      const before = nearbyCost([left, right]);
      [rows[left].candidate, rows[right].candidate] = [rows[right].candidate, rows[left].candidate];
      const better = nearbyCost([left, right]) < before - 0.1;
      [rows[left].candidate, rows[right].candidate] = [rows[right].candidate, rows[left].candidate];
      if (!better || !validSwap(left, right)) continue;
      [rows[left].candidate, rows[right].candidate] = [rows[right].candidate, rows[left].candidate]; swaps++; break;
    }
  }
  const entries: MainlineEntry[] = rows.map((row, index) => {
    const slot = plan[index], c = row.candidate;
    return { content: c.entry.content, rating: c.entry.rating, human: c.entry.human, number: slot.number,
      design: { cycle: slot.cycle, position: slot.cyclePosition, role: slot.waveRole, featureModel: FEATURE_MODEL,
        primary: c.features.primary, tags: c.features.tags } };
  });
  validateRamp(entries.map(e => ({ number: e.number, score: e.human.score!.total })));
  return { entries, featureRows: rows.map(row => ({ number: row.number, report: row.candidate.features })), swaps };
}
