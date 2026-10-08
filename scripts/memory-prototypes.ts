import { parseLevel } from '../src/game/model.ts';

// Five hand-authored test boards. This is build input, never a runtime JSON fallback or a generator.
const colors = ['jade', 'coral', 'amber', 'azure', 'violet', 'rose'];
const definitions = [
  { skill: 'single-position', rows: [[0,1,0,1],[1,0,1,0]], masks: [0] },
  { skill: 'paired-bottles', rows: [[0,1,2,0],[0,2,1,2],[1,2,0,1]], masks: [0,4] },
  { skill: 'bottom-order', rows: [[0,1,2,3],[1,0,3,2],[2,3,0,1],[3,2,1,0]], masks: [0,1,8,9] },
  { skill: 'cross-bottle', rows: [[0,1,0,2],[2,3,1,3],[1,0,2,1],[3,2,3,0]], masks: [0,4,8,12] },
  { skill: 'delayed-use', rows: [[0,1,2,3],[1,2,3,4],[2,3,4,0],[3,4,0,1],[4,0,1,2]], masks: [0,1,8,9,16,17] },
];
export const MEMORY_PROTOTYPES = definitions.map((d, i) => ({ number: i + 1, skill: d.skill, masks: d.masks,
  level: parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: `memory-prototype-v1-${i + 1}`, capacity: 4,
    colors: colors.slice(0, d.rows.length), bottles: [...d.rows, [], []].map((b, n) => ({ id: `b${n + 1}`, layers: b.map(c => colors[c]) })) }) }));
