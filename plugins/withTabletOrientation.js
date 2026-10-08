const { withMainActivity } = require('expo/config-plugins');

/** Keep the approved portrait phone presentation; let Android tablets rotate. */
module.exports = function withTabletOrientation(config, { tv = false } = {}) {
  if (tv) return config;
  return withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Tablet orientation requires the Expo Kotlin Activity template.');
    const marker = '// Bottle Harmony tablet orientation';
    if (mod.modResults.contents.includes(marker)) return mod;
    const anchor = 'super.onCreate(null)';
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Unknown Expo Activity creation template.');
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${anchor}
    ${marker}
    if (resources.configuration.smallestScreenWidthDp >= 600) {
      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }`);
    return mod;
  });
};
