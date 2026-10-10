const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const packageName = 'com.bottleharmony.engineacceptance';

function acceptanceManifest(manifest, enabled) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  for (const kind of ['service', 'receiver']) application[kind] = (application[kind] || []).filter(item => !item.$['android:name'].startsWith(`${packageName}.EngineBenchmark`));
  if (!enabled) return manifest;
  manifest.manifest['uses-permission'] ||= [];
  if (!manifest.manifest['uses-permission'].some(item => item.$['android:name'] === 'android.permission.WAKE_LOCK')) manifest.manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.WAKE_LOCK' } });
  application.service.push({ $: { 'android:name': `${packageName}.EngineBenchmarkService`, 'android:exported': 'false' } });
  application.receiver.push({ $: { 'android:name': `${packageName}.EngineBenchmarkReceiver`, 'android:exported': 'true', 'android:permission': 'android.permission.DUMP' },
    'intent-filter': [{ action: [{ $: { 'android:name': `${packageName}.BENCHMARK` } }] }] });
  return manifest;
}

module.exports = function withEngineAcceptance(config, { enabled = false } = {}) {
  if (enabled && config.android?.package !== packageName) throw new Error('Headless engine acceptance requires the isolated application ID');
  config = withAndroidManifest(config, mod => { mod.modResults = acceptanceManifest(mod.modResults, enabled); return mod; });
  if (!enabled) return config;
  return withDangerousMod(config, ['android', async mod => {
    const folder = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'));
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'EngineBenchmarkService.java'), `package ${packageName};
import android.content.Intent;
import com.facebook.react.HeadlessJsTaskService;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
public final class EngineBenchmarkService extends HeadlessJsTaskService {
  @Override protected HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    if (intent == null) return null;
    String runId = intent.getStringExtra("runId");
    if (runId == null || !runId.matches("[a-zA-Z0-9_-]{1,64}")) return null;
    WritableMap data = Arguments.createMap(); data.putString("runId", runId);
    return new HeadlessJsTaskConfig("EngineAcceptanceBenchmark", data, 120000L, true);
  }
}
`);
    await fs.writeFile(path.join(folder, 'EngineBenchmarkReceiver.java'), `package ${packageName};
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.facebook.react.HeadlessJsTaskService;
public final class EngineBenchmarkReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (!"${packageName}.BENCHMARK".equals(intent.getAction())) return;
    String runId = intent.getStringExtra("runId");
    if (runId == null || !runId.matches("[a-zA-Z0-9_-]{1,64}")) return;
    context.startService(new Intent(context, EngineBenchmarkService.class).putExtra("runId", runId));
    HeadlessJsTaskService.acquireWakeLockNow(context);
  }
}
`);
    return mod;
  }]);
};
module.exports.acceptanceManifest = acceptanceManifest;
