import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngineSession, moveEngineSession } from '../src/game/engine.ts';
import { singleKeyTableHint } from '../src/game/unlockHints.ts';
import { extractUnlockRating, ratingComparisonSet, type RatingInput } from '../scripts/lib/unlockRatingEvidence.ts';
import { acceptSingleKey } from '../scripts/lib/unlockSingleKeyAcceptance.ts';
import { PUBLIC_DISCLOSURE_BUDGET } from '../scripts/lib/unlockPublicDisclosure.ts';
import { completeSingleKeyHints } from '../scripts/lib/unlockCompleteHints.ts';
import { postKeyOrigin, postKeyOverlays } from '../scripts/lib/unlockPostKeyGeneration.ts';

test('complete hint preparation reuses accepted disclosure, survives cache replay and rejects tampering', () => {
  const overlay = postKeyOverlays(postKeyOrigin(2, 339)).find(o => o.key === 8 && o.locked.join(',') === '0,7'); assert.ok(overlay);
  const puzzle = overlay.puzzle;
  const input: RatingInput = { puzzle, design: { role: 'challenge', family: 'test', purpose: { event: 'key', description: 'Complete hint certificate regression.' } } };
  const rating = extractUnlockRating(input, ratingComparisonSet([input]), 250000, 4000000, 5000000);
  assert.ok(rating.status === 'complete' && rating.evidence.stageDifficulty.status === 'rated');
  const acceptance = acceptSingleKey(puzzle, rating, { target: { min: 1, max: 7 } }); assert.equal(acceptance.status, 'pass');
  const entry = { number: 1, puzzle, route: rating.evidence.stageDifficulty.witness.route, acceptance };
  const output = mkdtempSync(join(tmpdir(), 'unlock-complete-hints-'));
  try {
    const first = completeSingleKeyHints(entry, PUBLIC_DISCLOSURE_BUDGET, output);
    const repeated = completeSingleKeyHints(entry, PUBLIC_DISCLOSURE_BUDGET, output);
    assert.deepEqual(repeated.table, first.table);
    assert.equal(first.check.openingAcceptanceSha256, acceptance.evidenceSha256);
    let session = createEngineSession(puzzle, 'complete-hint-cache-test');
    for (let moves = 0; session.status !== 'solved'; moves++) {
      assert.ok(moves < 100); const hint = singleKeyTableHint(session, first.table); assert.ok(hint.status === 'hint');
      const next = moveEngineSession(session, hint.action); assert.ok(next); session = next.session;
    }
    assert.throws(() => completeSingleKeyHints({ ...entry, acceptance: { ...acceptance, status: 'unknown' } }, PUBLIC_DISCLOSURE_BUDGET, output));
    const path = join(output, readdirSync(output).find(p => p.startsWith('cache-'))!);
    const cache = JSON.parse(readFileSync(path, 'utf8')); cache.exits = {}; writeFileSync(path, JSON.stringify(cache));
    assert.throws(() => completeSingleKeyHints(entry, PUBLIC_DISCLOSURE_BUDGET, output));
  } finally { rmSync(output, { recursive: true, force: true }); }
});
