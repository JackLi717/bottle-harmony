import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = resolve('builds/signing');
const keystore = resolve(directory, 'upload.jks');
const properties = resolve(directory, 'upload.properties');
if (existsSync(keystore) || existsSync(properties)) {
  if (!existsSync(keystore) || !existsSync(properties)) throw new Error('Incomplete signing material; restore the matching pair. Nothing was overwritten.');
  console.log('Existing upload key retained. Back up builds/signing securely outside this computer.');
} else {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString('hex');
  const keytool = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/keytool') : 'keytool';
  const result = spawnSync(keytool, ['-genkeypair', '-keystore', keystore, '-storetype', 'JKS', '-alias', 'bottle-harmony-upload', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', 'CN=Bottle Harmony Upload, O=Platon Games', '-storepass:env', 'BOTTLE_UPLOAD_PASSWORD', '-keypass:env', 'BOTTLE_UPLOAD_PASSWORD'], {
    env: { ...process.env, BOTTLE_UPLOAD_PASSWORD: password }, encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`keytool failed: ${result.stderr}`);
  writeFileSync(properties, `storePassword=${password}\nkeyPassword=${password}\nkeyAlias=bottle-harmony-upload\n`, { mode: 0o600 });
  chmodSync(keystore, 0o600);
  console.log('Upload key created in ignored builds/signing. Passwords were not printed. Back up this directory securely before uploading.');
}
