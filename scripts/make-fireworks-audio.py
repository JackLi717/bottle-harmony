"""Original deterministic synthesized fireworks. No recordings or external assets.

Timing mirrors src/art/fireworkPhysics.ts: .18 s lead-in, .86 s ascent,
.64 s between shells, 2.6 s ember lifetime. Mono PCM at 22.05 kHz.
Run from the repository root with python3 scripts/make-fireworks-audio.py.
"""
import math
from pathlib import Path
import random
import struct
import wave

RATE = 22050
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)


def shell(seed):
    rng = random.Random(seed)
    samples = [0.0] * int(3.46 * RATE)
    low, phase = 0.0, 0.0
    for i in range(len(samples)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low += .09 * (noise - low)
        if t < .86:
            envelope = math.sin(math.pi * t / .86) ** .7
            phase += 2 * math.pi * (380 + 760 * t / .86) / RATE
            samples[i] = envelope * (.08 * noise + .075 * low + .018 * math.sin(phase))
        else:
            b = t - .86
            attack = min(1, b * 180)
            samples[i] = attack * (.26 * noise * math.exp(-b * 11) + .46 * low * math.exp(-b * 4.8) + .08 * math.sin(2 * math.pi * 72 * b) * math.exp(-b * 8))
    # Sparse fading crackles from the falling embers.
    for _ in range(48):
        start = .94 + rng.random() * 1.8
        amplitude = .05 * (1 - (start - .94) / 2.5)
        offset = int(start * RATE)
        for j in range(int(.025 * RATE)):
            samples[offset + j] += amplitude * rng.uniform(-1, 1) * math.exp(-j / RATE * 160)
    # Quiet delayed reflections rather than a dry electronic click.
    dry = samples[:]
    for delay, gain in [(.085, .14), (.18, .085), (.29, .045)]:
        offset = int(delay * RATE)
        for i in range(offset, len(samples)):
            samples[i] += gain * dry[i - offset]
    return samples


for count in range(2, 6):
    duration = .18 + (count - 1) * .64 + .86 + 2.6
    mix = [0.0] * math.ceil(duration * RATE)
    for index in range(count):
        offset = round((.18 + index * .64) * RATE)
        for j, sample in enumerate(shell(700 + index)):
            if offset + j < len(mix):
                mix[offset + j] += sample
    peak = max(abs(sample) for sample in mix)
    gain = min(1, .65 / peak)
    pcm = b''.join(struct.pack('<h', round(sample * gain * 32767)) for sample in mix)
    with wave.open(str(OUT / f'fireworks-{count}.wav'), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(pcm)
    print(f'{count} shells: {duration:.2f} s, peak {peak * gain:.3f}')
