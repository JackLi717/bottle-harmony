import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeMainlineCatalog, parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import { decodePlayableMainline, encodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { createProductionPlan, validateRamp } from '../src/game/productionPlan.ts';
import { tierForHumanScore } from '../src/game/humanDifficulty.ts';
import { hasCleanStart, hasVariedStart, measureStartVariety } from '../src/game/startQuality.ts';

const json = readFileSync(new URL('../assets/levels/mainline-catalog.json', import.meta.url), 'utf8');
test('installed thousand-level catalog has rising summits, recovery, unique boards, internal tags and matching compact data', () => {
  const catalog = decodeMainlineCatalog(json), plan = createProductionPlan();
  const play = decodePlayableMainline(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8'));
  assert.deepEqual(play, decodePlayableMainline(encodePlayableMainline(catalog)));
  assert.equal(catalog.id, 'mainline-1000-v5');
  assert.equal(catalog.entries.length, 1000);
  assert.equal(new Set(catalog.entries.map(e => e.content.structureKey)).size, 1000);
  validateRamp(catalog.entries.map(e => ({ number: e.number, score: e.human.score!.total })));
  let inPreferred = 0, ordinary = 0;
  let first43Filled = 0, first43BottomPairs = 0, first43FourColors = 0, first43RepeatedBottomColors = 0;
  for (let i = 0; i < 1000; i++) {
    const e = catalog.entries[i], p = play.entries[i], slot = plan[i];
    assert.equal(e.number, i + 1); assert.deepEqual(p.level, e.content.level); assert.deepEqual(p.solution, e.content.solution);
    assert.equal(p.score, e.human.score!.total); assert.equal(p.tier, tierForHumanScore(p.score));
    assert.equal(e.design!.cycle, slot.cycle); assert.equal(e.design!.position, slot.cyclePosition);
    assert.equal(e.design!.role, slot.waveRole);
    assert.notEqual(e.design!.primary, 'incomplete-observation');
    assert.ok(e.content.solution.length <= slot.maxSolutionMoves);
    assert.ok(hasCleanStart(e.content.level));
    assert.ok(hasVariedStart(e.content.level));
    if (i < 43) {
      const variety = measureStartVariety(e.content.level);
      first43Filled += variety.filled;
      first43BottomPairs += variety.bottomPairs;
      first43FourColors += variety.fourColors;
      const filled = e.content.level.bottles.filter(bottle => bottle.layers.length);
      if (new Set(filled.map(bottle => bottle.layers[0])).size < filled.length) first43RepeatedBottomColors++;
    }
    if (i >= 3 && slot.role !== 'challenge') {
      ordinary++;
      if (p.level.colors.length >= slot.preferredColorsMinimum! && p.level.colors.length <= slot.preferredColorsMaximum!) inPreferred++;
    }
    if (e.rating.evidence.rank === 8) assert.ok(e.rating.evidence.policies.slice(0,7).every(p => p.status === 'failed'));
  }
  assert.ok(inPreferred / ordinary > 0.9);
  assert.ok(first43BottomPairs / first43Filled < 0.2);
  assert.ok(first43FourColors >= 80);
  assert.ok(first43RepeatedBottomColors >= 8);
  assert.ok(catalog.entries.every(entry => entry.content.origin.generator !== 'layered-shuffle-v1'));
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
  const staleDesign = structuredClone(raw); staleDesign.records[20].design.role = 'peak';
  assert.throws(() => decodeMainlineCatalog(JSON.stringify(staleDesign)), /Invalid level design/);
  assert.throws(() => decodeMainlineCatalog(JSON.stringify({ ...raw, plan: 'thousand-ramp-v1' })), /Invalid mainline catalog/);
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
