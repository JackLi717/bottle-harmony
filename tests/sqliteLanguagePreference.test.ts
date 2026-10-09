import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { moveMainline } from '../src/game/mainline.ts';
import { TestDatabase } from './helpers/sqlite.ts';

test('language persists through reopening and failed writes retry without resetting play or preferences', async () => {
  const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
  const db = new TestDatabase();
  const open = () => PlayerRepository.open(db, content.mainline, content.sides, 'test');
  try {
    const player = await open();
    assert.equal(player.preference('language'), 'system');
    const first = content.mainline.entries[0].solution[0];
    await player.commit(moveMainline(player.state, first.source, first.target)!.state, { type: 'pour' });
    await player.setPreference('sound', 'false');
    await player.setPreference('language', 'zh-Hant');
    const state = player.state, installation = player.installation;
    let restored = await open();
    assert.equal(restored.preference('language'), 'zh-Hant');
    assert.deepEqual(restored.state, state); assert.equal(restored.installation, installation);
    db.fail = sql => sql.startsWith('INSERT INTO events');
    assert.equal(await restored.setPreference('language', 'ar'), false);
    assert.equal(restored.preference('language'), 'zh-Hant');
    db.fail = null;
    assert.equal(await restored.flush(), true);
    restored = await open();
    assert.equal(restored.preference('language'), 'ar');
    assert.equal(restored.preference('sound'), 'false'); assert.deepEqual(restored.state, state);
    await restored.setPreference('language', 'system');
    assert.equal((await open()).preference('language'), 'system');
  } finally { db.native.close(); source.native.close(); }
});
