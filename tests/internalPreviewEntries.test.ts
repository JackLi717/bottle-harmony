import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { internalPreviewEntries } from '../src/ui/internalPreviewEntries.ts';
import { TestDatabase } from './helpers/sqlite.ts';

test('internal preview cards use manifest metadata without reading or evicting playable layouts', () => {
  const db = new TestDatabase('assets/levels/content.sqlite');
  const reads: string[] = [];
  const reader = {
    getAllSync<T>(sql: string, ...args: (string | number | null | Uint8Array)[]) { reads.push(sql); return db.getAllSync<T>(sql, ...args); },
    getFirstSync<T>(sql: string, ...args: (string | number | null | Uint8Array)[]) { reads.push(sql); return db.getFirstSync<T>(sql, ...args); },
  };
  try {
    const content = new ContentRepository(reader);
    const playing = content.mainline.entries[0].level;
    reads.length = 0;
    let cards = internalPreviewEntries(content.mainline.entries);
    for (let i = 0; i < 20; i++) cards = internalPreviewEntries(content.mainline.entries);
    assert.equal(reads.length, 0, 'Repeated UI selection does no synchronous SQL');
    assert.equal(cards.length, 3);
    assert.equal(cards[0].colorCount, 11);
    assert.equal(cards[1].colorCount, 10); assert.equal(cards[1].bottleCount, 12);
    assert.equal(cards[2].number, 1000);
    for (const card of cards) assert.equal(card.level.bottles.length, card.bottleCount);
    const afterCards = reads.length;
    assert.equal(content.mainline.entries[0].level, playing);
    assert.equal(reads.length, afterCards, 'Preview selection preserves the current playable layout cache');
    assert.ok(!reads.some(sql => /FROM (solution_steps|evidence)/.test(sql)));
  } finally { db.native.close(); }
});
