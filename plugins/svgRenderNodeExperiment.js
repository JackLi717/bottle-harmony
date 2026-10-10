// Isolated API-29 hardware-recording experiment. No production configuration enables it.
const pairs = [
  ['  private @Nullable Bitmap mBitmap;', `  // BH_SVG_RENDER_NODE: lazy API-specific implementation keeps old Android verification separate.
  private @Nullable Object mRecordedNode;
  private boolean mRecordedDirty = true;
  @android.annotation.TargetApi(29)
  private static final class BHRenderNode {
    static Object draw(SvgView view, Canvas canvas, Object previous, boolean dirty) {
      android.graphics.RenderNode node = previous == null
          ? new android.graphics.RenderNode("BottleHarmonySvg") : (android.graphics.RenderNode) previous;
      if (dirty || !node.hasDisplayList()) {
        node.setPosition(0, 0, view.getWidth(), view.getHeight());
        node.setClipToBounds(true);
        Canvas recorder = node.beginRecording(view.getWidth(), view.getHeight());
        android.os.Trace.beginSection("BH.SVG.render-node:" + view.getWidth() + "x" + view.getHeight());
        try { view.drawChildren(recorder); }
        finally { node.endRecording(); android.os.Trace.endSection(); }
      }
      canvas.drawRenderNode(node);
      return node;
    }
    static void discard(Object previous) { ((android.graphics.RenderNode) previous).discardDisplayList(); }
  }
  private @Nullable Bitmap mBitmap;`],
  ['    if (!mRemovalTransitionStarted) {', '    if (!mRemovalTransitionStarted) {\n      mRecordedDirty = true;'],
  ['    super.onDetachedFromWindow();', `    super.onDetachedFromWindow();
    if (mRecordedNode != null && android.os.Build.VERSION.SDK_INT >= 29) BHRenderNode.discard(mRecordedNode);
    mRecordedNode = null;
    mRecordedDirty = true;`],
  ['    super.onDraw(canvas);', `    super.onDraw(canvas);
    for (int i = 0; i < getChildCount(); i++) {
      View child = getChildAt(i);
      if (child instanceof VirtualView) ((VirtualView) child).saveDefinition();
    }
    if (android.os.Build.VERSION.SDK_INT >= 29 && canvas.isHardwareAccelerated()
        && getWidth() > 0 && getHeight() > 0 && toDataUrlTask == null
        && mDefinedFilters.isEmpty() && mDefinedMasks.isEmpty()) {
      mCurrentBitmap = null;
      mRecordedNode = BHRenderNode.draw(this, canvas, mRecordedNode, mRecordedDirty);
      mRecordedDirty = false;
      return;
    }`],
];
function stripRenderNodeRoot(source) {
  if (!source.includes('BH_SVG_RENDER_NODE:')) return source;
  for (const [before, after] of pairs) {
    if (!source.includes(after)) throw new Error('Review native SVG RenderNode integration');
    source = source.replace(after, before);
  }
  return source;
}
function configureRenderNodeRoot(source, enabled) {
  const original = stripRenderNodeRoot(source);
  if (!enabled) return original;
  let result = original;
  for (const [before, after] of pairs) {
    if (!result.includes(before)) throw new Error('Review native SVG RenderNode integration');
    result = result.replace(before, after);
  }
  return result;
}
module.exports = { stripRenderNodeRoot, configureRenderNodeRoot };
