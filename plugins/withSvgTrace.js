const { withDangerousMod } = require('expo/config-plugins');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Optional local profiling only. Keep the published SVG implementation unchanged.
const before = `    Bitmap bitmap = Bitmap.createBitmap((int) width, (int) height, Bitmap.Config.ARGB_8888);
    mCurrentBitmap = bitmap;
    drawChildren(new Canvas(bitmap));
    return bitmap;`;
const after = `    // BH_SVG_TRACE: diagnostic scopes only; no rendering or allocation changes.
    android.os.Trace.beginSection("BH.SVG.output:" + (int) width + "x" + (int) height);
    try {
      Bitmap bitmap;
      android.os.Trace.beginSection("BH.SVG.allocate");
      try {
        bitmap = Bitmap.createBitmap((int) width, (int) height, Bitmap.Config.ARGB_8888);
      } finally {
        android.os.Trace.endSection();
      }
      mCurrentBitmap = bitmap;
      android.os.Trace.beginSection("BH.SVG.children");
      try {
        drawChildren(new Canvas(bitmap));
      } finally {
        android.os.Trace.endSection();
      }
      return bitmap;
    } finally {
      android.os.Trace.endSection();
    }`;

function configureSvgTracing(source, enabled) {
  const original = source.includes('BH_SVG_TRACE') ? source.replace(after, before) : source;
  if (!original.includes(before) || original.includes('BH_SVG_TRACE')) throw new Error('Review SVG tracing instrumentation after dependency changes');
  // Exact dependency hash checked below; never apply to a changed library silently.
  if (createHash('sha256').update(original).digest('hex') !== ORIGINAL_HASH) throw new Error('Review react-native-svg 15.15.4 source before tracing');
  return enabled ? original.replace(before, after) : original;
}

const ORIGINAL_HASH = '75a2bd5e60727f242433005e10bc0c7a07bf86e1e1cfddc5ce09af9004bfcede';
module.exports = function withSvgTrace(config, { enabled = false } = {}) {
  if (enabled && config.android?.package !== 'com.bottleharmony.engineacceptance') throw new Error('SVG tracing requires the isolated acceptance package');
  return withDangerousMod(config, ['android', async mod => {
    const file = path.join(mod.modRequest.projectRoot, 'node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/SvgView.java');
    const source = await fs.readFile(file, 'utf8'), updated = configureSvgTracing(source, enabled);
    if (updated !== source) await fs.writeFile(file, updated);
    return mod;
  }]);
};
module.exports.configureSvgTracing = configureSvgTracing;
