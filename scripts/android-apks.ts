import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const stem = `bottle-harmony-${config.version}-${config.android.versionCode}`;
const bundle = resolve(process.argv[2] ?? `builds/play/${stem}.aab`);
const bundletool = resolve('builds/tooling/bundletool.jar');
if (!existsSync(bundletool)) throw new Error('Place the official Google bundletool all.jar in builds/tooling/bundletool.jar.');
const properties = Object.fromEntries(readFileSync('builds/signing/upload.properties', 'utf8').split(/\r?\n/)
  .filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
mkdirSync('builds/play', { recursive: true });
const secrets = mkdtempSync('builds/signing/.bundletool-');
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
try {
  for (const key of ['storePassword', 'keyPassword']) {
    if (!properties[key]) throw new Error(`Missing signing ${key}.`);
    writeFileSync(`${secrets}/${key}`, properties[key], { mode: 0o600 });
  }
  const archive = resolve(`builds/play/${stem}.apks`);
  run(process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java', ['-jar', bundletool, 'build-apks',
    `--bundle=${bundle}`, `--output=${archive}`, '--mode=universal', '--overwrite',
    `--ks=${resolve('builds/signing/upload.jks')}`, `--ks-key-alias=${properties.keyAlias}`,
    `--ks-pass=file:${resolve(`${secrets}/storePassword`)}`, `--key-pass=file:${resolve(`${secrets}/keyPassword`)}`]);
  run('unzip', ['-q', '-o', archive, 'universal.apk', '-d', secrets]);
  copyFileSync(`${secrets}/universal.apk`, `builds/play/${stem}.apk`);
  chmodSync(`builds/play/${stem}.apk`, 0o644);
  console.log(`AAB-derived signed APK: ${resolve(`builds/play/${stem}.apk`)}`);
} finally {
  rmSync(secrets, { recursive: true, force: true });
}
