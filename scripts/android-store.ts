import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apkOnly = process.argv.includes('--apk');
const env: NodeJS.ProcessEnv = { ...process.env, APP_VARIANT: 'store', ANALYTICS_ENV: 'production', EXPO_PUBLIC_INTERNAL_TOOLS: 'false', CI: '1', NODE_ENV: 'production' };
function run(command: string, args: string[], cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
if (config.extra.internalTools) throw new Error('Public baseline must disable internal tools.');
if (!existsSync('builds/signing/upload.properties')) throw new Error('Run npm run android:upload-key first.');
run(process.execPath, ['node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install']);
run('./gradlew', [apkOnly ? ':app:assembleRelease' : ':app:bundleRelease', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a', '--max-workers=3', '-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g'], resolve('android'));
mkdirSync('builds/play', { recursive: true });
const source = apkOnly ? 'android/app/build/outputs/apk/release/app-release.apk' : 'android/app/build/outputs/bundle/release/app-release.aab';
const output = `builds/play/bottle-harmony-${config.version}-${config.android.versionCode}.${apkOnly ? 'apk' : 'aab'}`;
copyFileSync(source, output);
console.log(`Store artifact: ${resolve(output)}`);
const mapping = 'android/app/build/outputs/mapping/release/mapping.txt';
if (!existsSync(mapping)) throw new Error('Store build did not produce an R8 mapping file.');
const mappingOutput = `builds/play/bottle-harmony-${config.version}-${config.android.versionCode}-mapping.txt`;
copyFileSync(mapping, mappingOutput);
console.log(`R8 mapping: ${resolve(mappingOutput)}`);
