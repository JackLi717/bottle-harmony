import { loadCalibrationSamples, type CalibrationSample } from '../game/calibration';
import { decodeDifficultyPool } from '../game/difficultyCodec';
import { DEMO_LEVEL } from '../game/demo';
import { LIQUIDS } from '../art/palette';
import type { ContentRepository } from '../storage/contentRepository';
import type { DifficultyReport, PlanningDepthReport } from '../game/difficulty';
export let CALIBRATION_SAMPLES: readonly CalibrationSample[] = [];
export const DIFFICULTY = new Map<string, DifficultyReport | PlanningDepthReport>();
export const LEVEL_LABELS = new Map<string, string>([[DEMO_LEVEL.id, '初次体验']]);
export function installInternalContent(content: ContentRepository) {
  CALIBRATION_SAMPLES = loadCalibrationSamples(JSON.stringify(content.internal('calibration')));
  const levels = [...CALIBRATION_SAMPLES.map(sample => sample.content.level), DEMO_LEVEL];
  for (const report of decodeDifficultyPool(JSON.stringify(content.internal('calibration-difficulty')), levels)) DIFFICULTY.set(report.levelId, report);
  for (const sample of CALIBRATION_SAMPLES) LEVEL_LABELS.set(sample.content.level.id, sample.code);
  for (const level of levels) for (const color of level.colors) if (!LIQUIDS[color]) throw new Error(`Missing liquid art for ${color}`);
}
