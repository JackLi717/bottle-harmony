import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemory, readyMemory, moveMemory, peekMemory, undoMemory, resetMemory, continueMemory } from '../src/game/memory.ts';
import { parseLevel } from '../src/game/model.ts';
import { solveBoard } from '../src/game/solver.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
async function setup() {
  const db = new TestDatabase(), player = await PlayerRepository.open(db, content.mainline, content.sides, 'test');
  const memory = await MemoryRepository.open(player, content);
  const metric = (name: string) => db.getFirstSync<{ value: number }>("SELECT SUM(value) AS value FROM level_stats WHERE mode='memory' AND metric=?", name)?.value ?? 0;
  return { db, player, memory, metric };
}

test('unassisted answer and completion summaries survive undo, restart and detail pruning without double counting', async () => {
  const { db, player, memory, metric } = await setup();
  let s = memory.start(); await memory.commit(s, 'show', {}, { observationMs: 200 });
  s = readyMemory(s); await memory.commit(s, 'ready');
  for (const p of s.puzzle.solution) { s = moveMemory(s, p.source, p.target)!.session; await memory.commit(s, 'pour', {}, { solveMs: 10, blockedMs: 20 }); }
  assert.equal(metric('attempts'), 1); assert.equal(metric('first_answers'), 1);
  assert.equal(metric('first_answer_correct'), 1); assert.equal(metric('unassisted_correct'), 1); assert.equal(metric('remembered'), 1);
  s = undoMemory(s); await memory.commit(s, 'undo');
  const p = s.puzzle.solution.at(-1)!; s = moveMemory(s, p.source, p.target)!.session; await memory.commit(s, 'pour');
  await memory.commit(s, 'pause'); await MemoryRepository.open(player, content);
  assert.equal(metric('first_answers'), 1); assert.equal(metric('remembered'), 1); assert.equal(metric('recovered'), 0);
  await player.statistics.prune(Date.now() + 31 * 86400000);
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE mode='memory'")!.n, 0);
  assert.equal(metric('first_answer_correct'), 1); assert.equal(metric('observation_ms'), 200);
  assert.equal(db.getFirstSync<{ value: number }>("SELECT SUM(value) AS value FROM daily_stats WHERE metric='memory_first_answer_correct'")!.value, 1);
  assert.ok(db.getFirstSync("SELECT value FROM metadata WHERE key='memory-black-summary-v2-since'"));
  db.native.close();
});

test('peek and executed hints exclude unassisted answers; summary writes roll back and retry once', async () => {
  const { db, player, memory, metric } = await setup();
  let s = readyMemory(memory.start()); await memory.commit(s, 'ready');
  s = peekMemory(s); await memory.commit(s, 'peek-open', {}, { peekMs: 75 });
  s = peekMemory(s); await memory.commit(s, 'peek-close');
  await memory.commit(s, 'hint-request', { requestId: 'request' });
  await memory.commit(s, 'hint-result', { requestId: 'request', result: 'solved' });
  for (const p of s.puzzle.solution.slice(0,-1)) { s = moveMemory(s,p.source,p.target,true)!.session; await memory.commit(s,'pour'); }
  const p = s.puzzle.solution.at(-1)!; s = moveMemory(s,p.source,p.target,true)!.session;
  db.fail = sql => sql.startsWith('INSERT INTO events');
  assert.equal(await memory.commit(s,'pour'), false); assert.equal(metric('first_answers'), 0); assert.equal(metric('remembered'), 0);
  db.fail = null; assert.equal(await player.flush(), true);
  assert.equal(metric('first_answers'), 1); assert.equal(metric('remembered'), 1); assert.equal(metric('unassisted_answers'), 0);
  assert.equal(metric('peeks'), 1); assert.equal(metric('hint_requests'), 1); assert.equal(metric('hint_solved'), 1);
  assert.equal(db.getFirstSync<{ value: number }>("SELECT SUM(value) AS value FROM daily_stats WHERE metric='memory_first_answers'")!.value, 1);
  db.native.close();
});

test('wrong first answer, revealed recovery and reset remain distinct durable facts', async () => {
  const { db, memory, metric } = await setup();
  const puzzle = { number: 1, skill: 'test', masks: [1,3], solution: [], level: parseLevel({ format:'bottle-harmony',version:1,rules:'water-sort',id:'stats-wrong',capacity:4,colors:['jade','coral'],bottles:[['jade','jade','coral','coral'],['coral','coral','jade','jade'],[],[]].map((layers,i)=>({id:`b${i}`,layers})) }) };
  let s = readyMemory(createMemory(puzzle)); await memory.commit(s,'ready');
  for(const [a,b] of [[0,2],[1,2],[0,1],[0,1],[0,2]]) { s=moveMemory(s,a,b)!.session; await memory.commit(s,'pour'); }
  assert.equal(s.judgement,'wrong'); assert.equal(metric('first_answer_wrong'),1); assert.equal(metric('unassisted_answers'),1); assert.equal(metric('unassisted_correct'),0);
  const result=solveBoard(s.game.board); assert.equal(result.status,'solved'); if(result.status!=='solved')return;
  s=continueMemory(s,result.route); await memory.commit(s,'continue-after-reveal');
  for(const p of result.route) { s=moveMemory(s,p.source,p.target)!.session; await memory.commit(s,'pour'); }
  assert.equal(metric('recovered'),1); assert.equal(metric('remembered'),0); assert.equal(metric('first_answers'),1);
  s=resetMemory(s); await memory.commit(s,'reset'); assert.equal(metric('attempts'),2); assert.equal(metric('resets'),1);
  assert.equal(db.getFirstSync<{ n:number }>("SELECT COUNT(*) AS n FROM completions WHERE mode='main'")!.n,0);
  db.native.close();
});

test('resumed attempts retain their observation boundary and mark partial answers', async () => {
  const { db, player, memory, metric } = await setup();
  const boundary = db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='memory-black-summary-v2-since'")!.value;
  let s = readyMemory(memory.start());
  await memory.commit(s, 'ready');
  const loaded = await MemoryRepository.open(player, content);
  s = loaded.start();
  for (const p of s.puzzle.solution) {
    s = moveMemory(s, p.source, p.target)!.session;
    await loaded.commit(s, 'pour');
  }
  assert.equal(metric('attempts'), 1);
  assert.equal(metric('first_answer_correct'), 1);
  assert.equal(metric('partial_answers'), 1);
  assert.equal(metric('unassisted_answers'), 0);
  assert.equal(db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='memory-black-summary-v2-since'")!.value, boundary);
  db.native.close();
});
