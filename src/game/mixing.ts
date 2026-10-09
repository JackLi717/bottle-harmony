/** Discrete recipe rules. Artwork, RGB values, persistence and animation never decide success. */
export const MIXING_RULES = 'mixing-pairs-v1';
export const MIXING_HISTORY = 256;
export type RawColor = 'coral' | 'amber' | 'indigo' | 'silver';
export type MixColor = RawColor | 'labOrange' | 'labGreen' | 'labPurple' | 'labPink' | 'labSky' | 'labCream';
export const RECIPES: Readonly<Record<MixColor, readonly [RawColor, RawColor]>> = {
  coral: ['coral', 'coral'], amber: ['amber', 'amber'], indigo: ['indigo', 'indigo'], silver: ['silver', 'silver'],
  labOrange: ['coral', 'amber'], labGreen: ['amber', 'indigo'], labPurple: ['coral', 'indigo'],
  labPink: ['coral', 'silver'], labSky: ['indigo', 'silver'], labCream: ['amber', 'silver'],
};
export type MixingPuzzle = { id: string; number: number; artwork: 'rainbow' | 'flower'; bottles: readonly (readonly RawColor[])[]; goals: readonly MixColor[] };
export type MixUnit = { atom: number; color: MixColor; batch: number | null };
export type Delivery = { goal: number; units: readonly MixUnit[] };
export type MixingFrame = { bottles: readonly (readonly MixUnit[])[]; mixer: readonly MixUnit[]; deliveries: readonly Delivery[]; active: number };
export type MixingSession = { puzzle: MixingPuzzle; frame: MixingFrame; history: readonly MixingFrame[]; offset: number };
/** The mixer has index bottles.length. Goal choice accompanies a pour, not a separate undo action. */
export type MixingAction = { source: number; target: number; goal: number };
export function mixedColor(a: RawColor, b: RawColor): MixColor {
  return (Object.keys(RECIPES) as MixColor[]).find(color => {
    const pair = RECIPES[color]; return pair[0] === a && pair[1] === b || pair[1] === a && pair[0] === b;
  })!;
}
export function createMixing(puzzle: MixingPuzzle): MixingSession {
  let atom = 0;
  const frame: MixingFrame = { bottles: puzzle.bottles.map(b => b.map(color => ({ atom: atom++, color, batch: null }))), mixer: [], deliveries: [], active: 0 };
  validateMixingFrame(puzzle, frame);
  return { puzzle, frame, history: [], offset: 0 };
}
export function mixingComplete(frame: MixingFrame, puzzle: MixingPuzzle) { return frame.deliveries.length === puzzle.goals.length; }
export function selectMixingGoal(session: MixingSession, active: number): MixingSession {
  if (session.frame.mixer.length || !Number.isInteger(active) || !session.puzzle.goals[active] || session.frame.deliveries.some(d => d.goal === active)) return session;
  return { ...session, frame: { ...session.frame, active } };
}
export function applyMixing(puzzle: MixingPuzzle, before: MixingFrame, action: MixingAction): MixingFrame | null {
  const n = before.bottles.length;
  if (![action.source, action.target, action.goal].every(Number.isInteger) || action.source < 0 || action.target < 0 || action.source > n || action.target > n || action.source === action.target || mixingComplete(before, puzzle)) return null;
  if (!puzzle.goals[action.goal] || before.deliveries.some(d => d.goal === action.goal) || before.mixer.length && action.goal !== before.active) return null;
  const containers = [...before.bottles, before.mixer];
  const from = containers[action.source], to = containers[action.target], top = from.at(-1);
  if (!top || to.length >= (action.target === n ? 2 : 4)) return null;
  let amount = 1;
  if (action.target === n) {
    // Generated pigments are terminal in this first recipe set, even after returning to a source bottle.
    if (top.batch !== null || before.mixer.some(u => u.batch !== null) || !(['coral', 'amber', 'indigo', 'silver'] as string[]).includes(top.color)) return null;
  } else {
    if (to.length && to.at(-1)!.color !== top.color) return null;
    while (amount < from.length && from[from.length - amount - 1].color === top.color) amount++;
    amount = Math.min(amount, 4 - to.length);
  }
  const bottles = before.bottles.map(b => [...b]);
  let mixer = [...before.mixer], deliveries = [...before.deliveries];
  const moved = from.slice(-amount);
  if (action.source === n) mixer = mixer.slice(0, -amount); else bottles[action.source] = bottles[action.source].slice(0, -amount);
  if (action.target === n) mixer.push(...moved); else bottles[action.target].push(...moved);
  if (action.target === n && mixer.length === 2) {
    const color = mixedColor(mixer[0].color as RawColor, mixer[1].color as RawColor);
    const batch = color === mixer[0].color && color === mixer[1].color ? null : Math.min(...mixer.map(u => u.atom));
    mixer = mixer.map(u => ({ ...u, color, batch }));
    if (color === puzzle.goals[action.goal]) { deliveries.push({ goal: action.goal, units: mixer }); mixer = []; }
  }
  const active = deliveries.some(d => d.goal === action.goal) ? puzzle.goals.findIndex((_, i) => !deliveries.some(d => d.goal === i)) : action.goal;
  return { bottles, mixer, deliveries, active };
}
export function moveMixing(session: MixingSession, source: number, target: number): MixingSession {
  const frame = applyMixing(session.puzzle, session.frame, { source, target, goal: session.frame.active });
  return frame ? { ...session, frame, history: [...session.history, session.frame].slice(-MIXING_HISTORY), offset: session.offset + Number(session.history.length === MIXING_HISTORY) } : session;
}
export function undoMixing(session: MixingSession): MixingSession {
  return session.history.length ? { ...session, frame: session.history.at(-1)!, history: session.history.slice(0, -1) } : session;
}
export function validateMixingFrame(puzzle: MixingPuzzle, frame: MixingFrame) {
  const raw = puzzle.bottles.flat(), units = [...frame.bottles.flat(), ...frame.mixer, ...frame.deliveries.flatMap(d => d.units)];
  const fail = () => { throw new Error('Invalid mixing state or material conservation'); };
  if (frame.bottles.length !== puzzle.bottles.length || frame.bottles.some(b => b.length > 4) || frame.mixer.length > 2 || units.length !== raw.length || new Set(units.map(u => u.atom)).size !== raw.length) fail();
  if (frame.deliveries.some((d, i) => !Number.isInteger(d.goal) || !puzzle.goals[d.goal] || d.units.length !== 2 || d.units.some(u => u.color !== puzzle.goals[d.goal]) || frame.deliveries.slice(0, i).some(p => p.goal === d.goal))) fail();
  const pending = puzzle.goals.map((_, i) => i).filter(i => !frame.deliveries.some(d => d.goal === i));
  if (!Number.isInteger(frame.active) || (pending.length ? !pending.includes(frame.active) : frame.active !== -1)) fail();
  for (const u of units) {
    if (!Number.isInteger(u.atom) || !raw[u.atom] || !RECIPES[u.color]) fail();
    if (u.batch === null) { if (u.color !== raw[u.atom]) fail(); }
    else {
      const group = units.filter(v => v.batch === u.batch);
      if (group.length !== 2 || u.batch !== Math.min(...group.map(v => v.atom)) || group.some(v => v.color !== u.color) || mixedColor(raw[group[0].atom], raw[group[1].atom]) !== u.color) fail();
    }
  }
  if (frame.mixer.length === 2 && (frame.mixer[0].color !== frame.mixer[1].color || frame.mixer[0].color === puzzle.goals[frame.active])) fail();
}
function frameKey(frame: MixingFrame, ignoreChoice = false) {
  return JSON.stringify({ ...frame, active: ignoreChoice && !frame.mixer.length ? null : frame.active });
}
export function restoreMixing(puzzle: MixingPuzzle, frame: MixingFrame, history: readonly MixingFrame[], offset = 0): MixingSession {
  if (history.length > MIXING_HISTORY || !Number.isInteger(offset) || offset < 0) throw new Error('Excessive mixing history');
  const frames = [...history, frame]; frames.forEach(f => validateMixingFrame(puzzle, f));
  if (offset === 0 && frameKey(frames[0], true) !== frameKey(createMixing(puzzle).frame, true)) throw new Error('Invalid mixing initial checkpoint');
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1], after = frames[i]; let valid = false;
    for (let goal = 0; goal < puzzle.goals.length && !valid; goal++) for (let source = 0; source <= puzzle.bottles.length && !valid; source++) for (let target = 0; target <= puzzle.bottles.length && !valid; target++) {
      const next = applyMixing(puzzle, before, { source, target, goal });
      if (next && frameKey(next, true) === frameKey(after, true)) valid = true;
    }
    if (!valid) throw new Error('Invalid mixing undo transition');
  }
  return { puzzle, frame, history, offset };
}
/** Offline bounded BFS. Budget exhaustion is unknown, never a claim of impossibility. */
export function solveMixing(puzzle: MixingPuzzle, limit = 100000): { status: 'solved' | 'unknown' | 'unsolvable'; route: MixingAction[]; visited: number } {
  const initial = createMixing(puzzle).frame;
  const key = (f: MixingFrame) => JSON.stringify([f.bottles.map(b => b.map(u => u.color)), f.mixer.map(u => u.color), f.deliveries.map(d => d.goal).sort(), f.mixer.length ? f.active : -1]);
  const queue = [{ frame: initial, parent: -1, action: null as MixingAction | null }], seen = new Set([key(initial)]);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (mixingComplete(current.frame, puzzle)) {
      const route: MixingAction[] = []; let cursor = head;
      while (queue[cursor].action) { route.push(queue[cursor].action!); cursor = queue[cursor].parent; }
      return { status: 'solved', route: route.reverse(), visited: seen.size };
    }
    for (let goal = 0; goal < puzzle.goals.length; goal++) for (let source = 0; source <= puzzle.bottles.length; source++) for (let target = 0; target <= puzzle.bottles.length; target++) {
      const action = { source, target, goal }, frame = applyMixing(puzzle, current.frame, action);
      if (!frame) continue;
      const signature = key(frame); if (seen.has(signature)) continue;
      if (seen.size >= limit) return { status: 'unknown', route: [], visited: seen.size };
      seen.add(signature); queue.push({ frame, parent: head, action });
    }
  }
  return { status: 'unsolvable', route: [], visited: seen.size };
}
