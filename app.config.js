module.exports = ({ config: base }) => {
  const store = process.env.APP_VARIANT === 'store';
  const internal = !store && process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true';
  return {
    ...base,
    extra: { ...base.extra, internalTools: internal },
    android: {
      ...base.android,
      ...(store ? { blockedPermissions: [...base.android.blockedPermissions, 'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'] } : {}),
    },
    plugins: [...base.plugins, ['./plugins/withAndroidRelease', { store }]],
  };
};
