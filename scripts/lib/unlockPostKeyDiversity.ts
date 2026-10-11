import { parseLevel } from '../../src/game/model.ts';
import { structureKey } from '../../src/game/generation.ts';
import { canonicalBottleStrings } from '../../src/game/structure.ts';
import { postKeyCoreKey, reconstructPostKeyClassic, type PostKeyRecord } from './unlockPostKeyGeneration.ts';

export const POST_KEY_DIVERSITY_METHOD = 'post-key-structure-diversity-v1';
/** Color names and bottle order cannot turn a repeated row into a new structure. */
export function rowStructure(stacks: readonly (readonly string[])[]) {
  const colors = [...new Set(stacks.flat())];
  return canonicalBottleStrings(stacks.map(stack => stack.map(color => colors.indexOf(color))));
}
export function lowerRowStructure(record: { source: Pick<PostKeyRecord['source'], 'origin' | 'overlay'> }) {
  const board = reconstructPostKeyClassic(record.source.origin).bottles;
  return rowStructure(record.source.overlay.order.slice(5).map(index => board[index].layers));
}
export function afterKeyStructure(record: PostKeyRecord) {
  if (record.rating.status !== 'complete') throw Error('Missing complete rating');
  const stage = record.rating.evidence.stageDifficulty;
  if (stage.status !== 'rated' || !stage.witness.unlockedFrame) throw Error('Missing paired unlocked state');
  const frame = stage.witness.unlockedFrame, colors = new Map(record.puzzle.units.map(u => [u.id, u.color]));
  return structureKey(parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'after-key', capacity: 4,
    colors: record.puzzle.colors, bottles: record.puzzle.containers.map((c, i) => ({ id: c.id, layers: frame.state.contents[i].map(id => colors.get(id)!) })) }));
}
/** Batch selection only. This never changes single-puzzle acceptance or grades. */
export function postKeyDiversityIssue(candidate: PostKeyRecord, prior: readonly PostKeyRecord[]) {
  const core = postKeyCoreKey(candidate.source.origin), row = lowerRowStructure(candidate), after = afterKeyStructure(candidate);
  for (const other of prior) {
    if (postKeyCoreKey(other.source.origin) === core) return 'same-classic-core';
    if (lowerRowStructure(other) === row) return 'same-lower-row-structure';
    if (afterKeyStructure(other) === after) return 'same-after-key-structure';
  }
  return null;
}
export function auditPostKeyDiversity(records: readonly PostKeyRecord[]) {
  const reasons = records.flatMap((record, i) => {
    const issue = postKeyDiversityIssue(record, records.slice(0, i));
    return issue ? [{ index: i + 1, reason: issue }] : [];
  });
  return { method: POST_KEY_DIVERSITY_METHOD, status: reasons.length ? 'fail' : 'pass', reasons,
    roots: new Set(records.map(r => postKeyCoreKey(r.source.origin))).size,
    lowerRows: new Set(records.map(lowerRowStructure)).size,
    fillProfiles: new Set(records.map(r => `${r.source.origin.coreColors}/${r.source.origin.partition}`)).size,
    linked: records.filter(r => r.source.origin.linked).length };
}
