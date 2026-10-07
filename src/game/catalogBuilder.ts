import { encodeCatalog, PLAY_TIERS, type CatalogEntry, type PlayCatalog } from './catalog.ts';
import { evaluateDifficulty, type DifficultyTier } from './difficulty.ts';
import { generateContent } from './generator.ts';
import { hasDiverseStart, isSeed, type MixingPolicy } from './generation.ts';

export type CatalogBuildStats = { requests: number; counts: Record<DifficultyTier, number>; rejected: Record<'generation' | 'unrated' | 'fullTier' | 'diversity', number> };
export type CatalogBuildResult = { status: 'built'; catalog: PlayCatalog; stats: CatalogBuildStats } | { status: 'incomplete' | 'time-limit'; stats: CatalogBuildStats };
export type CatalogBuildOptions = { seed: number; perTier?: number; maxRequests?: number; maxMilliseconds?: number; maxWork?: number };
const COLORS = ['jade', 'coral', 'amber', 'azure', 'violet'];

/** Offline quotas are filled by observed tiers. State/work limits reject candidates;
 * time limits stop the batch so slower computers cannot silently select other content. */
export function buildCatalog(options: CatalogBuildOptions): CatalogBuildResult {
  const perTier = options.perTier ?? 20, maxRequests = options.maxRequests ?? 2000;
  const maxMilliseconds = options.maxMilliseconds ?? 5000, maxWork = options.maxWork ?? 200000;
  if (!isSeed(options.seed) || !Number.isInteger(perTier) || perTier < 1 || perTier > 25
    || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 10000
    || !Number.isInteger(maxMilliseconds) || maxMilliseconds < 1 || maxMilliseconds > 60000
    || !Number.isInteger(maxWork) || maxWork < 1 || maxWork > 10000000) throw new Error('Invalid catalog budget/configuration');
  const entries: CatalogEntry[] = [], keys: string[] = [];
  const stats: CatalogBuildStats = { requests: 0, counts: { D1: 0, D2: 0, D3: 0, D4: 0 }, rejected: { generation: 0, unrated: 0, fullTier: 0, diversity: 0 } };
  const requested = { D1: 0, D2: 0, D3: 0, D4: 0 };
  let cursor = 0;
  while (stats.requests < maxRequests && PLAY_TIERS.some(tier => stats.counts[tier] < perTier)) {
    const target = PLAY_TIERS[cursor++ % PLAY_TIERS.length];
    if (stats.counts[target] >= perTier) continue;
    const variation = requested[target]++ % 2;
    const colorCount = target === 'D1' ? 2 + variation : target === 'D2' ? 3 + variation : target === 'D3' ? 3 + variation : 4;
    const emptyBottles = target === 'D1' || (target === 'D2' && variation === 1) ? 2 : 1;
    const mixing: MixingPolicy = target === 'D3' || target === 'D4' ? 'diverse' : 'relaxed';
    const generated = generateContent({ seed: (options.seed + stats.requests++) >>> 0, colors: COLORS.slice(0, colorCount), emptyBottles, mixing,
      maxAttempts: 256, maxStates: 30000, maxTotalStates: 150000, maxMilliseconds, excludedKeys: keys,
      minSolutionMoves: target === 'D1' ? 3 : 6 });
    if (generated.status === 'invalid') throw new Error(generated.issues.join('; '));
    if (generated.status !== 'generated') {
      if (generated.status === 'limitReached' && generated.reason === 'time') return { status: 'time-limit', stats };
      stats.rejected.generation++; continue;
    }
    const content = generated.content;
    const difficulty = evaluateDifficulty(content.level, { maxWork, maxMilliseconds });
    if (difficulty.reason === 'solver-time' || difficulty.reason === 'policy-time') return { status: 'time-limit', stats };
    if (difficulty.status !== 'rated' || !difficulty.tier) { stats.rejected.unrated++; continue; }
    const actual = difficulty.tier;
    if (stats.counts[actual] >= perTier) { stats.rejected.fullTier++; continue; }
    if ((actual === 'D3' || actual === 'D4') && (mixing !== 'diverse' || !hasDiverseStart(content.level))) { stats.rejected.diversity++; continue; }
    entries.push({ content, difficulty }); keys.push(content.structureKey); stats.counts[actual]++;
  }
  if (PLAY_TIERS.some(tier => stats.counts[tier] !== perTier)) return { status: 'incomplete', stats };
  entries.sort((a, b) => PLAY_TIERS.indexOf(a.difficulty.tier!) - PLAY_TIERS.indexOf(b.difficulty.tier!)
    || a.content.solution.length - b.content.solution.length || (a.content.level.id < b.content.level.id ? -1 : 1));
  const catalog = { id: `starter-${options.seed}-${perTier}`, entries };
  encodeCatalog(catalog);
  return { status: 'built', catalog, stats };
}
