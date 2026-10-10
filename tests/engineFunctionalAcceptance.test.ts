import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEngineSession, moveEngineSession, resetEngineSession, saveEngineSession, undoEngineSession, visibleEngineState, type EngineSession } from '../src/game/engine.ts';
import { ENGINE_EXAMPLES } from '../src/game/engineExamples.ts';
import { ENGINE_RENDER_ROUTES } from '../src/game/engineRenderWorkload.ts';
import { containerRestraintState } from '../src/art/containerRestraintState.ts';
import { COVER_FAMILIES, coverGroups } from '../src/art/unlockPresentation.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { loadSortingSession, saveSortingSession } from '../src/storage/sortingStorage.ts';
import { TestDatabase } from './helpers/sqlite.ts';

test('all five abilities resume every route checkpoint after a real SQLite close, then undo and reset without changing player data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'harmony-functional-'));
  const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
  const path = join(directory, 'player.sqlite');
  let db = new TestDatabase(path);
  try {
    const player = await PlayerRepository.open(db, content.mainline, content.sides, 'functional-acceptance');
    await player.setPreference('language', 'zh-Hans');
    await player.setPreference('vessel', 'champagne');
    // Sorting storage must not alter the existing game's tables, including wallet and identity.
    const snapshot = () => db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sorting_%' ORDER BY name")
      .map(({ name }) => [name, db.getAllSync('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')]);
    const playerBefore = snapshot();
    for (const [index, puzzle] of ENGINE_EXAMPLES.entries()) {
      const initial = createEngineSession(puzzle, 'functional-' + index);
      let session = initial;
      let previous: EngineSession | null = null;
      const reopen = async () => {
        await saveSortingSession(db, 'functional', session, previous);
        const expected = saveEngineSession(session);
        db.native.close(); db = new TestDatabase(path);
        session = (await loadSortingSession(db, 'functional', puzzle))!;
        assert.deepEqual(saveEngineSession(session), expected, puzzle.id);
        const visible = visibleEngineState(session.runtime, session.state, session.known, session.seen);
        for (const family of COVER_FAMILIES) {
          const groups = coverGroups(puzzle, visible, null, boardLayout(visible.length).positions, family);
          assert.ok(groups.every(g => g.state !== 'opening'), 'Restoration never replays an opening');
        }
        if (index >= 3) assert.equal(containerRestraintState(visible[3]), 'receive-only');
        assert.deepEqual(snapshot(), playerBefore, 'Internal session writes preserve all player tables');
      };
      await reopen();
      for (const action of ENGINE_RENDER_ROUTES[index]) {
        previous = session;
        const result = moveEngineSession(session, action);
        assert.ok(result, puzzle.id); session = result.session;
        await reopen();
      }
      assert.equal(session.status, 'solved', puzzle.id);
      previous = session; session = undoEngineSession(session); await reopen();
      assert.equal(session.status, 'playing');
      if (index >= 3) assert.equal(moveEngineSession(session, { type: 'transfer', source: 'b3', target: 'b0' }), null);
      previous = session; session = resetEngineSession(session); await reopen();
      assert.deepEqual(session.state, initial.state);
      assert.deepEqual(session.known, initial.known);
      assert.deepEqual(session.seen, initial.seen);
      assert.equal(session.history.length, 0);
    }
  } finally {
    db.native.close(); source.native.close(); rmSync(directory, { recursive: true, force: true });
  }
});
