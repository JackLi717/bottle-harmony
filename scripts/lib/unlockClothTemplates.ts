import { createHash } from 'node:crypto';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import type { BoardLayout } from '../../src/ui/boardLayout.ts';
import { auditUnlockVisualTemplates } from './unlockVisualTemplates.ts';

export const CLOTH_TEMPLATE_METHOD = 'unlock-cloth-corners-v1';
export const CLOTH_KEY_GROUPS = [[4], [2, 2], [2, 1, 1], [1, 1, 1, 1]] as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Automatic pattern recognition, in addition to the shared geometry audit.
 * Key counts distinct color conditions, not physical bottom keys or route stages.
 * No preferred color, pair orientation, solution search or difficulty score. */
export function auditUnlockClothTemplates(puzzle: SortingPuzzle, options: { layout?: BoardLayout; mixedKeys?: boolean } = {}) {
  const geometry = auditUnlockVisualTemplates(puzzle, { ...options, family: 'cloth' });
  const count = puzzle.containers.length;
  const corners = [0, count / 2 - 1, count / 2, count - 1];
  const conditions = options.mixedKeys ? puzzle.triggers.filter(t => t.when.type === 'color-full') : puzzle.triggers;
  const keyCount = conditions.length;
  const groupSizes = conditions.map(t => t.unlock.length).sort((a, b) => b - a);
  const binding = { method: options.mixedKeys ? 'key-cloth-corners-v1' : CLOTH_TEMPLATE_METHOD, definitionSha256: geometry.definitionSha256,
    geometryEvidenceSha256: geometry.evidenceSha256, keyCount, groupSizes };
  const issues: { code: string; trigger?: string }[] = [...geometry.issues];
  const finish = (status: 'pass' | 'fail' | 'unsupported') => ({ ...binding, status, issues, geometry,
    evidenceSha256: hash({ binding, status, issues }) });
  if (![8, 10, 12].includes(count) || geometry.status === 'unsupported') {
    issues.push({ code: 'cloth-requires-8-10-or-12-four-portion-bottles' });
    return finish('unsupported');
  }
  const expected = corners.map(i => puzzle.containers[i].id).sort();
  const covered = options.mixedKeys ? conditions.flatMap(t => t.unlock) : puzzle.locked;
  if (JSON.stringify([...covered].sort()) !== JSON.stringify(expected)) {
    issues.push({ code: 'cloth-requires-four-row-end-covers' });
  }
  const colors = new Set<string>();
  for (const trigger of conditions) {
    if (trigger.when.type !== 'color-full' || trigger.when.count !== 4) {
      issues.push({ code: 'cloth-requires-four-portion-color-condition', trigger: trigger.id });
    } else if (colors.has(trigger.when.color)) {
      issues.push({ code: 'same-color-must-share-one-condition', trigger: trigger.id });
    } else colors.add(trigger.when.color);
  }
  if (keyCount < 1 || keyCount > 4 || JSON.stringify(groupSizes) !== JSON.stringify(CLOTH_KEY_GROUPS[keyCount - 1])) {
    issues.push({ code: 'cloth-key-groups-must-be-4-2+2-2+1+1-or-1+1+1+1' });
  }
  return finish(issues.length || geometry.status !== 'pass' ? 'fail' : 'pass');
}

/** Geometry probes only, not generated or solver-validated playable content. */
export function clothTemplateProbe(count: 8 | 10 | 12, keys: 1 | 2 | 3 | 4): SortingPuzzle {
  const corners = [0, count / 2 - 1, count / 2, count - 1];
  const colors = ['coral', 'jade', 'amber', 'azure'];
  const board = Array.from({ length: count }, () => [colors[0], colors[1], colors[2], colors[3]]);
  let offset = 0;
  return engineFixture(`cloth-template-${count}-${keys}-keys`, board, { locked: corners,
    triggers: CLOTH_KEY_GROUPS[keys - 1].map((size, i) => {
      const unlock = corners.slice(offset, offset += size).map(n => `b${n}`);
      return { id: `color-${i}`, when: { type: 'color-full', color: colors[i], count: 4 }, unlock };
    }) });
}
