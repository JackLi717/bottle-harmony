module.exports = ({ config: base }) => {
  const tv = process.env.EXPO_TV === '1' || process.env.EXPO_TV === 'true';
  const store = process.env.APP_VARIANT === 'store';
  const internal = !store && process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true';
  return {
    ...base,
    orientation: tv ? 'landscape' : base.orientation,
    extra: { ...base.extra, internalTools: internal },
    android: {
      ...base.android,
      ...(store ? { blockedPermissions: [...base.android.blockedPermissions, 'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'] } : {}),
    },
    plugins: [...base.plugins, ['./plugins/withAndroidRelease', { store }], ['./plugins/withTabletOrientation', { tv }], ['@react-native-tvos/config-tv', { isTV: tv, androidTVRequired: true, androidTVBanner: './assets/android-tv-banner.png' }]],
  };
};
