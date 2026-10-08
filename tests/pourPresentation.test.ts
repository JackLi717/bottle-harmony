import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { VESSELS } from '../src/art/vesselDesigns.ts';
import { liquidSurface } from '../src/art/liquidGeometry.ts';
import { FLOW_END, FLOW_START, POUR_DURATION_MS, STREAM_FADE_FRACTION, transferredFraction } from '../src/art/pourGeometry.ts';
import { corkContact, finaleGlow, pourFocus, receiverResponse, ripplePose, RIPPLE_SETTLE_MS } from '../src/art/pourPresentation.ts';
import { pourAudioClip, receiverFillBand, VESSEL_AUDIO } from '../src/art/pourAudio.ts';

test('impact response settles continuously inside the existing return, and cancellation hides it', () => {
  const stop = FLOW_END + STREAM_FADE_FRACTION;
  assert.equal(receiverResponse(FLOW_START, true), 0);
  assert.equal(receiverResponse(stop, true), 1);
  assert.ok(Math.abs(receiverResponse(stop - 1e-7, true) - receiverResponse(stop + 1e-7, true)) < .001);
  assert.ok(stop + RIPPLE_SETTLE_MS / POUR_DURATION_MS < .92);
  assert.equal(receiverResponse(stop + (RIPPLE_SETTLE_MS + 1) / POUR_DURATION_MS, true), 0);
  for (let ms = 0; ms <= POUR_DURATION_MS; ms++) {
    const p = ms / POUR_DURATION_MS;
    assert.equal(receiverResponse(p, false), 0);
    assert.equal(pourFocus(p, false), 0);
    assert.equal(corkContact(p, false), 0);
    assert.equal(ripplePose(p, 0, 30, false).opacity, 0);
  }
});

test('ripples follow all fifteen actual cavities for empty, half-full and nearly full recipients', () => {
  for (const vessel of VESSELS) for (const [start, amount] of [[0, 1], [0, 4], [2, 2], [3, 1]]) {
    for (let frame = 0; frame <= 200; frame++) {
      const p = frame / 200;
      const surface = liquidSurface(start + transferredFraction(p) * amount, vessel);
      for (const ring of [0, 1, 2]) {
        const pose = ripplePose(p, ring, surface.halfWidth, true);
        assert.ok(Number.isFinite(pose.rx) && Number.isFinite(pose.ry));
        assert.ok(pose.rx >= 0 && pose.rx <= Math.max(0, surface.halfWidth - 1) + 1e-8, vessel.id);
        assert.ok(pose.opacity >= 0 && pose.opacity <= .72);
        if (p <= FLOW_START || p >= .92) assert.equal(pose.opacity, 0);
      }
    }
  }
});

test('expanded ripples remain visible during reception rather than fading into the surface highlight', () => {
  // At least one clearly expanded ring persists through the steady stream.
  // Small rings at birth and expired rings must not be the only visible ones.
  for (let ms = 100; ms <= 650; ms += 25) {
    const p = FLOW_START + ms / POUR_DURATION_MS;
    const rings = [0, 1, 2].map(ring => ripplePose(p, ring, 25, true));
    assert.ok(rings.some(pose => pose.rx >= 10 && pose.opacity >= .45), String(ms));
  }
});

test('focus, cork glint and finale glow leave no permanent overlay after their timelines', () => {
  for (const p of [0, 1, 2]) {
    assert.equal(pourFocus(p, true), 0);
    assert.equal(corkContact(p, true), 0);
    assert.equal(finaleGlow(p), 0);
  }
  assert.ok(pourFocus(.5, true) > 0);
  assert.ok(corkContact(.8, true) > 0);
  assert.ok(finaleGlow(.5) > 0 && finaleGlow(.5) <= .16);
});

test('every style maps to a recording family, with one clip for the starting fill of a multi-layer move', () => {
  assert.equal(Object.keys(VESSEL_AUDIO).length, VESSELS.length);
  assert.equal(new Set(Object.values(VESSEL_AUDIO)).size, 6);
  for (const vessel of VESSELS) {
    assert.equal(pourAudioClip(vessel.id, 0), `${VESSEL_AUDIO[vessel.id]}-low`);
    assert.equal(pourAudioClip(vessel.id, 1), `${VESSEL_AUDIO[vessel.id]}-mid`);
    assert.equal(pourAudioClip(vessel.id, 2), `${VESSEL_AUDIO[vessel.id]}-mid`);
    assert.equal(pourAudioClip(vessel.id, 3), `${VESSEL_AUDIO[vessel.id]}-high`);
  }
  assert.equal(receiverFillBand(0), 'low');
  assert.equal(pourAudioClip('tube', 0), pourAudioClip('flute', 0));
  assert.notEqual(pourAudioClip('flask', 0), pourAudioClip('coupe', 0));
});

test('all eighteen licensed recorded clips fit visible flow, have smooth ends, and match their provenance hashes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/audio/pour/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sources.length, 6);
  assert.equal(manifest.clips.length, 18);
  assert.equal(new Set(manifest.clips.map((clip: { sha256: string }) => clip.sha256)).size, 18);
  const duration = POUR_DURATION_MS / 1000 * (FLOW_END + STREAM_FADE_FRACTION - FLOW_START);
  for (const clip of manifest.clips) {
    const wav = readFileSync(new URL(`../assets/audio/pour/${clip.id}.wav`, import.meta.url));
    assert.equal(createHash('sha256').update(wav).digest('hex'), clip.sha256);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    const rate = wav.readUInt32LE(24);
    assert.ok(Math.abs((wav.length - 44) / (2 * rate) - duration) < 1 / rate);
    assert.equal(wav.readInt16LE(44), 0);
    assert.equal(wav.readInt16LE(wav.length - 2), 0);
    let peak = 0, energy = 0;
    for (let i = 44; i < wav.length; i += 2) { const v = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(v)); energy += v * v; }
    assert.ok(peak > 3000 && peak <= 23600, clip.id);
    assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) > 1000, clip.id);
    assert.ok(manifest.sources.some((source: { family: string; license: string }) => source.family === clip.sourceFamily && source.license === 'https://creativecommons.org/publicdomain/zero/1.0/'));
  }
});
