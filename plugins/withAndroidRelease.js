const { withAppBuildGradle, withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidRelease(config, { store = false } = {}) {
  config = withGradleProperties(config, mod => {
    const properties = { EX_DEV_CLIENT_NETWORK_INSPECTOR: store ? 'false' : 'true' };
    for (const [key, value] of Object.entries(properties)) {
      mod.modResults = mod.modResults.filter(entry => entry.key !== key);
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
  if (!store) return config;
  config = withProjectBuildGradle(config, mod => {
    const anchor = 'apply plugin: "expo-root-project"';
    if (!mod.modResults.contents.includes(anchor)) throw new Error('Unknown Expo root Gradle template.');
    if (!mod.modResults.contents.includes("ext.ndkVersion = '28.2.13676358'")) {
      const nativeConfiguration = `
// Source-built native modules use both maximum and common 16 KB page alignment.
subprojects { nativeProject ->
    nativeProject.afterEvaluate {
        if (nativeProject.plugins.hasPlugin('com.android.application') || nativeProject.plugins.hasPlugin('com.android.library')) {
            nativeProject.android.defaultConfig.externalNativeBuild.cmake.arguments += ['-DCMAKE_SHARED_LINKER_FLAGS=-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384']
        }
    }
}
`;
      mod.modResults.contents = mod.modResults.contents.replace(anchor, `ext.ndkVersion = '28.2.13676358'\n${nativeConfiguration}\n${anchor}`);
    }
    return mod;
  });
  return withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Release signing requires the Expo Groovy Android template.');
    const marker = '// Bottle Harmony upload signing';
    if (mod.modResults.contents.includes(marker)) return mod;
    const signing = `${marker}
def uploadPropertiesFile = rootProject.file('../builds/signing/upload.properties')
if (!uploadPropertiesFile.exists()) throw new GradleException('Run npm run android:upload-key before a store build.')
def uploadProperties = new Properties()
uploadPropertiesFile.withInputStream { uploadProperties.load(it) }
android.signingConfigs.create('upload') {
    storeFile rootProject.file('../builds/signing/upload.jks')
    storePassword uploadProperties.getProperty('storePassword')
    keyAlias uploadProperties.getProperty('keyAlias')
    keyPassword uploadProperties.getProperty('keyPassword')
}
android.buildTypes.release.signingConfig = android.signingConfigs.upload
`;
    mod.modResults.contents += `\n${signing}`;
    return mod;
  });
};
