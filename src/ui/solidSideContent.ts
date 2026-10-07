import { decodeSolidSide } from '../game/solidSide';

const data: unknown = require('../../assets/levels/solid-side-50.json');
export const SOLID_SIDES = decodeSolidSide(data);
