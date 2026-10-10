// Experimental native rendering for the isolated acceptance application only.
// Picture records the existing SVG drawing commands; masks, filters and export retain bitmap fallback.
const { createHash } = require('node:crypto');
const rootPairs = [
  [
    "  private @Nullable Bitmap mBitmap;",
    "  // BH_SVG_PICTURE: isolated hardware recording experiment.\n  private @Nullable android.graphics.Picture mPicture;\n  private @Nullable Bitmap mBitmap;"
  ],
  [
    "    if (!mRemovalTransitionStarted) {",
    "    if (!mRemovalTransitionStarted) {\n      mPicture = null;"
  ],
  [
    "    super.onDetachedFromWindow();",
    "    super.onDetachedFromWindow();\n    mPicture = null;"
  ],
  [
    "    super.onDraw(canvas);",
    "    super.onDraw(canvas);\n    // Register definitions before deciding whether bitmap-dependent effects require fallback.\n    for (int i = 0; i < getChildCount(); i++) {\n      View child = getChildAt(i);\n      if (child instanceof VirtualView) ((VirtualView) child).saveDefinition();\n    }\n    if (canvas.isHardwareAccelerated() && getWidth() > 0 && getHeight() > 0\n        && toDataUrlTask == null && mDefinedFilters.isEmpty() && mDefinedMasks.isEmpty()) {\n      if (mPicture == null) {\n        android.graphics.Picture recording = new android.graphics.Picture();\n        Canvas recorder = recording.beginRecording(getWidth(), getHeight());\n        android.os.Trace.beginSection(\"BH.SVG.picture:\" + getWidth() + \"x\" + getHeight());\n        try {\n          mCurrentBitmap = null;\n          drawChildren(recorder);\n        } finally {\n          recording.endRecording();\n          android.os.Trace.endSection();\n        }\n        mPicture = recording;\n      }\n      canvas.drawPicture(mPicture);\n      return;\n    }"
  ]
];
const groupPairs = [
  [
    "    if (mOpacity != 1) {\n      if (mLayerBitmap == null) {\n        mLayerBitmap =\n            Bitmap.createBitmap(canvas.getWidth(), canvas.getHeight(), Bitmap.Config.ARGB_8888);\n        mLayerCanvas = new Canvas(mLayerBitmap);\n      } else {\n        mLayerBitmap.recycle();\n        mLayerBitmap =\n            Bitmap.createBitmap(canvas.getWidth(), canvas.getHeight(), Bitmap.Config.ARGB_8888);\n        mLayerCanvas.setBitmap(mLayerBitmap);\n      }\n      // Copy current matrix from original canvas\n      mLayerCanvas.save();\n      mLayerCanvas.setMatrix(canvas.getMatrix());\n    } else {\n      mLayerCanvas = canvas;\n    }",
    "    // BH_SVG_PICTURE_GROUP: preserve whole-group alpha in the recording canvas.\n    int opacityLayer = mOpacity != 1 ? canvas.saveLayerAlpha(null, (int) (mOpacity * 255)) : -1;\n    mLayerCanvas = canvas;"
  ],
  [
    "    if (mOpacity != 1) {\n      // Restore copied canvas and temporary reset original canvas matrix to draw bitmap 1:1\n      mLayerCanvas.restore();\n      int saveCount = canvas.save();\n      canvas.setMatrix(null);\n      mLayerPaint.setAlpha((int) (mOpacity * 255));\n      if (mLayerBitmap != null) {\n        canvas.drawBitmap(mLayerBitmap, 0, 0, mLayerPaint);\n      }\n      canvas.restoreToCount(saveCount);\n    }",
    "    if (opacityLayer != -1) canvas.restoreToCount(opacityLayer);"
  ]
];
function strip(source, pairs, marker) {
  if (!source.includes(marker)) return source;
  for (const [before, after] of pairs) {
    if (!source.includes(after)) throw new Error('Review native SVG picture experiment after dependency changes');
    source = source.replace(after, before);
  }
  return source;
}
function apply(source, pairs) {
  for (const [before, after] of pairs) {
    if (!source.includes(before)) throw new Error('Review native SVG picture experiment after dependency changes');
    source = source.replace(before, after);
  }
  return source;
}
function stripPictureRoot(source) { return strip(source, rootPairs, 'BH_SVG_PICTURE:'); }
function configurePictureRoot(source, enabled) {
  const original = stripPictureRoot(source);
  return enabled ? apply(original, rootPairs) : original;
}
function configurePictureGroup(source, enabled) {
  const original = strip(source, groupPairs, 'BH_SVG_PICTURE_GROUP:');
  if (createHash('sha256').update(original).digest('hex') !== '95ccce4c4ebaa19c1189f3a89dc677f0497bc9f85e23060341f226a45baf78e7') throw new Error('Review SVG group source before recording');
  return enabled ? apply(original, groupPairs) : original;
}
module.exports = { stripPictureRoot, configurePictureRoot, configurePictureGroup };
