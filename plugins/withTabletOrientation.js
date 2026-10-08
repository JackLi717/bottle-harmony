const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

/** Keep the approved portrait phone presentation; let Android tablets rotate. */
module.exports = function withTabletOrientation(config, { tv = false } = {}) {
  if (tv) return config;
  config = withAndroidManifest(config, mod => {
    // A portrait manifest can letterbox tablets before onCreate, making their
    // activity configuration appear narrower than 600 dp. Classify the full
    // screen first, then lock only phones in MainActivity.
    AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults).$['android:screenOrientation'] = 'unspecified';
    return mod;
  });
  return withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Tablet orientation requires the Expo Kotlin Activity template.');
    const marker = '// Bottle Harmony tablet orientation';
    const oldBlock = `${marker}
    if (resources.configuration.smallestScreenWidthDp >= 600) {
      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }`;
    const block = `${marker}
    if (resources.configuration.smallestScreenWidthDp < 600) {
      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }`;
    if (mod.modResults.contents.includes(block)) return mod;
    if (mod.modResults.contents.includes(oldBlock)) {
      mod.modResults.contents = mod.modResults.contents.replace(oldBlock, block);
      return mod;
    }
    if (mod.modResults.contents.includes(marker)) throw new Error('Unknown tablet orientation block.');
    const anchor = 'super.onCreate(null)';
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Unknown Expo Activity creation template.');
    mod.modResults.contents = mod.modResults.contents.replace(anchor, `${anchor}
    ${block}`);
    return mod;
  });
};
