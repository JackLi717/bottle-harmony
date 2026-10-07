/** Shared native/vector artwork coordinates. */
export const BOTTLE_SHELL = 'M35 28 Q35 25 40 25 H60 Q65 25 65 28 V40 C65 45 79 51 79 66 V154 Q79 167 66 168 H34 Q21 167 21 154 V66 C21 51 35 45 35 40 Z';
export const BOTTLE_INSIDE = 'M38 34 H62 V42 Q75 55 75 66 V154 Q75 162 67 162 H33 Q25 162 25 154 V66 Q25 55 38 42 Z';

export type Point = { x: number; y: number };
export const INTERIOR: Point[] = [
  { x: 38, y: 34 }, { x: 62, y: 34 }, { x: 62, y: 42 },
  { x: 73, y: 57 }, { x: 75, y: 66 }, { x: 75, y: 154 },
  { x: 71, y: 162 }, { x: 29, y: 162 }, { x: 25, y: 154 },
  { x: 25, y: 66 }, { x: 27, y: 57 }, { x: 38, y: 42 },
];
export const LAYER_AREA = (50 * 96 - 32) / 4;
