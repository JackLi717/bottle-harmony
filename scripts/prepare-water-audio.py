"""Trim a CC0 water recording to the existing visible-flow interval, without synthesis.

Source: JohnsonBrandEditing, Water Pour (Freesound 173930, CC0 1.0).
Download its public HQ preview into builds/water-pour-original.mp3, then run this
script from the repository root. Requires ffmpeg; the app uses only the output WAV.
"""
import array
import hashlib
import math
from pathlib import Path
import subprocess
import wave

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'builds' / 'water-pour-original.mp3'
RATE = 22050
SECONDS = 1.9 * (.72 + .025 - .34)
raw = subprocess.check_output(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', '1.35', '-i', str(SOURCE),
    '-t', str(SECONDS), '-ac', '1', '-ar', str(RATE), '-af', 'highpass=f=90,lowpass=f=7500', '-f', 's16le', 'pipe:1'])
samples = array.array('h', raw)
length = round(SECONDS * RATE)
samples = samples[:length]
if len(samples) < length:
    raise ValueError('Recording is shorter than the visible flow')
# Smooth the recorded stream at either end; do not add tones, whistles or synthetic noise.
values = [value / 32768 * min(1, i / (RATE * .012), (length - 1 - i) / (RATE * .03)) for i, value in enumerate(samples)]
rms = math.sqrt(sum(value * value for value in values) / length)
peak = max(abs(value) for value in values)
gain = min(.11 / rms, .72 / peak)
pcm = array.array('h', [round(value * gain * 32767) for value in values])
output = ROOT / 'assets' / 'audio' / 'water-pour.wav'
with wave.open(str(output), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(RATE)
    audio.writeframes(pcm.tobytes())
print(f'{length / RATE:.6f} seconds, recorded water, peak {peak * gain:.3f}, RMS {rms * gain:.3f}')
print('Source SHA-256:', hashlib.sha256(SOURCE.read_bytes()).hexdigest())
print('Output SHA-256:', hashlib.sha256(output.read_bytes()).hexdigest())
