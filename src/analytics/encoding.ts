import { validateParameters, type AnalyticsEventName, type AnalyticsParameters } from './contracts.ts';

const categoryPrefixes: Record<string, string> = {
  level_number: 'level_', colors: 'colors_', stage: 'stage_', since_activation: 'day_',
};
const booleanCategories = new Set(['first_clear', 'first_exposure', 'unassisted', 'new_observation']);

/** App event-scoped dimensions cannot report integer parameters. Keep local facts and numeric metrics intact. */
export function encodeAnalyticsParameters(name: AnalyticsEventName, params: AnalyticsParameters): AnalyticsParameters {
  const encoded = { ...params };
  for (const [key, value] of Object.entries(encoded)) {
    if (typeof value !== 'number') continue;
    if (booleanCategories.has(key)) {
      if (value !== 0 && value !== 1) throw new Error(`Invalid analytics boolean category: ${key}`);
      encoded[key] = value ? 'yes' : 'no';
    } else if (Object.hasOwn(categoryPrefixes, key)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid analytics integer category: ${key}`);
      encoded[key] = `${categoryPrefixes[key]}${value}`;
    }
  }
  validateParameters(name, encoded);
  return encoded;
}
