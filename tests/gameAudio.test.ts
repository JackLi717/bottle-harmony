import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { ModuleKind, transpileModule } from 'typescript';

function loadAudio(os: string, configure: (mode: { playsInSilentMode: boolean; shouldPlayInBackground: boolean; interruptionMode: string; allowsRecording: boolean }) => Promise<void>) {
  const { outputText } = transpileModule(readFileSync(new URL('../src/ui/gameAudio.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  const require = (id: string) => {
    if (id === 'expo-audio') return { setAudioModeAsync: configure };
    if (id === 'react-native') return { Platform: { OS: os } };
    throw new Error(`Unexpected import: ${id}`);
  };
  runInNewContext('(function(require, module, exports) {\n' + outputText + '\n})', {})(require, module, module.exports);
  return module.exports as { prepareGameAudio: () => Promise<void> };
}

test('Android effects are permitted in silent and vibrate ringer modes; Apple keeps its silent switch', async () => {
  for (const os of ['android', 'ios', 'web']) {
    let calls = 0;
    const audio = loadAudio(os, async mode => {
      calls++;
      assert.equal(mode.playsInSilentMode, os === 'android');
      assert.equal(mode.shouldPlayInBackground, false);
      assert.equal(mode.allowsRecording, false);
      assert.equal(mode.interruptionMode, 'mixWithOthers');
    });
    const first = audio.prepareGameAudio();
    assert.equal(audio.prepareGameAudio(), first);
    await first;
    await audio.prepareGameAudio();
    assert.equal(calls, 1);
  }
});

test('a failed audio configuration can be retried by the next cue', async () => {
  let calls = 0;
  const audio = loadAudio('android', async () => {
    if (++calls === 1) throw new Error('Audio temporarily unavailable');
  });
  await assert.rejects(audio.prepareGameAudio(), /temporarily unavailable/);
  await audio.prepareGameAudio();
  assert.equal(calls, 2);
});
