import { contentMetrics, GENERATOR_ID, isSeed, makeCandidate, parseGeneratedContent, parseGenerationConfig, structureKey, type GeneratedContent, type GenerationConfig } from './generation.ts';
import { initialBoard, LevelValidationError, type LevelDefinition } from './model.ts';
import { isSolved } from './rules.ts';
import { createSolver, type SolverTask } from './solver.ts';

export type GeneratorOptions = {
  seed: number;
  colors: readonly string[];
  emptyBottles?: 1 | 2;
  minSolutionMoves?: number;
  maxSolutionMoves?: number;
  maxAttempts?: number;
  maxStates?: number;
  maxTotalStates?: number;
  maxMilliseconds?: number;
  excludedKeys?: readonly string[];
};
export type GenerationStats = {
  readonly attempts: number;
  readonly visitedStates: number;
  readonly elapsedMilliseconds: number;
  readonly rejected: Readonly<Record<'initiallySimple' | 'duplicate' | 'unsolvable' | 'searchStates' | 'solutionLength', number>>;
};
export type GenerationResult =
  | { status: 'generated'; content: GeneratedContent; stats: GenerationStats }
  | { status: 'exhausted'; stats: GenerationStats }
  | { status: 'limitReached'; reason: 'time' | 'states' | 'cancelled'; stats: GenerationStats }
  | { status: 'invalid'; issues: readonly string[]; stats: GenerationStats };
export interface GeneratorTask {
  step(maxExpansions?: number, sliceMilliseconds?: number): GenerationResult | null;
  cancel(): GenerationResult;
}

/** Candidate creation is private to the task; only a full verified completion can be emitted. */
export function createGenerator(options: GeneratorOptions): GeneratorTask {
  const maxAttempts = options.maxAttempts ?? 64;
  const maxStates = options.maxStates ?? 30000;
  const maxTotalStates = options.maxTotalStates ?? 150000;
  const maxMilliseconds = options.maxMilliseconds ?? 5000;
  const rejected = { initiallySimple: 0, duplicate: 0, unsolvable: 0, searchStates: 0, solutionLength: 0 };
  let config: GenerationConfig | null = null;
  let attempts = 0, visitedStates = 0, elapsed = 0;
  let result: GenerationResult | null = null;
  let search: SolverTask | null = null;
  let candidate: LevelDefinition | null = null;
  let candidateStateBudget = 0;
  const seed = options.seed;
  const excluded = new Set<string>();
  const issues: string[] = [];
  const stats = (): GenerationStats => ({ attempts, visitedStates, elapsedMilliseconds: elapsed, rejected: Object.freeze({ ...rejected }) });
  try {
    config = parseGenerationConfig({ colors: options.colors, emptyBottles: options.emptyBottles ?? 2,
      minSolutionMoves: options.minSolutionMoves ?? 3, maxSolutionMoves: options.maxSolutionMoves ?? 80 });
  } catch (error) { issues.push(...(error instanceof LevelValidationError ? error.issues : ['Invalid configuration'])); }
  if (!isSeed(seed)) issues.push('Seed must be an unsigned 32-bit integer');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) issues.push('maxAttempts must be an integer from 1 to 1000');
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000) issues.push('maxStates must be an integer from 1 to 1000000');
  if (!Number.isInteger(maxTotalStates) || maxTotalStates < 1 || maxTotalStates > 1000000) issues.push('maxTotalStates must be an integer from 1 to 1000000');
  if (!Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000) issues.push('maxMilliseconds must be positive and at most 60000');
  if (options.excludedKeys) {
    if (!Array.isArray(options.excludedKeys) || options.excludedKeys.length > 5000 || options.excludedKeys.some(key => typeof key !== 'string' || key.length > 256)) issues.push('Invalid excluded structure keys');
    else for (const key of options.excludedKeys) excluded.add(key);
  }
  if (issues.length) result = { status: 'invalid', issues, stats: stats() };
  function release() {
    if (search) { visitedStates += search.cancel().stats.visitedStates; search = null; }
    candidate = null;
    excluded.clear();
  }
  function cancel(): GenerationResult {
    if (!result) { release(); result = { status: 'limitReached', reason: 'cancelled', stats: stats() }; }
    return result;
  }
  return {
    cancel,
    step(maxExpansions = 64, sliceMilliseconds = 4) {
      if (result) return result;
      if (!Number.isInteger(maxExpansions) || maxExpansions < 1 || !Number.isFinite(sliceMilliseconds) || sliceMilliseconds <= 0) throw new Error('Invalid generation slice');
      const start = performance.now();
      const activeTime = () => elapsed + performance.now() - start;
      const finish = (outcome: { status: 'generated'; content: GeneratedContent } | { status: 'exhausted' } | { status: 'limitReached'; reason: 'time' | 'states' }): GenerationResult => {
        release();
        elapsed += performance.now() - start;
        result = { ...outcome, stats: stats() };
        return result;
      };
      while (true) {
        if (activeTime() >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
        if (performance.now() - start >= sliceMilliseconds) { elapsed += performance.now() - start; return null; }
        if (!search) {
          if (attempts >= maxAttempts) return finish({ status: 'exhausted' });
          if (visitedStates >= maxTotalStates) return finish({ status: 'limitReached', reason: 'states' });
          candidate = makeCandidate(seed, attempts++, config!);
          const board = initialBoard(candidate);
          if (isSolved(board, 4) || contentMetrics(candidate, 0).mixedBottles < 2) { rejected.initiallySimple++; continue; }
          const key = structureKey(candidate);
          if (excluded.has(key)) { rejected.duplicate++; continue; }
          excluded.add(key);
          const remainingTime = maxMilliseconds - activeTime();
          if (remainingTime <= 0) return finish({ status: 'limitReached', reason: 'time' });
          candidateStateBudget = Math.min(maxStates, maxTotalStates - visitedStates);
          search = createSolver(board, { capacity: 4, maxStates: candidateStateBudget, maxMilliseconds: remainingTime });
        }
        const remainingSlice = sliceMilliseconds - (performance.now() - start);
        if (remainingSlice <= 0) { elapsed += performance.now() - start; return null; }
        const solved = search.step(maxExpansions, remainingSlice);
        if (!solved) { elapsed += performance.now() - start; return null; }
        visitedStates += solved.stats.visitedStates;
        search = null;
        // Stop on time exhaustion rather than selecting a later candidate on a faster device.
        if (activeTime() >= maxMilliseconds || (solved.status === 'limitReached' && solved.reason === 'time')) return finish({ status: 'limitReached', reason: 'time' });
        if (solved.status === 'invalid') throw new Error('Generator constructed an invalid solver input');
        if (solved.status === 'limitReached') {
          if (candidateStateBudget < maxStates || visitedStates >= maxTotalStates) return finish({ status: 'limitReached', reason: 'states' });
          rejected.searchStates++;
        } else if (solved.status === 'unsolvable') rejected.unsolvable++;
        else if (solved.route.length < config!.minSolutionMoves || solved.route.length > config!.maxSolutionMoves) rejected.solutionLength++;
        else {
          const content = parseGeneratedContent({ format: 'bottle-harmony-content', version: 1,
            origin: { generator: GENERATOR_ID, seed, candidateIndex: attempts - 1, config },
            level: candidate!, structureKey: structureKey(candidate!), solution: solved.route, metrics: contentMetrics(candidate!, solved.route.length) });
          if (activeTime() >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
          return finish({ status: 'generated', content });
        }
      }
    },
  };
}

/** Node content-tool convenience wrapper; mobile callers should yield between steps. */
export function generateContent(options: GeneratorOptions): GenerationResult {
  const task = createGenerator(options);
  let result: GenerationResult | null;
  do { result = task.step(1000, 8); } while (!result);
  return result;
}
