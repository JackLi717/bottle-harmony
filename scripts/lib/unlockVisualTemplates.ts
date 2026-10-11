import { createHash } from 'node:crypto';
import { compileSortingPuzzle, initialEngineState, visibleEngineState } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { COVER_TEMPLATE_GEOMETRY, defaultCoverFamily, coverFamilyForConditions, coverGroups, type CoverFamily, type CoverGroup } from '../../src/art/unlockPresentation.ts';
import { LIQUIDS } from '../../src/art/palette.ts';
import { boardLayout, type BoardLayout } from '../../src/ui/boardLayout.ts';

export const VISUAL_TEMPLATE_METHOD = 'unlock-fixed-templates-v1';
export const VISUAL_TEMPLATE_TOLERANCE = 0.000001; // Logical board units, only floating-point roundoff.
type Template = 'cloth' | 'single-box' | 'double-box' | 'triple-box';
type Issue = { code: string; trigger?: string };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= VISUAL_TEMPLATE_TOLERANCE;
const box = (g: CoverGroup) => ({ x: g.x, y: g.y, width: g.width, height: g.height, centers: g.centers });

/** Binary conformance to the actual shared resting layout and cover projection.
 * No solver, hidden inventory, beauty score or per-puzzle template declaration.
 * Opening/relock probes are public projection checks, not gameplay/fairness proof. */
export function auditUnlockVisualTemplates(puzzle: SortingPuzzle, options: { layout?: BoardLayout; family?: CoverFamily } = {}) {
  const runtime = compileSortingPuzzle(puzzle), count = puzzle.containers.length;
  const family = options.family ?? defaultCoverFamily(puzzle);
  const layout = options.layout ?? (count >= 4 && count <= 12 ? boardLayout(count) : null);
  const binding = { method: VISUAL_TEMPLATE_METHOD, definitionSha256: hash(puzzle), family, layout,
    geometry: COVER_TEMPLATE_GEOMETRY, tolerance: VISUAL_TEMPLATE_TOLERANCE };
  const groups: { template: Template; trigger: string; containers: string[]; box: ReturnType<typeof box> }[] = [];
  const issues: Issue[] = [];
  const finish = (status: 'pass' | 'fail' | 'unsupported' | 'not-applicable') => ({ ...binding, status, groups, issues,
    evidenceSha256: hash({ binding, status, groups, issues }) });
  if (!layout || count < 4 || count > 12 || puzzle.containers.some(c => c.capacity !== 4)) {
    issues.push({ code: 'requires-4-to-12-four-portion-bottles' }); return finish('unsupported');
  }
  const canonical = boardLayout(count);
  if (!close(layout.width, canonical.width) || !close(layout.height, canonical.height) || !close(layout.slotWidth, canonical.slotWidth)
    || layout.positions.length !== count || layout.positions.some((p, i) => !close(p.x, canonical.positions[i].x) || !close(p.y, canonical.positions[i].y))) {
    issues.push({ code: 'not-fixed-two-row-layout' }); return finish('fail');
  }
  if (!puzzle.locked.length) return finish('not-applicable');
  for (const id of puzzle.locked) {
    if (puzzle.triggers.filter(t => t.unlock.includes(id)).length !== 1) issues.push({ code: 'requires-one-condition-per-covered-bottle' });
  }
  if (issues.length) return finish('fail');
  const initial = initialEngineState(runtime), visible = visibleEngineState(runtime, initial.state, initial.known);
  const closed = coverGroups(puzzle, visible, null, layout.positions, family), geometry = COVER_TEMPLATE_GEOMETRY;
  for (const trigger of puzzle.triggers) {
    const indices = trigger.unlock.map(id => runtime.containerIndex.get(id)!).sort((a, b) => a - b);
    const cloth = coverFamilyForConditions(family, [trigger]) === 'cloth';
    if (trigger.when.type === 'color-full' && !Object.hasOwn(LIQUIDS, trigger.when.color)) {
      issues.push({ code: 'condition-mark-not-supported', trigger: trigger.id }); continue;
    }
    if (!cloth && (indices.length > 3 || indices.some((i, n) => n && (i !== indices[n - 1] + 1 || layout.positions[i].y !== layout.positions[indices[0]].y)))) {
      issues.push({ code: 'box-requires-1-to-3-consecutive-bottles-in-one-row', trigger: trigger.id }); continue;
    }
    const expected = cloth ? indices.map(i => [i]) : [indices];
    const actual = closed.filter(g => g.conditions.some(t => t.id === trigger.id));
    if (actual.length !== expected.length || actual.some((g, n) => g.conditions.length !== 1 || g.conditions[0].id !== trigger.id
      || g.state !== 'closed' || JSON.stringify(g.indices) !== JSON.stringify(expected[n]))) {
      issues.push({ code: 'cover-group-does-not-match-mapping', trigger: trigger.id }); continue;
    }
    for (const g of actual) {
      const first = layout.positions[g.indices[0]], last = layout.positions[g.indices.at(-1)!];
      const x = first.x + geometry.insetX, y = first.y + geometry.insetY, width = last.x - first.x + geometry.width;
      if (!close(g.x, x) || !close(g.y, y) || !close(g.width, width) || !close(g.height, geometry.height)
        || g.centers.length !== g.indices.length || g.centers.some((center, n) => !close(center, layout.positions[g.indices[n]].x + 50 - x))) {
        issues.push({ code: 'cover-geometry-does-not-match-template', trigger: trigger.id }); continue;
      }
      if (g.x < -VISUAL_TEMPLATE_TOLERANCE || g.y < 0 || g.x + g.width > layout.width + VISUAL_TEMPLATE_TOLERANCE
        || g.y + g.height > layout.height || layout.positions.some((p, i) => !g.indices.includes(i)
          && g.x < p.x + 79 && g.x + g.width > p.x + 21 && g.y < p.y + 174 && g.y + g.height > p.y + 16)) {
        issues.push({ code: 'cover-outside-board-or-overlapping-other-bottle', trigger: trigger.id }); continue;
      }
      const template: Template = cloth ? 'cloth' : (['single-box', 'double-box', 'triple-box'] as const)[g.indices.length - 1];
      groups.push({ template, trigger: trigger.id, containers: g.indices.map(i => puzzle.containers[i].id), box: box(g) });
    }
  }
  // Probe each group independently: other locked groups must stay in place.
  for (const trigger of puzzle.triggers) {
    const targets = new Set(trigger.unlock);
    const opened = visible.map(c => targets.has(c.id) ? { ...c, locked: false, count: 0, colors: [] } : c);
    const opening = coverGroups(puzzle, opened, visible, layout.positions, family);
    if (JSON.stringify(opening.map(g => ({ ...g, state: 'closed' }))) !== JSON.stringify(closed)
      || opening.some(g => g.state !== (g.conditions.some(t => t.id === trigger.id) ? 'opening' : 'closed'))
      || coverGroups(puzzle, opened, null, layout.positions, family).some(g => g.indices.some(i => targets.has(puzzle.containers[i].id)))) {
      issues.push({ code: 'opening-moves-or-retains-cover', trigger: trigger.id });
    }
    const seen = visible.map(c => targets.has(c.id) ? { ...c, count: 0, colors: [] } : c);
    const relocked = coverGroups(puzzle, seen, null, layout.positions, family).filter(g => g.conditions.some(t => t.id === trigger.id));
    if (relocked.length !== targets.size || relocked.some(g => g.state !== 'relocked' || g.indices.length !== 1
      || !close(g.width, geometry.width) || !close(g.height, geometry.height))) issues.push({ code: 'seen-relock-must-use-individual-open-restraints', trigger: trigger.id });
  }
  return finish(issues.length ? 'fail' : 'pass');
}
