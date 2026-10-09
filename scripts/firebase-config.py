"""Download client configuration using an existing gcloud login; never print credentials.

No account creation, billing, API enablement or permission grants are performed.
"""
import base64
import json
import pathlib
import subprocess
import ssl
import urllib.request
import urllib.error

token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
def get(path):
    req = urllib.request.Request('https://firebase.googleapis.com/v1beta1/' + path,
                                 headers={'Authorization': 'Bearer ' + token, 'x-goog-user-project': path.split('/')[1]})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl.create_default_context(cafile="/etc/ssl/cert.pem")) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(error.read().decode())

for environment in ['production', 'test']:
    project = 'projects/bottle-harmony-' + environment
    for platform, filename in [('androidApps', 'google-services.json'), ('iosApps', 'GoogleService-Info.plist')]:
        apps = get(project + '/' + platform).get('apps', [])
        for app in apps:
            package = app.get('packageName', app.get('bundleId'))
            if package != 'com.bottleharmony.app':
                continue
            config = get(app['name'] + '/config')
            path = pathlib.Path('config/firebase') / environment / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(base64.b64decode(config['configFileContents']))
            print(environment, platform, app['appId'], 'saved', path)
    print(environment, 'analytics', json.dumps(get(project + '/analyticsDetails')))
