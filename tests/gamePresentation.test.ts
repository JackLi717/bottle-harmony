import assert from 'node:assert/strict';
import test from 'node:test';
import { finishPresentation } from '../src/ui/gamePresentation.ts';

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
