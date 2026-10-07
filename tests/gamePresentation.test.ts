import { readFileSync } from 'node:fs';
import { decodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { createMainline } from '../src/game/mainline.ts';
import { encodeMainline } from '../src/game/mainlineCodec.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { completedPreviewSession, finishPresentation } from '../src/ui/gamePresentation.ts';

test('finish controls respect mainline, replay and final-level boundaries', () => {
  assert.equal(finishPresentation('mainline', 9).action, 'next');
  assert.equal(finishPresentation('mainline', 999).label, 'next');
  assert.equal(finishPresentation('mainline', 1000).action, 'levels');
  assert.equal(finishPresentation('mainline', 1000).label, 'replayLevels');
  for (const mode of ['replay', 'preview'] as const) {
    assert.equal(finishPresentation(mode, 9).action, 'home');
    assert.equal(finishPresentation(mode, 1000).label, 'home');
  }
});

test('celebration preview replays real legal moves into a private completed board', () => {
  const catalog = decodePlayableMainline(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));
  const pending = createMainline(catalog), before = encodeMainline(pending, catalog);
  const entry = catalog.entries.find(item => item.level.bottles.length === 8)!;
  const preview = completedPreviewSession(entry);
  assert.equal(preview.status, 'solved');
  assert.equal(preview.history.length, entry.solution.length);
  assert.equal(preview.board.length, entry.level.bottles.length);
  assert.equal(encodeMainline(pending, catalog), before);
  assert.throws(() => completedPreviewSession({ ...entry, solution: [] }), /Incomplete/);
  assert.throws(() => completedPreviewSession({ ...entry, solution: [{ ...entry.solution[0], amount: 99 }] }), /Invalid/);
});
