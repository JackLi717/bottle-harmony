"""Build the CC0 recorded-water audition palette. Requires ffmpeg.

Public HQ previews live in builds/pour-recordings/{family}.mp3; source URLs and
cut positions are versioned below. These are editorial prototypes, not measured
recordings of our fifteen virtual vessels or calibrated receiving fill levels.
No synthesis, pitch shifting, looping or time stretching is used.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
SECONDS = 1.9 * (.72 + .025 - .34)
SOURCES = [
    ('neck', 'JohnsonBrandEditing', 173930, '3229685', 'Water Pour', [1.35, 2.4, 4.2], 'Water poured into a glass; baseline used by the previous build.'),
    ('flask', 'j1987', 335759, '367313', 'water_bottle_pour_out.wav', [.12, 1.05, 2.3], 'Water bottle pouring into other water; proxy, not a recorded glass flask.'),
    ('slender', 'DenysFontanarosa', 579752, '329215', 'Pouring water in a glass', [.18, .9, 1.45], 'Close recording of water into a glass; proxy for a slender open vessel.'),
    ('straight', 'ahamirikia', 710550, '15407943', 'Pouring water into a glass', [.55, 1.35, 2.3], 'Water into a glass, recorded with NT USB mini.'),
    ('bowl', 'Rudmer_Rotteveel', 700352, '4921277', 'Water pouring into glass bowl 01', [.55, 1.45, 2.45], 'Water into a glass bowl; proxy for deep bowl stemware.'),
    ('shallow', 'The_Runner_01', 554444, '4688703', 'Pouring Water into a Glass Bowl.wav', [2.6, 5.3, 8.5], 'Water from a bottle into a glass bowl; proxy, bowl depth unspecified.'),
]

manifest = {'version': 'recorded-water-audition-v1', 'durationSeconds': round(SECONDS * RATE) / RATE,
    'sampleRate': RATE, 'license': 'CC0-1.0',
    'status': 'Audition prototypes; fill bands use different natural recording excerpts, not measured fill heights.',
    'processing': 'mono 22050 Hz PCM16; highpass 90 Hz, lowpass 7500 Hz; 12/30 ms fades; RMS target .11, peak cap .72; no pitch or time change',
    'sources': [], 'clips': []}
outdir = ROOT / 'assets/audio/pour'
outdir.mkdir(exist_ok=True)
for family, author, sound_id, uploader, title, offsets, note in SOURCES:
    source = ROOT / f'builds/pour-recordings/{family}.mp3'
    manifest['sources'].append({'family': family, 'author': author, 'title': title,
        'page': f'https://freesound.org/people/{author}/sounds/{sound_id}/',
        'preview': f'https://cdn.freesound.org/previews/{sound_id // 1000}/{sound_id}_{uploader}-hq.mp3',
        'license': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'note': note})
    for band, offset in zip(['low', 'mid', 'high'], offsets):
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(offset), '-i', str(source),
            '-t', str(SECONDS), '-ac', '1', '-ar', str(RATE), '-af', 'highpass=f=90,lowpass=f=7500', '-f', 's16le', 'pipe:1'])
        samples = array.array('h', raw)
        length = round(SECONDS * RATE)
        if len(samples) < length:
            raise ValueError(f'{family}-{band} is shorter than the visible stream')
        values = [v / 32768 * min(1, i / (RATE * .012), (length - 1 - i) / (RATE * .03)) for i, v in enumerate(samples[:length])]
        rms = math.sqrt(sum(v * v for v in values) / length)
        peak = max(abs(v) for v in values)
        if rms < .0001:
            raise ValueError(f'{family}-{band} contains insufficient recorded sound')
        gain = min(.11 / rms, .72 / peak)
        pcm = array.array('h', [round(v * gain * 32767) for v in values])
        output = outdir / f'{family}-{band}.wav'
        with wave.open(str(output), 'wb') as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(RATE)
            audio.writeframes(pcm.tobytes())
        manifest['clips'].append({'id': f'{family}-{band}', 'sourceFamily': family, 'offsetSeconds': offset,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'peak': peak * gain, 'rms': rms * gain})
(outdir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Created {len(manifest["clips"])} recorded clips; {length / RATE:.6f}s each.')
