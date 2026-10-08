"""Inspect a signed Play artifact without modifying it or any native library."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('artifact', type=Path)
parser.add_argument('--report', type=Path)
parser.add_argument('--mapping', type=Path, help='Require this exact R8 mapping to be embedded in the AAB.')
parser.add_argument('--bundletool', type=Path, default=Path('builds/tooling/bundletool.jar'))
args = parser.parse_args()
sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'Library/Android/sdk')))
tools = sdk / 'build-tools/36.0.0'
info = json.loads(Path('app.json').read_text())['expo']
errors = []
native = []
warnings = []
mapping = None
with zipfile.ZipFile(args.artifact) as archive:
    mapping_name = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'
    if mapping_name in archive.namelist():
        mapping_blob = archive.read(mapping_name)
        mapping = {'embeddedPath': mapping_name, 'sha256': hashlib.sha256(mapping_blob).hexdigest(), 'bytes': len(mapping_blob)}
    if args.mapping:
        if args.artifact.suffix != '.aab':
            errors.append('Embedded R8 mapping verification requires an AAB.')
        elif mapping is None:
            errors.append('AAB does not contain an R8 mapping file.')
        elif args.mapping.read_bytes() != mapping_blob:
            errors.append('Saved R8 mapping does not match the mapping embedded in this AAB.')
    for name in archive.namelist():
        if not name.endswith('.so') or not any('/' + abi + '/' in name for abi in ['arm64-v8a', 'x86_64']):
            continue
        blob = archive.read(name)
        if blob[:5] != b'\x7fELF\x02' or blob[5] != 1:
            errors.append('Unsupported native ELF: ' + name)
            continue
        phoff = struct.unpack_from('<Q', blob, 32)[0]
        entry_size, count = struct.unpack_from('<HH', blob, 54)
        loads = []
        relro = []
        for index in range(count):
            ph = struct.unpack_from('<IIQQQQQQ', blob, phoff + index * entry_size)
            if ph[0] == 1:
                loads.append(ph[7])
            elif ph[0] == 0x6474e552:
                end = ph[3] + ph[6]
                relro.append((end, (end + 16383) // 16384 * 16384))
        # Bionic protects complete pages. A nonzero strict end modulo requires
        # examining the padding, not assuming that application data lies there.
        section_offset = struct.unpack_from('<Q', blob, 40)[0]
        section_size, section_count, string_index = struct.unpack_from('<HHH', blob, 58)
        overlaps = []
        if relro and section_count:
            sections = [struct.unpack_from('<IIQQQQIIQQ', blob, section_offset + index * section_size) for index in range(section_count)]
            strings_section = sections[string_index]
            strings = blob[strings_section[4]:strings_section[4] + strings_section[5]]
            for section in sections:
                if section[2] & 3 == 3 and section[5] and any(section[3] < end and section[3] + section[5] > start for start, end in relro):
                    overlaps.append(strings[section[0]:].split(b'\0', 1)[0].decode())
        elif any(start != end for start, end in relro):
            overlaps.append('Unknown: no section table to inspect')
        row = {'library': name, 'loadAligned': bool(loads) and min(loads) >= 16384, 'relroAligned': all(start == end for start, end in relro), 'relroWritablePaddingSections': overlaps}
        native.append(row)
        if not row['loadAligned'] or overlaps:
            errors.append('16 KB alignment unresolved: ' + name)
        elif not row['relroAligned']:
            warnings.append('Strict RELRO end formula is not aligned, with no writable allocated sections in the rounded padding: ' + name + '. Verify runtime with 16 KB compatibility fallback disabled.')

def command(arguments):
    return subprocess.check_output([str(value) for value in arguments], text=True, stderr=subprocess.STDOUT)

if args.artifact.suffix == '.apk':
    certificate = command([tools / 'apksigner', 'verify', '--print-certs', args.artifact])
    manifest = command([tools / 'aapt', 'dump', 'badging', args.artifact])
    permissions = command([tools / 'aapt', 'dump', 'permissions', args.artifact])
    command([tools / 'zipalign', '-c', '-P', '16', '4', args.artifact])
    if "targetSdkVersion:'36'" not in manifest:
        errors.append('Unexpected target SDK; check the current Play requirement.')
    if f"name='{info['android']['package']}'" not in manifest or f"versionName='{info['version']}'" not in manifest:
        errors.append('Package or version differs from the release configuration.')
    if f"versionCode='{info['android']['versionCode']}'" not in manifest:
        errors.append('Unexpected versionCode.')
    if 'application-debuggable' in manifest:
        errors.append('APK is debuggable.')
else:
    java = Path(os.environ['JAVA_HOME']) / 'bin/java' if os.environ.get('JAVA_HOME') else 'java'
    keytool = Path(os.environ['JAVA_HOME']) / 'bin/keytool' if os.environ.get('JAVA_HOME') else 'keytool'
    certificate = command([keytool, '-printcert', '-jarfile', args.artifact])
    jarsigner = Path(os.environ['JAVA_HOME']) / 'bin/jarsigner' if os.environ.get('JAVA_HOME') else 'jarsigner'
    verification = command([jarsigner, '-J-Duser.language=en', '-verify', args.artifact])
    if 'jar verified.' not in verification:
        errors.append('AAB signature verification did not succeed.')
    manifest = command([java, '-jar', args.bundletool, 'dump', 'manifest', f'--bundle={args.artifact}'])
    permissions = manifest
    bundle_config = command([java, '-jar', args.bundletool, 'dump', 'config', f'--bundle={args.artifact}'])
    if 'PAGE_ALIGNMENT_16K' not in bundle_config:
        errors.append('AAB does not request 16 KB ZIP alignment.')
    if f'package="{info["android"]["package"]}"' not in manifest or f'android:versionName="{info["version"]}"' not in manifest:
        errors.append('Package or version differs from the release configuration.')
    if 'android:targetSdkVersion="36"' not in manifest:
        errors.append('Unexpected target SDK; check the current Play requirement.')
    if 'android:allowBackup="false"' not in manifest:
        errors.append('Public Android backup must be disabled as disclosed in the privacy policy.')
    if f'android:versionCode="{info["android"]["versionCode"]}"' not in manifest:
        errors.append('Unexpected versionCode.')
    if 'android:debuggable="true"' in manifest:
        errors.append('AAB is debuggable.')
if re.search(r'Android Debug|androiddebugkey', certificate, re.I):
    errors.append('The artifact uses an Android debug signing key.')
for permission in ['INTERNET', 'ACCESS_NETWORK_STATE', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'SYSTEM_ALERT_WINDOW', 'RECORD_AUDIO', 'AD_ID', 'ACCESS_FINE_LOCATION', 'CAMERA', 'READ_CONTACTS']:
    if re.search(r'(?:android|gms)\.permission\.' + permission + r'[\'\"]', permissions):
        errors.append('Unexpected public-game permission: ' + permission)
report = {'artifact': str(args.artifact.resolve()), 'sha256': hashlib.sha256(args.artifact.read_bytes()).hexdigest(), 'mapping': mapping, 'nativeLibraries': native, 'certificate': certificate.strip(), 'errors': errors, 'warnings': warnings, 'staticChecksPassed': not errors, 'strictRelroChecklistPassed': all(row['relroAligned'] for row in native), 'runtime16KBTestRequired': True}
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'artifact': str(args.artifact), 'libraries': len(native), 'sha256': report['sha256'], 'errors': errors, 'relroPaddingWarnings': len(warnings)}, indent=2))
sys.exit(1 if errors else 0)
