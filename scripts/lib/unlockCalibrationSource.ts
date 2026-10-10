import { readFileSync } from 'node:fs';
import type { UnlockCalibrationLevel } from '../../src/game/unlockCalibration.ts';

/** Independent offline reconstruction of the frozen research candidate, before any admission filters. */
export function reconstructCalibrationBoard(entry: UnlockCalibrationLevel): string[][] {
  let board: string[][];
  const source = entry.source;
  if (source.kind === 'classic') {
    const catalog = JSON.parse(readFileSync(new URL('../../assets/levels/calibration.json',import.meta.url),'utf8'));
    board = catalog.records[5].level.bottles.map((b: { layers: string[] }) => b.layers);
  } else {
    let seed = source.seed;
    function shuffle(values: string[]) {
      for (let i = values.length - 1; i > 0; i--) {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
        const j = Math.floor(seed / 4294967296 * (i + 1));
        [values[i],values[j]] = [values[j],values[i]];
      }
      return values;
    }
    const [a,b,c,d,e] = ['coral','jade','amber','azure','violet'];
    board = [];
    for (let n = 0; n <= source.candidate; n++) {
      const first = shuffle(source.recipe === 'key-shared-inventory-v1'
        ? [a,a,a,b,b,b,c,c,c,d,d,d] : [a,a,a,a,b,b,b,c,c,c,d,d]);
      const last = shuffle(source.recipe === 'key-shared-inventory-v1' ? [a,b,c,d,e,e,e,e] : [b,c,d,d,e,e,e,e]);
      board = [first.slice(0,4),first.slice(4,8),first.slice(8,12),[],[],last.slice(0,4),last.slice(4,8)];
    }
  }
  return entry.extraEmpty ? [...board,[]] : board;
}
