const fs = require('node:fs');
module.exports = ({ config: base }) => {
  const tv = process.env.EXPO_TV === '1' || process.env.EXPO_TV === 'true';
  const store = process.env.APP_VARIANT === 'store';
  const acceptance = process.env.APP_VARIANT === 'engine-acceptance';
  const internal = acceptance || (!store && process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true');
  const environment = acceptance || tv || process.env.ANALYTICS_ENV === 'offline' ? null : process.env.ANALYTICS_ENV || (store ? 'production' : 'test');
  if (environment && !['production', 'test'].includes(environment)) throw new Error('ANALYTICS_ENV must be production, test or offline');
  if (store && environment === 'test') throw new Error('Store builds must not send to the test property');
  const folder = `./config/firebase/${environment}`;
  if (environment) for (const name of ['google-services.json', 'GoogleService-Info.plist']) {
    if (!fs.existsSync(`${folder}/${name}`)) throw new Error(`Missing Firebase client configuration: ${folder}/${name}`);
  }
  return {
    ...base,
    ...(acceptance ? { name: 'Harmony Engine', scheme: 'harmony-engine-acceptance' } : {}),
    orientation: tv ? 'landscape' : base.orientation,
    extra: { ...base.extra, internalTools: internal, analyticsEnvironment: environment ?? 'offline' },
    ios: { ...base.ios, ...(acceptance ? { bundleIdentifier: 'com.bottleharmony.engineacceptance' } : {}), ...(environment ? { googleServicesFile: `${folder}/GoogleService-Info.plist` } : {}) },
    android: {
      ...base.android,
      ...(acceptance ? { package: 'com.bottleharmony.engineacceptance' } : {}),
      blockedPermissions: [...base.android.blockedPermissions, 'android.permission.ACCESS_ADSERVICES_AD_ID', 'android.permission.ACCESS_ADSERVICES_ATTRIBUTION', 'android.permission.ACCESS_ADSERVICES_TOPICS'],
      ...(environment ? { googleServicesFile: `${folder}/google-services.json` } : {}),
      ...(store && !environment ? { blockedPermissions: [...base.android.blockedPermissions, 'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.ACCESS_ADSERVICES_AD_ID', 'android.permission.ACCESS_ADSERVICES_ATTRIBUTION', 'android.permission.ACCESS_ADSERVICES_TOPICS'] } : {}),
    },
    plugins: [...base.plugins,
      ...(environment ? [['@react-native-firebase/app', { ios: { disableSPM: true } }], ['@react-native-firebase/analytics', { ios: { withoutAdIdSupport: true } }], ['expo-build-properties', { ios: { useFrameworks: 'static' } }]] : []),
      ['./plugins/withAndroidRelease', { store }], ['./plugins/withEngineAcceptance', { enabled: acceptance }], ['./plugins/withSvgTrace', { enabled: acceptance && process.env.ENGINE_SVG_TRACE === 'true', picture: acceptance && process.env.ENGINE_SVG_PICTURE === 'true' }], ['./plugins/withTabletOrientation', { tv }], ['@react-native-tvos/config-tv', { isTV: tv, androidTVRequired: true, androidTVBanner: './assets/android-tv-banner.png' }]],
  };
};
