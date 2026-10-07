import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeMainlineCatalog, parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import { decodePlayableMainline, encodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { createProductionPlan, validateRamp } from '../src/game/productionPlan.ts';
import { tierForHumanScore } from '../src/game/humanDifficulty.ts';
import { hasCleanStart } from '../src/game/startQuality.ts';

const json = readFileSync(new URL('../assets/levels/mainline-catalog.json', import.meta.url), 'utf8');
test('installed thousand-level catalog has verified human scores, rising difficulty, unique boards and matching compact play data', () => {
  const catalog = decodeMainlineCatalog(json), plan = createProductionPlan();
  const play = decodePlayableMainline(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));
  assert.deepEqual(play, decodePlayableMainline(encodePlayableMainline(catalog)));
  assert.equal(catalog.entries.length, 1000);
  assert.equal(new Set(catalog.entries.map(e => e.content.structureKey)).size, 1000);
  validateRamp(catalog.entries.map(e => ({ number: e.number, score: e.human.score!.total })));
  let inPreferred = 0, ordinary = 0;
  for (let i = 0; i < 1000; i++) {
    const e = catalog.entries[i], p = play.entries[i], slot = plan[i];
    assert.equal(e.number, i + 1); assert.deepEqual(p.level, e.content.level); assert.deepEqual(p.solution, e.content.solution);
    assert.equal(p.score, e.human.score!.total); assert.equal(p.tier, tierForHumanScore(p.score));
    assert.ok(e.content.solution.length <= slot.maxSolutionMoves);
    assert.ok(hasCleanStart(e.content.level));
    if (i >= 3 && slot.role !== 'challenge') {
      ordinary++;
      if (p.level.colors.length >= slot.preferredColorsMinimum! && p.level.colors.length <= slot.preferredColorsMaximum!) inPreferred++;
    }
    if (e.rating.evidence.rank === 8) assert.ok(e.rating.evidence.policies.slice(0,7).every(p => p.status === 'failed'));
  }
  assert.ok(inPreferred / ordinary > 0.9);
  assert.ok(play.entries.some(e => e.level.colors.length === 11 && e.level.bottles.length === 12));
  assert.ok(play.entries.some(e => e.level.colors.length === 10 && e.level.bottles.length === 12));
});
test('production import rejects forged scores, missing lower evidence, duplicate sources and partial catalogs', () => {
  const raw = JSON.parse(json), record = raw.records[0];
  const wrapped = { content: record.content, rating: record.rating };
  assert.throws(() => parseProductionRecords([{ ...wrapped, rating: { ...wrapped.rating, score: { ...wrapped.rating.score, total: wrapped.rating.score.total + 1 } } }]));
  const high = raw.records[999];
  assert.throws(() => parseProductionRecords([{ content: high.content, rating: { ...high.rating, evidence: { ...high.rating.evidence, policies: high.rating.evidence.policies.slice(1) } } }]));
  assert.throws(() => parseProductionRecords([wrapped, wrapped]));
  assert.throws(() => decodeMainlineCatalog(JSON.stringify({ ...raw, records: raw.records.slice(0,999) })));
  const badHuman = structuredClone(raw);
  badHuman.records[0].human.score.total++;
  assert.throws(() => decodeMainlineCatalog(JSON.stringify(badHuman)));
  const compact = JSON.parse(encodePlayableMainline(decodeMainlineCatalog(json)));
  compact.entries[0].solution[0].amount = 99;
  assert.throws(() => decodePlayableMainline(JSON.stringify(compact)));
  const badRamp = JSON.parse(encodePlayableMainline(decodeMainlineCatalog(json)));
  badRamp.entries[9].score = badRamp.entries[8].score;
  assert.throws(() => decodePlayableMainline(JSON.stringify(badRamp)));
});
test('playable import rejects a conserved opening with three matching layers in a bottle', () => {
  const compact = JSON.parse(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));
  const bottles = compact.entries[0].level.bottles;
  [bottles[0].layers[1], bottles[1].layers[2]] = [bottles[1].layers[2], bottles[0].layers[1]];
  assert.throws(() => decodePlayableMainline(JSON.stringify(compact)), /Playable slot mismatch/);
});
