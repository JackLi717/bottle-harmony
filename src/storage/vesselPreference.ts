import { vesselFor, type VesselId } from '../art/vesselDesigns.ts';

export const VESSEL_PREFERENCE_KEY = 'bottle-harmony.vessel.v1';
/** Cosmetic preference only; never read or write a game-session snapshot. */
export function parseVesselPreference(value: unknown): VesselId {
  return vesselFor(value).id;
}
