import pool from '../../assets/levels/calibration.json';
import difficultyPool from '../../assets/levels/calibration-difficulty.json';
import { loadCalibrationSamples } from '../game/calibration';
import { decodeDifficultyPool } from '../game/difficultyCodec';
import { DEMO_LEVEL } from '../game/demo';
import { LIQUIDS } from '../art/palette';

export const CALIBRATION_SAMPLES = loadCalibrationSamples(JSON.stringify(pool));
export const PLAY_LEVELS = [DEMO_LEVEL, ...CALIBRATION_SAMPLES.map(sample => sample.content.level)];
export const DIFFICULTY = new Map([
  ...decodeDifficultyPool(JSON.stringify(difficultyPool), [...CALIBRATION_SAMPLES.map(sample => sample.content.level), DEMO_LEVEL]),
].map(report => [report.levelId, report]));
export const LEVEL_LABELS = new Map<string, string>([[DEMO_LEVEL.id, '初次体验'], ...CALIBRATION_SAMPLES.map(sample => [sample.content.level.id, sample.code] as const)]);
for (const level of PLAY_LEVELS) for (const color of level.colors) if (!LIQUIDS[color]) throw new Error(`Missing liquid art for ${color}`);
