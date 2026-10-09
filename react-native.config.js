const offline = process.env.ANALYTICS_ENV === 'offline' || ['1', 'true'].includes(process.env.EXPO_TV);
module.exports = {
  dependencies: offline ? {
    '@react-native-firebase/app': { platforms: { ios: null, android: null } },
    '@react-native-firebase/analytics': { platforms: { ios: null, android: null } },
  } : {},
};
