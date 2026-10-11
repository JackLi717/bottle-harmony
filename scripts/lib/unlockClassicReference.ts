import { createHash } from 'node:crypto';
import { compileSortingPuzzle, initialEngineState, type EngineRuntime, type EngineState } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { evaluatePlanningDepth } from '../../src/game/difficulty.ts';
import { evaluateHumanDifficulty, HUMAN_MODEL, type HumanDifficultyReport } from '../../src/game/humanDifficulty.ts';
import { parseLevel, type LevelDefinition } from '../../src/game/model.ts';
import { isSolved } from '../../src/game/rules.ts';
import type { analyzeStageDifficulty } from './unlockStageDifficulty.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CLASSIC_REFERENCE_METHOD = 'unlock-classic-reference-v1';
type Budget = { readonly maxSolveStates: number; readonly maxWork: number; readonly maxMilliseconds: number };
export const CLASSIC_REFERENCE_BUDGET: Budget = Object.freeze({ maxSolveStates: 100000, maxWork: 1000000, maxMilliseconds: 30000 });
type Reference = {
  model: typeof HUMAN_MODEL; planningModel: 'planning-depth-v1'; goal: 'sort';
  status: 'rated' | 'unknown' | 'not-applicable' | 'unsolvable'; reason: string | null;
  level: LevelDefinition | null; definitionSha256: string | null;
  planning: ReturnType<typeof evaluatePlanningDepth> | null; human: HumanDifficultyReport | null;
};
const unavailable = (status: Reference['status'], reason: string): Reference => ({
  model: HUMAN_MODEL, planningModel: 'planning-depth-v1', goal: 'sort', status, reason,
  level: null, definitionSha256: null, planning: null, human: null,
});

/** Score only a genuinely ordinary, fully visible whole-sort task. Never pass a
 * new stage rank into the old human model, or change the old model's goal. */
export function classicFrameReference(runtime: EngineRuntime, frame: { state: EngineState; known: readonly string[] }, budget: Budget = CLASSIC_REFERENCE_BUDGET): Reference {
  const p = runtime.puzzle;
  if (p.colors.length < 2 || p.amount !== 'run' || p.goal.type !== 'sort' || p.goal.containers.length !== p.containers.length
    || p.containers.some(c => c.capacity !== 4 || !c.canSource || !c.canReceive || c.receive !== 'same' || c.protectedBottom || c.acceptColors)
    || p.colors.some(color => p.units.filter(u => u.color === color).length !== 4)
    || frame.state.open.some(open => !open) || p.units.some(u => !frame.known.includes(u.id))) {
    return unavailable('not-applicable', 'Classic scoring requires at least two colors, ordinary four-portion, fully visible whole-board sorting with every bottle available.');
  }
  const level = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: p.id, capacity: 4,
    colors: p.colors, bottles: p.containers.map((c, i) => ({ id: c.id, layers: frame.state.contents[i].map(u => runtime.unitColors.get(u)!) })) });
  const binding = { level, definitionSha256: hash(level) };
  if (isSolved(level.bottles.map(b => b.layers), 4)) return { ...unavailable('not-applicable', 'Task already complete; the original classic model requires a nonempty shortest route.'), ...binding };
  const planning = evaluatePlanningDepth(level, budget);
  if (planning.status !== 'rated' || planning.rank === null) return {
    ...unavailable(planning.status === 'unsolvable' ? 'unsolvable' : 'unknown', planning.reason ?? planning.status), ...binding, planning,
  };
  const human = evaluateHumanDifficulty(level, planning.referenceSolution, planning.rank, budget);
  return { model: HUMAN_MODEL, planningModel: 'planning-depth-v1', goal: 'sort', status: human.status,
    reason: human.reason, ...binding, planning, human };
}

/** Companion evidence is independently hashed and binds the selected stage
 * witness. Classic reference scores never select that witness or its rank. */
export function unlockClassicReferences(puzzle: SortingPuzzle, stage: ReturnType<typeof analyzeStageDifficulty> | null,
  stageEvidenceSha256: string, budget: Budget = CLASSIC_REFERENCE_BUDGET) {
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  const baseRuntime = compileSortingPuzzle({ ...puzzle, locked: [], hidden: [], triggers: [] });
  const base = classicFrameReference(baseRuntime, initialEngineState(baseRuntime), budget);
  const hasKey = puzzle.triggers.some(t => t.when.type === 'empty');
  const stages = hasKey ? [
    { phase: 'before-key', goal: 'empty-key', frameSha256: hash(initial),
      reference: unavailable('not-applicable', 'Acquiring a key is a different goal; human-decision-v1 scores complete whole-board sorting only.') },
    { phase: 'after-key', goal: 'sort',
      frameSha256: stage?.status === 'rated' ? hash(stage.witness.unlockedFrame) : null,
      reference: stage?.status === 'rated' && stage.witness.unlockedFrame
        ? classicFrameReference(runtime, stage.witness.unlockedFrame, budget)
        : unavailable('unknown', 'No certified paired unlocked frame is available.') },
  ] : [{ phase: 'ordinary', goal: 'sort', frameSha256: hash(initial), reference: classicFrameReference(runtime, initial, budget) }];
  const binding = { method: CLASSIC_REFERENCE_METHOD, definitionSha256: hash(puzzle), stageEvidenceSha256,
    model: HUMAN_MODEL, planningModel: 'planning-depth-v1', budget };
  const evidence = { base, stages };
  return { ...binding, ...evidence, evidenceSha256: hash({ binding, evidence }) };
}
