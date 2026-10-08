import config from '../../app.json';
/** Public builds hide calibration tools; internal builds opt in explicitly. */
export const INTERNAL_TOOLS = process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true' || config.expo.extra.internalTools;
