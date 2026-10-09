const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Prevent an export/build from reusing modules with the other entry-point flag inlined.
config.cacheVersion += process.env.APP_VARIANT === 'store' ? ':store' : process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true' ? ':internal' : ':public';
config.resolver.assetExts.push('sqlite', 'wasm');
config.server.enhanceMiddleware = middleware => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};
module.exports = config;
