import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { transpileModule, ModuleKind } from 'typescript';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { moveMainline } from '../src/game/mainline.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const require = createRequire(import.meta.url);
const { renderToString } = require('react-dom/server') as { renderToString: (element: ReturnType<typeof createElement>) => string };
type ClassicHook = typeof import('../src/ui/usePlayProgress.ts').usePlayProgress;
type MemoryHook = typeof import('../src/ui/useMemoryProgress.ts').useMemoryProgress;

// Render the real hooks with React. Only native AppState and the storage singleton
// are replaced; SQLite, repositories, clocks and hook initialization remain real.
function hooks(player: PlayerRepository, memory: MemoryRepository) {
  function load(name: string) {
    const path = resolve(process.env.TUTORIAL_HOOK_ROOT ?? '.', 'src/ui', `${name}.ts`);
    const localRequire = createRequire(path), module = { exports: {} };
    const { outputText } = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } });
    const nativeRequire = (id: string) => id === 'react-native' ? { AppState: { currentState: 'active' } }
      : id === '../storage/runtime' ? { getPlayer: () => player, getMemory: () => memory }
      : localRequire(id.startsWith('.') && !id.endsWith('.ts') ? `${id}.ts` : id);
    runInNewContext('(function(require, module, exports) {\n' + outputText + '\n})', { performance, setInterval, clearInterval })(nativeRequire, module, module.exports);
    return module.exports;
  }
  return { classic: (load('usePlayProgress') as { usePlayProgress: ClassicHook }).usePlayProgress,
    memory: (load('useMemoryProgress') as { useMemoryProgress: MemoryHook }).useMemoryProgress };
}
function renderHook<T>(hook: () => T): T {
  let value: T;
  function Capture() { value = hook(); return null; }
  renderToString(createElement(Capture));
  return value!;
}

test('tutorial hooks honor independent SQLite confirmations across remounts and cold launches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bottle-tutorial-'));
  const source = new TestDatabase('assets/levels/content.sqlite');
  const content = new ContentRepository(source), path = join(dir, 'player.sqlite');
  let db = new TestDatabase(path);
  const open = async () => {
    const player = await PlayerRepository.open(db, content.mainline, content.sides, 'tutorial-regression');
    return { player, memory: await MemoryRepository.open(player, content) };
  };
  try {
    let { player, memory } = await open();
    let ui = hooks(player, memory);
    assert.equal(renderHook(ui.classic).play.tutorialDone, false);
    assert.equal(renderHook(ui.memory).tutorial, true);

    // Use the classic Start callback's real hook write, then immediately recreate
    // the screen. Confirming classic must not suppress the first memory tutorial.
    const classic = renderHook(ui.classic), initial = player.state;
    classic.setPlay(Object.freeze({ ...classic.play, tutorialDone: true }));
    assert.equal(await player.flush(), true);
    assert.equal(renderHook(ui.classic).play.tutorialDone, true);
    assert.equal(player.state.main, initial.main);
    assert.equal(player.state.hintCredits, initial.hintCredits);
    assert.equal(renderHook(ui.memory).tutorial, true);

    const installation = player.installation;
    await player.setPreference('sound', 'false');
    await player.setPreference('vessel', 'champagne');
    const step = content.mainline.entries[0].solution[0];
    await player.commit(moveMainline(player.state, step.source, step.target)!.state, { type: 'pour' });
    db.native.close(); db = new TestDatabase(path);
    ({ player, memory } = await open()); ui = hooks(player, memory);
    assert.equal(renderHook(ui.classic).play.tutorialDone, true);
    assert.equal(renderHook(ui.memory).tutorial, true);

    renderHook(ui.memory).finishTutorial();
    assert.equal(await player.flush(), true);
    assert.equal(renderHook(ui.memory).tutorial, false);
    const savedMain = player.state, savedMemory = memory.state;
    for (let launch = 0; launch < 2; launch++) {
      db.native.close(); db = new TestDatabase(path);
      ({ player, memory } = await open()); ui = hooks(player, memory);
      assert.deepEqual(renderHook(ui.classic).play, savedMain);
      assert.equal(renderHook(ui.memory).tutorial, false);
      // Restoration includes the optional checkpoint input; compare its default
      // explicitly while retaining the real game.historyOffset comparison.
      assert.deepEqual({ ...memory.state, offset: 0 }, { ...savedMemory, offset: 0 });
      assert.equal(player.installation, installation);
      assert.equal(player.preference('sound'), 'false');
      assert.equal(player.preference('vessel'), 'champagne');
    }
  } finally { db.native.close(); source.native.close(); rmSync(dir, { recursive: true, force: true }); }
});
