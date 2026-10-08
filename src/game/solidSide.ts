import { parseLevel, type LevelDefinition } from './model.ts';
import { canonicalBottleStrings } from './structure.ts';
import { getPour, isSolved, type Board, type Pour } from './rules.ts';
import { applySolidPour, getSolidPour } from './solidRules.ts';

const COLOR_IDS = ['jade', 'coral', 'amber', 'azure', 'violet', 'rose'] as const;
type FirstChoices = { choices: number; safe: number; costly: number; dead: number };
export type SolidSideEntry = {
  readonly levelId?: string;
  readonly number: number;
  readonly afterMainline: number;
  readonly level: LevelDefinition;
  readonly frozenBottle: number;
  readonly frozenRoute: readonly Pour[];
  readonly meltedRoute: readonly Pour[];
  readonly difficulty: { frozenMoves: number; meltedMoves: number; frozenFirstChoices: FirstChoices; meltedFirstChoices: FirstChoices; riskGap: number };
  readonly structureKey: string;
};
export type SolidSideCatalog = { readonly id: string; readonly entries: readonly SolidSideEntry[] };

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid solid side content');
  return value as Record<string, any>;
}
function replay(board: Board, route: readonly Pour[], frozenBottle: number, frozen: boolean) {
  const rule = { bottle: frozenBottle, depth: 1 as const, melted: !frozen };
  let current = board;
  for (const move of route) {
    if (isSolved(current, 4)) throw new Error('Solid side route continues after solution');
    const legal = frozen ? getSolidPour(current, move.source, move.target, 4, rule)
      : getPour(current, move.source, move.target, 4);
    if (!legal || legal.amount !== move.amount || legal.color !== move.color) throw new Error('Invalid solid side route');
    current = applySolidPour(current, legal, 4, rule);
  }
  if (!isSolved(current, 4)) throw new Error('Unfinished solid side route');
}
export function decodeSolidSide(input: unknown): SolidSideCatalog {
  const data = object(input);
  if (data.format !== 'bottle-harmony-solid-side' || data.version !== 1 || data.catalog !== 'solid-side-50-v1'
    || data.capacity !== 4 || data.mainlineCount !== 1000 || data.interval !== 20
    || !Array.isArray(data.levels) || data.levels.length !== 50) throw new Error('Invalid solid side catalog');
  const keys = new Set<string>();
  const entries = data.levels.map((unknownEntry: unknown, index: number): SolidSideEntry => {
    const raw = object(unknownEntry), colors = raw.colors, bottles = raw.bottles;
    if (raw.number !== index + 1 || raw.afterMainline !== (index + 1) * 20
      || raw.id !== `solid-side-${String(index + 1).padStart(2, '0')}`
      || !Array.isArray(colors) || colors.length < 3 || colors.length > 6
      || colors.some((color, i) => color !== String.fromCharCode(65 + i))
      || !Array.isArray(bottles) || bottles.length !== colors.length + 1
      || raw.frozenBottle !== bottles.length - 1 || raw.frozenDepth !== 1
      || bottles.some((bottle: unknown) => !Array.isArray(bottle) || bottle.length < 1 || bottle.length > 4)) throw new Error('Invalid solid side layout');
    const mapping = new Map<string, string>(colors.map((color: string, i: number) => [color, COLOR_IDS[i]]));
    const level = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: raw.id, capacity: 4,
      colors: colors.map((color: string) => mapping.get(color)),
      bottles: bottles.map((layers: string[], i: number) => ({ id: `bottle-${i + 1}`, layers: layers.map(color => mapping.get(color) ?? color) })) });
    if (level.bottles.some(bottle => new Set(bottle.layers).size === 1 && bottle.layers.length === 4
      || [...new Set(bottle.layers)].some(color => bottle.layers.filter(layer => layer === color).length > 2))) throw new Error('Invalid solid side opening quality');
    const rawBoard: number[][] = bottles.map((layers: string[]) => layers.map(color => colors.indexOf(color)));
    const key = canonicalBottleStrings([...rawBoard.slice(0, -1), [99, ...rawBoard.at(-1)!]]);
    if (key !== raw.structureKey || keys.has(key)) throw new Error('Duplicate or mismatched solid side structure');
    keys.add(key);
    const convertRoute = (input: unknown): Pour[] => {
      if (!Array.isArray(input)) throw new Error('Missing solid side route');
      return input.map(move => {
        const item = object(move);
        if (!Number.isInteger(item.source) || !Number.isInteger(item.target) || !Number.isInteger(item.amount)
          || !mapping.has(item.color)) throw new Error('Invalid solid side move');
        return { source: item.source, target: item.target, amount: item.amount, color: mapping.get(item.color)! };
      });
    };
    const frozenRoute = convertRoute(raw.frozenRoute), meltedRoute = convertRoute(raw.meltedRoute);
    replay(level.bottles.map(bottle => bottle.layers), frozenRoute, raw.frozenBottle, true);
    replay(level.bottles.map(bottle => bottle.layers), meltedRoute, raw.frozenBottle, false);
    const difficulty = object(raw.difficulty);
    const parseChoices = (value: unknown): FirstChoices => {
      const choices = object(value);
      if (!['choices', 'safe', 'costly', 'dead'].every(key => Number.isInteger(choices[key]) && choices[key] >= 0)
        || choices.choices < 1 || choices.safe + choices.costly + choices.dead !== choices.choices) throw new Error('Invalid side choice evidence');
      return choices as FirstChoices;
    };
    const frozenFirstChoices = parseChoices(difficulty.frozenFirstChoices);
    const meltedFirstChoices = parseChoices(difficulty.meltedFirstChoices);
    if (difficulty.frozenMoves !== frozenRoute.length || difficulty.meltedMoves !== meltedRoute.length
      || typeof difficulty.riskGap !== 'number' || !Number.isFinite(difficulty.riskGap)
      || Math.abs(difficulty.riskGap - ((frozenFirstChoices.dead + frozenFirstChoices.costly) / frozenFirstChoices.choices
        - (meltedFirstChoices.dead + meltedFirstChoices.costly) / meltedFirstChoices.choices)) > 1e-8) throw new Error('Invalid side difficulty evidence');
    return Object.freeze({ number: raw.number, afterMainline: raw.afterMainline, level, frozenBottle: raw.frozenBottle,
      frozenRoute: Object.freeze(frozenRoute), meltedRoute: Object.freeze(meltedRoute), difficulty: difficulty as SolidSideEntry['difficulty'], structureKey: key });
  });
  return Object.freeze({ id: data.catalog, entries: Object.freeze(entries) });
}
