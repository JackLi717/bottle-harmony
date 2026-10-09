import { createMemory, hiddenMemory, moveMemory, readyMemory, type MemoryPuzzle, type MemorySession } from '../game/memory.ts';
import { createSession, moveSession, type GameSession } from '../game/session.ts';
import type { LevelDefinition } from '../game/model.ts';
import type { Board, Pour } from '../game/rules.ts';
import { memoryDisplay, newlyRevealedMemory } from './memoryPresentation.ts';

export type TutorialContent = { level: LevelDefinition; solution: readonly Pour[]; memory?: MemoryPuzzle };
export type TutorialPicture = {
  board: Board; hidden: readonly (readonly boolean[])[]; marked: readonly (readonly boolean[])[];
  reveals: readonly (readonly boolean[])[];
};
export type TutorialBeat = {
  kind: 'observe' | 'ready' | 'readyTap' | 'hide' | 'source' | 'sourceTap' | 'target' | 'targetTap' | 'pour' | 'settle' | 'reveal' | 'win' | 'done';
  duration: number; picture: TutorialPicture; resting: TutorialPicture;
  selected: number | null; hand: number | 'ready' | null; pour?: Pour; hiddenPour?: boolean;
};

function picture(game: GameSession, memory?: MemorySession, revealing: readonly number[] = []): TutorialPicture {
  if (memory) {
    const display = memoryDisplay(memory, null, revealing);
    return { ...display, marked: memory.phase === 'observe' ? memory.units.map(b => b.map(id => memory.revealed[id] < 0)) : [] };
  }
  return { board: game.board, hidden: [], marked: [], reveals: [] };
}

/** Replay the packaged first level in private core sessions. No player repository, wallet or clock is involved. */
export function tutorialDemonstration(content: TutorialContent): readonly TutorialBeat[] {
  let memory = content.memory ? createMemory(content.memory) : undefined;
  let game = memory?.game ?? createSession(content.level);
  let view = picture(game, memory);
  const beats: TutorialBeat[] = [];
  function add(kind: TutorialBeat['kind'], duration: number, hand: TutorialBeat['hand'] = null, selected: number | null = null,
    extra: Partial<TutorialBeat> = {}) {
    beats.push({ kind, duration, picture: view, resting: view, hand, selected, ...extra });
  }
  add('observe', memory ? 3600 : 800);
  if (memory) {
    add('ready', 600, 'ready'); add('readyTap', 400, 'ready');
    memory = readyMemory(memory); game = memory.game; view = picture(game, memory);
    add('hide', 1100);
  }
  for (const expected of content.solution) {
    add('source', 500, expected.source);
    add('sourceTap', 320, expected.source, expected.source);
    add('target', 550, expected.target, expected.source);
    add('targetTap', 320, expected.target, expected.source);
    const before = game, beforeMemory = memory;
    const accepted = memory ? moveMemory(memory, expected.source, expected.target) : moveSession(game, expected.source, expected.target);
    if (!accepted || accepted.event.pour.amount !== expected.amount || accepted.event.pour.color !== expected.color) throw new Error('Invalid tutorial route');
    memory = beforeMemory ? accepted.session as MemorySession : undefined;
    game = memory?.game ?? accepted.session as GameSession;
    const revealed = beforeMemory && memory ? newlyRevealedMemory(beforeMemory, memory) : [];
    const resting = picture(game, memory);
    const pouring: TutorialPicture = beforeMemory && memory
      ? { ...memoryDisplay(memory, { before: beforeMemory, pour: expected }), marked: [] }
      : { board: before.board.map((b, i) => i === expected.target ? [...b, ...Array<string>(expected.amount).fill(expected.color)] : b), hidden: [], marked: [], reveals: [] };
    add('pour', 1900, null, null, { picture: pouring, resting, pour: expected,
      hiddenPour: beforeMemory ? hiddenMemory(beforeMemory)[expected.source].at(-1) : false });
    view = picture(game, memory, revealed);
    if (revealed.length) add('reveal', 380, null, null, { resting });
    view = resting;
    add('settle', 400);
  }
  if (game.status !== 'solved' || memory && memory.judgement !== 'correct') throw new Error('Incomplete tutorial route');
  add('settle', 900); add('win', 0); add('done', 0);
  return beats;
}
