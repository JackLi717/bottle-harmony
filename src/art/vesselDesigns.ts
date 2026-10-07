import { BOTTLE_INSIDE, BOTTLE_SHELL, INTERIOR, LAYER_AREA, type Point } from './bottleDesign.ts';
import type { CompletionEffect } from './bottleCompletion.ts';

export type VesselId = 'classic' | 'moon' | 'royal' | 'aurora' | 'alchemy' | 'prism' | 'tube' | 'beaker' | 'highball' | 'flute' | 'tulip' | 'martini' | 'coupe' | 'chalice' | 'flask';
export type VesselGeometry = {
  readonly interior: readonly Point[];
  readonly layerArea: number;
  readonly mouth: { readonly y: number; readonly outer: number; readonly inner: number; readonly outlet: number };
  readonly fillY: number;
  readonly bottomY: number;
};
type Detail = { path: string; width?: number; opacity?: number; gold?: boolean; glass?: boolean };
export type VesselDesign = VesselGeometry & {
  readonly id: VesselId;
  readonly name: `vessel_${VesselId}`;
  readonly shell: string;
  readonly inside: string;
  readonly tint: string;
  readonly edge: string;
  readonly warm: boolean;
  readonly cork: boolean;
  readonly highlights: readonly Detail[];
  readonly details: readonly Detail[];
};

const SILVER = '#9BC9D7', GOLD = '#DFC28B';
function points(values: readonly (readonly [number, number])[]): Point[] {
  return values.map(([x, y]) => ({ x, y }));
}
function pathOf(polygon: readonly Point[]) {
  return polygon.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + ' Z';
}
function filledArea(polygon: readonly Point[], top: number) {
  const clipped: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (a.y >= top) clipped.push(a);
    if ((a.y >= top) !== (b.y >= top)) {
      const ratio = (top - a.y) / (b.y - a.y);
      clipped.push({ x: a.x + ratio * (b.x - a.x), y: top });
    }
  }
  return Math.abs(clipped.reduce((area, a, i) => {
    const b = clipped[(i + 1) % clipped.length];
    return area + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
}
type Specification = {
  id: VesselId; shell: string; points: readonly (readonly [number, number])[];
  fillY: number; mouthY: number; outer: number; inner: number; outlet?: number;
  cork?: boolean; warm?: boolean; tint?: string;
  highlights: readonly Detail[]; details?: readonly Detail[];
};
function design(spec: Specification): VesselDesign {
  const interior = points(spec.points);
  return Object.freeze({
    id: spec.id, name: `vessel_${spec.id}` as const, shell: spec.shell, inside: pathOf(interior),
    interior, layerArea: filledArea(interior, spec.fillY) / 4, fillY: spec.fillY,
    bottomY: Math.max(...interior.map(p => p.y)),
    mouth: { y: spec.mouthY, outer: spec.outer, inner: spec.inner, outlet: spec.outlet ?? spec.inner },
    cork: spec.cork ?? false, warm: spec.warm ?? false,
    tint: spec.tint ?? '#79B8CE', edge: spec.warm ? GOLD : SILVER,
    highlights: spec.highlights, details: spec.details ?? [],
  });
}
const stem = (top: number, ornate = false): Detail[] => [
  { path: `M47 ${top} Q50 ${top + 5} 53 ${top} L52 158 Q53 164 58 167 H42 Q47 164 48 158 Z`, glass: true, opacity: .65 },
  { path: 'M25 170 C25 164 75 164 75 170 C75 177 25 177 25 170 Z', glass: true, opacity: .8 },
  { path: 'M28 169 Q50 165 72 169 M29 172 Q50 177 71 172 M49 130 V157', opacity: .5 },
  ...(ornate ? [
    { path: 'M47 126 L43 132 L50 139 L57 132 L53 126 M47 139 L48 157 L42 164 M53 139 L52 157 L58 164', gold: true, opacity: .65 },
    { path: 'M31 170 Q37 165 41 170 T50 170 T59 170 T69 170 M41 167 L45 164 M59 167 L55 164', gold: true },
  ] : []),
];
const facets: Detail[] = [
  { path: 'M24 65 L31 70 V150 L24 156 M76 65 L69 70 V150 L76 156 M31 150 L39 160 H61 L69 150 M24 156 L39 160 L33 166 M76 156 L61 160 L67 166', opacity: .55 },
];

/** Original vectors derived from the approved concept directions, all within the same board footprint. */
export const VESSELS: readonly VesselDesign[] = [
  Object.freeze({
    id: 'classic', name: 'vessel_classic', shell: BOTTLE_SHELL, inside: BOTTLE_INSIDE,
    interior: INTERIOR, layerArea: LAYER_AREA, fillY: 66, bottomY: 162,
    mouth: { y: 28, outer: 17, inner: 11.5, outlet: 12 }, cork: true, warm: false,
    tint: '#83BBD2', edge: '#82B1C4',
    highlights: [
      { path: 'M34 62 Q30 68 30 77 V147 Q30 155 36 157', width: 2.3, opacity: .25 },
      { path: 'M70 80 V142', width: 1.4, opacity: .11 },
      { path: 'M40 42 Q38 49 30 55', width: 1.8, opacity: .24 },
      { path: 'M30 162 Q50 169 70 162', width: 1.7, opacity: .48 },
    ], details: [],
  }),
  design({
    id: 'moon', mouthY: 21, outer: 12, inner: 8, fillY: 78, cork: true,
    shell: 'M39 21 H61 V51 C61 65 74 70 74 83 V154 Q74 168 63 168 H37 Q26 168 26 154 V83 C26 70 39 65 39 51 Z',
    points: [[42,24],[58,24],[58,52],[61,63],[70,77],[71,84],[71,154],[68,160],[61,163],[39,163],[32,160],[29,154],[29,84],[30,77],[39,63],[42,52]],
    highlights: [{ path: 'M43 30 V52 Q43 63 37 69 M34 82 Q32 92 32 101 V149 Q32 157 39 158', width: 1.8, opacity: .36 }, { path: 'M67 99 V146', opacity: .19 }],
    details: [{ path: 'M42 64 Q48 71 56 64 Q50 74 42 64', opacity: .3 }],
  }),
  design({
    id: 'royal', mouthY: 25, outer: 14, inner: 10, fillY: 61, cork: true, warm: true,
    shell: 'M37 25 H63 V43 L77 57 V154 L66 168 H34 L23 154 V57 L37 43 Z',
    points: [[40,28],[60,28],[60,44],[73,59],[73,152],[64,163],[36,163],[27,152],[27,59],[40,44]],
    highlights: [{ path: 'M28 60 L34 66 V150 L40 159 M72 60 L66 66 V150 L60 159', opacity: .48 }, { path: 'M35 65 V145', opacity: .2 }],
    details: [{ path: 'M24 58 L34 65 L40 48 M76 58 L66 65 L60 48 M24 154 L34 149 L40 166 M76 154 L66 149 L60 166', gold: true, opacity: .65 },
      { path: 'M38 47 Q34 47 33 51 Q37 54 38 50 M62 47 Q66 47 67 51 Q63 54 62 50 M28 57 L28 62 M72 57 L72 62 M35 162 H65', gold: true }],
  }),
  design({
    id: 'aurora', mouthY: 25, outer: 16, inner: 11, fillY: 63, cork: true, tint: '#B7A6F3',
    shell: 'M36 25 H64 V40 Q64 46 72 49 Q78 52 78 63 V154 Q78 169 64 169 H36 Q22 169 22 154 V63 Q22 52 28 49 Q36 46 36 40 Z',
    points: [[39,28],[61,28],[61,41],[65,48],[73,55],[75,63],[75,152],[72,161],[64,165],[36,165],[28,161],[25,152],[25,63],[27,55],[35,48],[39,41]],
    highlights: [{ path: 'M29 65 V150 Q29 160 38 160', width: 2, opacity: .4 }, { path: 'M71 70 V148', opacity: .18 }],
    details: [{ path: 'M23 63 V154 Q23 168 37 168 H64', opacity: .62 }, { path: 'M77 63 V154 Q77 168 64 168', opacity: .65 }],
  }),
  design({
    id: 'alchemy', mouthY: 25, outer: 16, inner: 11, fillY: 69, cork: true, warm: true,
    shell: 'M36 25 H64 V42 L76 63 V155 Q76 167 65 167 H35 Q24 167 24 155 V63 L36 42 Z',
    points: [[39,28],[61,28],[61,43],[72,64],[72,155],[67,162],[33,162],[28,155],[28,64],[39,43]],
    highlights: [{ path: 'M33 73 V149 Q33 156 38 157', width: 2, opacity: .32 }, { path: 'M68 78 V147', opacity: .2 }],
    details: [{ path: 'M36 33 H64 M36 37 H64 M26 65 H74 M26 158 Q50 164 74 158 M27 164 H73', gold: true, opacity: .75 },
      { path: 'M43 49 L44 52 L47 53 L44 54 L43 57 L42 54 L39 53 L42 52 Z M59 52 L60 55 L63 56 L60 57 L59 60 L58 57 L55 56 L58 55 Z', gold: true, opacity: .65 }],
  }),
  design({
    id: 'prism', mouthY: 25, outer: 15, inner: 10, fillY: 65, cork: true,
    shell: 'M37 25 H63 V42 L78 60 V153 L66 168 H34 L22 153 V60 L37 42 Z',
    points: [[40,28],[60,28],[60,43],[73,62],[73,150],[63,163],[37,163],[27,150],[27,62],[40,43]],
    highlights: [{ path: 'M32 71 V143', width: 1.6, opacity: .28 }, { path: 'M67 75 V142', opacity: .2 }],
    details: [...facets, { path: 'M23 60 L33 70 L40 43 M77 60 L67 70 L60 43 M33 70 H67 M24 153 L33 147 L39 163 L34 167 M76 153 L67 147 L61 163 L66 167', opacity: .6 }],
  }),
  design({
    id: 'tube', mouthY: 25, outer: 23, inner: 18, fillY: 47, cork: true,
    shell: 'M29 25 H71 V146 Q71 169 50 169 Q29 169 29 146 Z',
    points: [[32,28],[68,28],[68,147],[66,154],[62,160],[56,164],[50,165],[44,164],[38,160],[34,154],[32,147]],
    highlights: [{ path: 'M36 37 V145 Q36 158 45 159', width: 2, opacity: .36 }, { path: 'M64 49 V143', opacity: .18 }],
  }),
  design({
    id: 'beaker', mouthY: 30, outer: 29, inner: 25, fillY: 52,
    shell: 'M22 30 L18 33 L22 38 V154 Q22 168 35 168 H65 Q78 168 78 154 V30 Z',
    points: [[25,33],[75,33],[75,153],[72,160],[65,163],[35,163],[28,160],[25,153]],
    highlights: [{ path: 'M30 45 V149 Q30 157 36 158', width: 2.1, opacity: .35 }, { path: 'M70 49 V145', opacity: .18 }],
    details: [{ path: 'M27 161 Q50 171 73 161 M66 42 H71 M68 39 V45', opacity: .38 }],
  }),
  design({
    id: 'highball', mouthY: 25, outer: 27, inner: 23, fillY: 46,
    shell: 'M23 25 H77 L75 156 Q75 169 64 169 H36 Q25 169 25 156 Z',
    points: [[27,28],[73,28],[71,150],[67,155],[33,155],[29,150]],
    highlights: [{ path: 'M32 39 L34 145', width: 2, opacity: .35 }, { path: 'M68 45 L66 143', opacity: .22 }],
    details: [{ path: 'M25 148 L35 155 L29 164 L41 168 L45 155 H55 L59 168 L71 164 L65 155 L75 148 M35 155 L41 168 L50 160 L59 168 L65 155 M29 164 L50 160 L71 164', opacity: .58 }],
  }),
  design({
    id: 'flute', mouthY: 22, outer: 22, inner: 18, fillY: 37,
    shell: 'M28 22 H72 L69 84 C68 102 60 117 53 121 H47 C40 117 32 102 31 84 Z',
    points: [[32,25],[68,25],[65,83],[63,94],[59,105],[54,115],[50,118],[46,115],[41,105],[37,94],[35,83]],
    highlights: [{ path: 'M36 34 L39 83 Q41 105 48 111', width: 1.8, opacity: .38 }, { path: 'M63 38 L60 84', opacity: .18 }],
    details: stem(121),
  }),
  design({
    id: 'tulip', mouthY: 27, outer: 19, inner: 15, fillY: 44,
    shell: 'M31 27 H69 Q68 49 76 69 C84 92 71 117 53 123 H47 C29 117 16 92 24 69 Q32 49 31 27 Z',
    points: [[35,30],[65,30],[66,47],[68,58],[72,71],[74,82],[73,94],[68,105],[60,113],[50,119],[40,113],[32,105],[27,94],[26,82],[28,71],[32,58],[34,47]],
    highlights: [{ path: 'M36 45 Q36 59 31 73 Q26 94 42 108', width: 1.9, opacity: .35 }, { path: 'M68 76 Q74 92 65 103', opacity: .2 }],
    details: stem(123),
  }),
  design({
    id: 'martini', mouthY: 28, outer: 30, inner: 27, fillY: 42,
    shell: 'M20 28 H80 L55 111 Q50 119 45 111 Z',
    points: [[24,31],[76,31],[52,111],[50,114],[48,111]],
    highlights: [{ path: 'M29 39 L49 105', width: 1.7, opacity: .4 }, { path: 'M71 40 L56 96', opacity: .25 }],
    details: [...stem(117), { path: 'M22 31 L28 34 L49 108 M78 31 L72 34 L51 108 M27 170 L40 166 L50 173 L60 166 L73 170', opacity: .6 }],
  }),
  design({
    id: 'coupe', mouthY: 51, outer: 30, inner: 27, fillY: 60, warm: true,
    shell: 'M20 51 H80 C82 77 70 101 53 108 H47 C30 101 18 77 20 51 Z',
    points: [[24,54],[76,54],[76,65],[73,78],[67,89],[59,99],[50,105],[41,99],[33,89],[27,78],[24,65]],
    highlights: [{ path: 'M28 63 Q28 83 43 95', width: 1.8, opacity: .38 }, { path: 'M72 64 Q72 80 64 90', opacity: .22 }],
    details: stem(108),
  }),
  design({
    id: 'chalice', mouthY: 27, outer: 27, inner: 23, fillY: 47, warm: true,
    shell: 'M23 27 H77 V80 C77 104 66 119 53 123 H47 C34 119 23 104 23 80 Z',
    points: [[27,30],[73,30],[73,80],[71,94],[65,106],[58,115],[50,119],[42,115],[35,106],[29,94],[27,80]],
    highlights: [{ path: 'M32 48 V79 Q32 102 45 112', width: 1.8, opacity: .32 }, { path: 'M67 52 V80 Q67 98 60 107', opacity: .2 }],
    details: [...stem(123, true), { path: 'M25 33 H75 M27 37 Q33 31 37 39 T47 39 T57 39 T67 39 Q72 34 74 37 M33 37 Q29 44 34 45 Q38 44 35 41 M45 36 L47 43 L50 46 L53 43 L55 36 M67 37 Q71 44 66 45 Q62 44 65 41', gold: true, opacity: .8 }],
  }),
  design({
    id: 'flask', mouthY: 25, outer: 13, inner: 9, fillY: 70, cork: true, warm: true,
    shell: 'M39 25 H61 V50 L79 151 Q81 169 65 169 H35 Q19 169 21 151 L39 50 Z',
    points: [[42,28],[58,28],[58,50],[75,149],[74,158],[67,164],[33,164],[26,158],[25,149],[42,50]],
    highlights: [{ path: 'M42 54 L30 142 Q28 156 37 158', width: 2, opacity: .38 }, { path: 'M62 75 L72 144', opacity: .2 }],
    details: [{ path: 'M24 152 Q24 168 38 168 H64 Q76 168 77 152 M39 32 H61', gold: true, opacity: .4 }],
  }),
] as const;

export const DEFAULT_VESSEL = VESSELS[0];
export function vesselFor(value: unknown): VesselDesign {
  return VESSELS.find(vessel => vessel.id === value) ?? DEFAULT_VESSEL;
}
export function vesselCompletionEffect(design: VesselDesign, effect: CompletionEffect): CompletionEffect {
  return effect === 'cork' && !design.cork ? 'halo' : effect;
}
