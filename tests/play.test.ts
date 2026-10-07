import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeCatalog, encodeCatalog, PLAY_TIERS } from '../src/game/catalog.ts';
import { buildCatalog } from '../src/game/catalogBuilder.ts';
import { evaluateDifficulty } from '../src/game/difficulty.ts';
import { createPlay, advancePlay, movePlay, undoPlay, resetPlay, choosePlay, RECOMMENDED_TIERS } from '../src/game/play.ts';
import { decodePlay, encodePlay } from '../src/game/playCodec.ts';
import { DEMO_LEVEL } from '../src/game/demo.ts';
import { parseLevel } from '../src/game/model.ts';
import { createProgressWriter } from '../src/storage/progressWriter.ts';

const catalogJson = readFileSync(new URL('../assets/levels/starter-catalog.json', import.meta.url), 'utf8');
const catalog = decodeCatalog(catalogJson);
const levels = [DEMO_LEVEL, ...catalog.entries.map(entry => entry.content.level)];
const tierOf = (id: string) => catalog.entries.find(entry => entry.content.level.id === id)!.difficulty.tier;
function complete(state: ReturnType<typeof createPlay>) {
  const content = catalog.entries.find(entry => entry.content.level.id === state.session.level.id)!.content;
  for (const pour of content.solution) state = movePlay(state, pour.source, pour.target, catalog)!.state;
  return state;
}

test('80-level baseline has actual four-tier quotas, globally unique verified content and recomputed ratings', () => {
  assert.equal(catalog.entries.length, 80);
  assert.equal(new Set(catalog.entries.map(entry => entry.content.structureKey)).size, 80);
  for (const tier of PLAY_TIERS) assert.equal(catalog.entries.filter(entry => entry.difficulty.tier === tier).length, 20);
  for (const entry of catalog.entries) assert.deepEqual(evaluateDifficulty(entry.content.level), entry.difficulty);
  assert.deepEqual(decodeCatalog(encodeCatalog(catalog)), catalog);
  for (const mutate of [
    (value: any) => { value.records = value.records.filter((entry: any) => entry.difficulty.tier !== 'D4'); },
    (value: any) => { value.records[0].difficulty.tier = 'D4'; },
    (value: any) => { value.records[1] = value.records[0]; },
    (value: any) => { value.records[0].content.solution[0].amount++; },
  ]) { const value = JSON.parse(catalogJson); mutate(value); assert.throws(() => decodeCatalog(JSON.stringify(value))); }
});

test('catalog builder fills actual quotas reproducibly, bounds work and preserves previous output on failure', () => {
  const built = buildCatalog({ seed: 20261007, perTier: 1 });
  assert.equal(built.status, 'built');
  assert.deepEqual(buildCatalog({ seed: 20261007, perTier: 1 }), built);
  assert.equal(buildCatalog({ seed: 20261007, perTier: 1, maxRequests: 1 }).status, 'incomplete');
  assert.equal(buildCatalog({ seed: 20261007, perTier: 1, maxWork: 1, maxRequests: 4 }).status, 'incomplete');
  const directory = mkdtempSync(join(tmpdir(), 'bottle-catalog-'));
  const output = join(directory, 'catalog.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/catalog.ts', ...args], { encoding: 'utf8' });
  try {
    writeFileSync(output, catalogJson);
    assert.notEqual(run('build', '--max-requests', '1', '--output', output).status, 0);
    assert.equal(readFileSync(output, 'utf8'), catalogJson);
    assert.equal(run('verify', '--input', output).status, 0);
    const altered = JSON.parse(catalogJson); altered.records[0].difficulty.policies[0].checkedStates++;
    writeFileSync(output, JSON.stringify(altered));
    assert.notEqual(run('verify', '--input', output).status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('fixed tiers issue every entry before repeat and skip never credits completion or increases pacing', () => {
  for (const tier of PLAY_TIERS) {
    let state = createPlay(DEMO_LEVEL);
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      state = advancePlay(state, catalog, 'skip', tier);
      assert.equal(tierOf(state.session.level.id), tier);
      assert.equal(state.repeated, false); ids.add(state.session.level.id);
      assert.equal(state.sequence, 0); assert.equal(state.completedIds.length, 0);
    }
    assert.equal(ids.size, 20);
    state = advancePlay(state, catalog, 'skip'); assert.equal(state.repeated, true);
    assert.ok(ids.has(state.session.level.id)); assert.equal(state.seenIds.length, 1);
  }
});

test('recommended play warms up, mixes tiers and relaxes after challenge; only completion advances rhythm', () => {
  let state = advancePlay(createPlay(DEMO_LEVEL), catalog, 'skip');
  assert.throws(() => advancePlay(state, catalog, 'completed'));
  for (const tier of RECOMMENDED_TIERS) {
    assert.equal(tierOf(state.session.level.id), tier);
    const skipped = advancePlay(state, catalog, 'skip'); assert.equal(skipped.sequence, state.sequence);
    state = complete(state);
    assert.ok(state.completedIds.includes(state.session.level.id));
    const undone = undoPlay(state); assert.notEqual(undone.session.status, 'solved');
    assert.deepEqual(undone.completedIds, state.completedIds);
    assert.equal(resetPlay(state).session.history.length, 0);
    state = advancePlay(state, catalog, 'completed');
  }
  assert.equal(tierOf(state.session.level.id), 'D1');
  assert.equal(state.sequence, 0);
});

test('save replay restores board, history, completion, mode and undo without animation state', () => {
  let state = advancePlay(createPlay(DEMO_LEVEL), catalog, 'skip', 'D4');
  const entry = catalog.entries.find(entry => entry.content.level.id === state.session.level.id)!;
  for (const pour of entry.content.solution) {
    state = movePlay(state, pour.source, pour.target, catalog)!.state;
    assert.deepEqual(decodePlay(encodePlay(state), levels, catalog), state);
  }
  const restored = decodePlay(encodePlay(state), levels, catalog);
  assert.equal(restored.session.status, 'solved');
  assert.deepEqual(undoPlay(restored), undoPlay(state));
  assert.deepEqual(decodePlay(encodePlay(resetPlay(state)), levels, catalog), resetPlay(state));
  const demo = choosePlay(state, DEMO_LEVEL);
  assert.deepEqual(decodePlay(encodePlay(demo), levels, catalog), demo);
});

test('save boundary rejects invalid actions, altered starting data, foreign IDs and metadata', () => {
  const state = advancePlay(createPlay(DEMO_LEVEL), catalog, 'skip', 'D2');
  const saved = encodePlay(state);
  for (const mutate of [
    (value: any) => { value.moves = [[0, 0]]; },
    (value: any) => { value.moves = [[-1, 2]]; },
    (value: any) => { value.moves = [[0, 2, 3]]; },
    (value: any) => { value.level.bottles.reverse(); },
    (value: any) => { value.completedIds = ['missing']; },
    (value: any) => { value.seenIds.push(value.seenIds[0]); },
    (value: any) => { value.sequence = RECOMMENDED_TIERS.length; },
    (value: any) => { value.mode = 'D5'; },
    (value: any) => { value.version = 2; },
    (value: any) => { value.selections = -1; },
  ]) { const value = JSON.parse(saved); mutate(value); assert.throws(() => decodePlay(JSON.stringify(value), levels, catalog)); }
  assert.throws(() => decodePlay(' '.repeat(131073), levels, catalog));
  const foreign = parseLevel({ ...state.session.level, id: 'unknown' });
  assert.throws(() => decodePlay(encodePlay(choosePlay(state, foreign)), levels, catalog));
});

test('native progress writes serialize slow saves, deduplicate successes and recover from failure', async () => {
  const values: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const write = createProgressWriter(async value => { values.push(value); if (value === 'old') await gate; if (value === 'error') throw new Error('disk'); });
  const first = write('old'), second = write('new');
  await Promise.resolve(); assert.deepEqual(values, ['old']);
  release(); assert.equal(await first, true); assert.equal(await second, true);
  assert.deepEqual(values, ['old', 'new']);
  assert.equal(await write('new'), true); assert.equal(values.length, 2);
  assert.equal(await write('error'), false); assert.equal(await write('error'), false);
  assert.equal(await write('latest'), true); assert.equal(values.at(-1), 'latest');
});
