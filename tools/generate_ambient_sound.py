"""Generate a loopable courtyard ambient bed (water + birds) for pre-game screens."""

import logging
import math
import random
import wave
from pathlib import Path


RATE = 22_050
DURATION = 48
OUTPUT = Path(__file__).resolve().parents[1] / "backend/static/assets/audio/analects-calm-ambient.wav"
LOG_FILE = Path(__file__).resolve().parents[2] / "log" / "generate_ambient_sound.log"


def bird_chirp(start: float, f0: float, f1: float, length: float, gain: float, samples: list[float]) -> None:
    begin = int(start * RATE)
    end = min(len(samples), int((start + length) * RATE))
    phase = 0.0
    for index in range(begin, end):
        t = (index - begin) / RATE
        freq = f0 + (f1 - f0) * (t / length)
        phase += math.tau * freq / RATE
        envelope = math.exp(-t * 16) * min(1.0, t / 0.012)
        samples[index] += gain * envelope * (math.sin(phase) + 0.3 * math.sin(2 * phase))


def add_birds(samples: list[float]) -> None:
    cursor = 2.0
    while cursor < DURATION - 2.5:
        cursor += random.uniform(1.4, 4.0)
        if cursor >= DURATION - 2.5:
            break
        kind = random.random()
        if kind < 0.45:
            bird_chirp(cursor, random.uniform(2200, 2600), random.uniform(1500, 1900), 0.18, 0.26, samples)
        elif kind < 0.75:
            bird_chirp(cursor, random.uniform(1900, 2200), random.uniform(2800, 3400), 0.22, 0.22, samples)
        else:
            bird_chirp(cursor, random.uniform(2600, 3000), random.uniform(2100, 2400), 0.28, 0.20, samples)
        if random.random() < 0.4:
            bird_chirp(cursor + random.uniform(0.15, 0.3), random.uniform(2400, 2900), random.uniform(1800, 2200), 0.16, 0.18, samples)


def main() -> None:
    random.seed(20260811)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=str(LOG_FILE), level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    samples = [0.0] * (RATE * DURATION)
    add_birds(samples)

    fade = int(RATE * 1.5)
    for index in range(fade):
        t = index / fade
        samples[index] = samples[index] * (1 - t) + samples[len(samples) - fade + index] * t
    peak = max(max(samples), -min(samples), 0.001)
    frames = bytearray()
    for value in samples:
        sample = max(-1.0, min(1.0, value / peak * 0.45))
        frames.extend(int(sample * 32767).to_bytes(2, "little", signed=True))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(frames)
    message = f"generated {OUTPUT} ({DURATION}s, {OUTPUT.stat().st_size} bytes)"
    print(message)
    logging.info(message)


if __name__ == "__main__":
    main()
