"""Generate the game's original, loopable calm pentatonic background music."""

from __future__ import annotations

import math
import random
import wave
from pathlib import Path


RATE = 22_050
DURATION = 48
OUTPUT = Path(__file__).resolve().parents[1] / "backend/static/assets/audio/analects-calm-bgm.wav"
NOTES = {"D4": 293.66, "F4": 349.23, "G4": 392.00, "A4": 440.00, "C5": 523.25, "D5": 587.33}


def pluck(freq: float, start: float, length: float, gain: float, samples: list[float]) -> None:
    begin = int(start * RATE)
    end = min(len(samples), int((start + length) * RATE))
    for index in range(begin, end):
        t = (index - begin) / RATE
        envelope = (1 - math.exp(-t * 45)) * math.exp(-t * 1.9)
        tone = math.sin(math.tau * freq * t) + 0.34 * math.sin(math.tau * freq * 2 * t) + 0.12 * math.sin(math.tau * freq * 3 * t)
        samples[index] += gain * envelope * tone


def pad(freq: float, samples: list[float]) -> None:
    for index in range(len(samples)):
        t = index / RATE
        wobble = 1 + 0.006 * math.sin(math.tau * 0.11 * t)
        samples[index] += 0.026 * (math.sin(math.tau * freq * wobble * t) + 0.45 * math.sin(math.tau * freq * 2 * t))


def main() -> None:
    random.seed(20260810)
    samples = [0.0] * (RATE * DURATION)
    for freq in (NOTES["D4"] / 2, NOTES["A4"] / 2, NOTES["D4"]):
        pad(freq, samples)
    motifs = (
        ("D4", "A4", "C5", "A4", "G4", "F4", "D4", "G4"),
        ("D4", "F4", "A4", "C5", "D5", "C5", "A4", "G4"),
        ("G4", "A4", "C5", "A4", "F4", "G4", "D4", "D4"),
    )
    for bar in range(24):
        motif = motifs[bar % len(motifs)]
        bar_start = bar * 2
        for beat, name in enumerate(motif):
            offset = beat * 0.25 + random.uniform(-0.018, 0.018)
            pluck(NOTES[name], bar_start + offset, 1.7, 0.09 if beat in (0, 4) else 0.065, samples)
        if bar % 2 == 0:
            pluck(NOTES[motif[0]] / 2, bar_start, 2.5, 0.055, samples)
    fade = int(RATE * 1.5)
    peak = max(max(samples), -min(samples), 0.001)
    frames = bytearray()
    for index, value in enumerate(samples):
        edge = min(1.0, index / fade, (len(samples) - 1 - index) / fade)
        sample = max(-1.0, min(1.0, value / peak * 0.6 * edge))
        frames.extend(int(sample * 32767).to_bytes(2, "little", signed=True))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(frames)
    print(f"generated {OUTPUT} ({DURATION}s, {OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
