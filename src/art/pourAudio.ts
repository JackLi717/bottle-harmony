import type { VesselId } from './vesselDesigns.ts';

export type PourAudioFamily = 'neck' | 'flask' | 'slender' | 'straight' | 'bowl' | 'shallow';
export type ReceiverFillBand = 'low' | 'mid' | 'high';
export type PourAudioClip = `${PourAudioFamily}-${ReceiverFillBand}`;

export const VESSEL_AUDIO: Readonly<Record<VesselId, PourAudioFamily>> = {
  classic: 'neck', moon: 'neck', royal: 'neck', aurora: 'neck', alchemy: 'neck', prism: 'neck',
  flask: 'flask', tube: 'slender', flute: 'slender', beaker: 'straight', highball: 'straight',
  tulip: 'bowl', chalice: 'bowl', martini: 'shallow', coupe: 'shallow',
};

/** Starting receiver fill selects one continuous take, even for a multi-layer pour. */
export function receiverFillBand(startingLayers: number): ReceiverFillBand {
  return startingLayers >= 3 ? 'high' : startingLayers >= 1 ? 'mid' : 'low';
}

export function pourAudioClip(vessel: VesselId, startingLayers: number): PourAudioClip {
  return `${VESSEL_AUDIO[vessel]}-${receiverFillBand(startingLayers)}`;
}
