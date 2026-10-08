import type { SolidSideCatalog } from '../game/solidSide';
export let SOLID_SIDES: SolidSideCatalog;
export function installSideContent(content: SolidSideCatalog) { SOLID_SIDES = content; }
