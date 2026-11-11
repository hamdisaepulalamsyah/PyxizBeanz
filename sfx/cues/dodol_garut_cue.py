"""Sound design & music cue sheet for "Kenapa Dodol Garut Awet 5 Bulan Tanpa Pengawet?".

Timings match src/dodol-garut/story.ts (60.00 s / 1800 frames @ 30 fps) and
public/dodol-garut/words.json. Mastered to -25.0 LUFS (-2 dBFS ceiling),
ducked -8 dB under voice.wav (-18 LUFS).
"""

import math
import random

from sfx.cikajang_synth import (
    _edge,
    _lowpass,
    _n,
    chip_pop,
    clock_tick,
    dip_whoosh,
    dusk_crickets,
    flash_shimmer,
    macro_punch_in,
    mountain_wind,
    nostalgia_bed,
    priangan_birds,
    room_tone,
    spark_twinkle,
    speed_lines_swish,
    sweat_drop,
    wicker_basket,
    wood_creak,
    xfade_swell,
)
from sfx.cues.cikajang_cue import duck_under_voice
from sfx.synth import SR, bandnoise, chime

TAU = 2 * math.pi

DURATION = 60.00
OUT = "public/dodol-garut/sfx.wav"
VOICE = "public/dodol-garut/voice.wav"
TARGET_LUFS = -25.0
CEILING_DB = -2.0


def wood_fire_crackle(dur, rate=7.0):
    """Warm hawu wood-stove crackle & low hearth rumble."""
    n = _n(dur)
    rumble = _lowpass(bandnoise(n, lambda _k: 170, q=0.7), 280)
    out = [0.24 * rumble[k] * _edge(k, n, 0.15, 0.25) for k in range(n)]
    pops = int(dur * rate)
    for _ in range(pops):
        t0 = random.uniform(0.05, max(0.06, dur - 0.08))
        k0 = int(t0 * SR)
        flen = min(int(0.032 * SR), n - k0)
        freq = random.uniform(1400, 3400)
        amp = random.uniform(0.18, 0.42)
        for j in range(flen):
            env = math.exp(-j / (0.006 * SR))
            out[k0 + j] += amp * env * (random.uniform(-1, 1) * 0.6 + 0.4 * math.sin(TAU * freq * j / SR))
    return out


def cauldron_simmer(dur, rate=5.5):
    """Thick viscous caramel dodol bubbling gently in a copper kancah."""
    n = _n(dur)
    out = [0.0] * n
    bubbles = int(dur * rate)
    for _ in range(bubbles):
        t0 = random.uniform(0.05, max(0.06, dur - 0.12))
        k0 = int(t0 * SR)
        f0 = random.uniform(160, 320)
        f1 = f0 * random.uniform(1.45, 2.1)
        blen = min(int(0.085 * SR), n - k0)
        amp = random.uniform(0.18, 0.35)
        phase = 0.0
        for j in range(blen):
            u = j / max(1, blen)
            freq = f0 + (f1 - f0) * (u ** 1.3)
            phase += TAU * freq / SR
            env = math.sin(math.pi * u) * math.exp(-u * 1.8)
            out[k0 + j] += amp * env * math.sin(phase)
    return _lowpass(out, 950)


def paddle_stir(dur, tempo=1.45):
    """Rhythmic heavy wooden pangaduk sweeping through thick caramel dodol."""
    n = _n(dur)
    out = [0.0] * n
    t = 0.1
    sn = _n(0.32)
    while t < dur - 0.35:
        k0 = int(t * SR)
        slen = min(sn, n - k0)
        noise = _lowpass(bandnoise(sn, lambda k: 220 + 280 * (k / max(1, sn)), q=0.8), 680)
        for j in range(slen):
            u = j / max(1, slen)
            env = math.sin(math.pi * u) ** 1.5
            out[k0 + j] += 0.42 * env * noise[j]
        t += 1.0 / tempo
    return out


def steam_hiss(dur):
    """Soft airy steam release rising from hot cauldron."""
    n = _n(dur)
    src = _lowpass(bandnoise(n, lambda _k: 2200, q=0.6), 3400)
    return [0.22 * src[k] * _edge(k, n, 0.12, 0.35) for k in range(n)]


def sugar_crystal_chime():
    """Crisp crystalline lock chime for osmosis/sugar crystal explanation."""
    return [0.42 * s for s in chime([1046.5, 1318.5, 1568.0], dur=0.9, tau=0.35)]


def build(mix):
    # Shot 1: hook-dodol (0.00 - 5.60 s)
    mix.put(0.00, macro_punch_in(1.4), gain=0.84, pan=0.0)
    mix.put(0.16, speed_lines_swish(0.35), gain=0.68, pan=0.0)
    mix.put(0.36, spark_twinkle(0.7), gain=0.72, pan=0.15)
    mix.put(0.45, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(0.20, room_tone(5.2, fc=260), gain=0.26, pan=0.0)
    mix.put(3.90, clock_tick(count=3, interval=0.5, freq=2200), gain=0.46, pan=0.2)

    # Shot 2: karsinah-1926 (5.60 - 18.07 s) — flash back to Garut 1926 kitchen
    mix.put(5.58, flash_shimmer(0.85), gain=0.82, pan=0.0)
    mix.put(5.72, chip_pop(), gain=0.44, pan=-0.2)
    mix.put(5.80, priangan_birds(11.8, density=0.6), gain=0.20, pan=-0.25)
    mix.put(5.80, mountain_wind(12.0, fc=340, depth=0.35), gain=0.18, pan=0.15)
    mix.put(8.20, wood_creak(0.45), gain=0.42, pan=-0.25)
    mix.put(9.60, wood_fire_crackle(8.2, rate=6.5), gain=0.38, pan=0.25)
    mix.put(10.0, cauldron_simmer(7.8, rate=4.5), gain=0.34, pan=0.25)
    mix.put(12.80, steam_hiss(1.4), gain=0.32, pan=0.22)

    # Shot 3: kancah-7jam (18.07 - 30.17 s) — intense 7-8 hr stirring + hawu stove
    mix.put(18.12, chip_pop(), gain=0.44, pan=-0.2)
    mix.put(18.10, wood_fire_crackle(12.0, rate=8.5), gain=0.44, pan=0.2)
    mix.put(18.15, cauldron_simmer(11.8, rate=6.0), gain=0.42, pan=0.0)
    mix.put(18.30, paddle_stir(11.5, tempo=1.4), gain=0.48, pan=-0.1)
    mix.put(20.10, steam_hiss(1.8), gain=0.36, pan=0.0)
    # "Berhenti sebentar saja, dasarnya gosong!" (~23.4 s)
    mix.put(23.38, speed_lines_swish(0.38), gain=0.72, pan=0.0)
    mix.put(23.60, sweat_drop(0.48), gain=0.68, pan=-0.25)
    mix.put(24.50, clock_tick(count=6, interval=0.5, freq=2450), gain=0.42, pan=0.2)

    # Shot 4: sains-gula (30.17 - 38.93 s) — xfade into osmosis cutaway
    mix.put(29.95, xfade_swell(0.9), gain=0.78, pan=0.0)
    mix.put(30.25, chip_pop(), gain=0.44, pan=-0.2)
    mix.put(30.30, room_tone(8.5, fc=210), gain=0.28, pan=0.0)
    mix.put(32.80, steam_hiss(2.0), gain=0.35, pan=-0.1)
    mix.put(36.05, sugar_crystal_chime(), gain=0.68, pan=0.1)
    mix.put(36.25, spark_twinkle(0.65), gain=0.62, pan=0.0)

    # Shot 5: picnic-1959 (38.93 - 50.87 s) — flash into 1950s -> Picnic 1959 reveal
    mix.put(38.90, flash_shimmer(0.85), gain=0.80, pan=0.0)
    mix.put(39.05, chip_pop(), gain=0.44, pan=-0.2)
    mix.put(39.50, wicker_basket(), gain=0.50, pan=-0.3)
    mix.put(42.90, chip_pop(), gain=0.42, pan=-0.2)
    mix.put(46.50, speed_lines_swish(0.35), gain=0.66, pan=0.0)
    mix.put(46.70, spark_twinkle(0.75), gain=0.76, pan=0.15)
    mix.put(46.80, sugar_crystal_chime(), gain=0.54, pan=0.0)

    # Shot 6: ekspor-payoff (50.87 - 60.00 s) — warm dusk Garut export & tasting finale
    mix.put(50.65, dip_whoosh(0.6), gain=0.72, pan=0.0)
    mix.put(50.95, chip_pop(), gain=0.44, pan=-0.2)
    mix.put(51.10, dusk_crickets(8.6, rate=3.6), gain=0.24, pan=0.25)
    mix.put(51.20, priangan_birds(7.8, density=0.4), gain=0.16, pan=-0.25)
    mix.put(51.40, cauldron_simmer(8.0, rate=3.8), gain=0.26, pan=-0.35)
    mix.put(54.80, wood_creak(0.45), gain=0.38, pan=0.2)
    mix.put(57.20, spark_twinkle(0.75), gain=0.68, pan=0.0)

    # Warm Sundanese-flavored harmonic bed following our 6 Color Script phases
    sections = [
        (0.00, ["D3", "A3", "E4", "F#4"], 0.72),
        (5.60, ["B2", "D3", "G3", "F#4"], 0.62),
        (18.07, ["E2", "B2", "G3", "D4"], 0.56),
        (30.17, ["A2", "E3", "C#4", "E4"], 0.76),
        (38.93, ["D3", "A3", "F#4", "A4"], 0.78),
        (50.87, ["D2", "A2", "D3", "F#3", "A3", "D4"], 0.72),
    ]

    def bed_vol(t):
        fade_in = min(1.0, t / 0.7)
        fade_out = min(1.0, max(0.0, (DURATION - t) / 1.6))
        return 0.16 * fade_in * fade_out

    left, right = nostalgia_bed(DURATION, sections, bed_vol)
    mix.put_stereo(0.0, left, right, gain=1.0)
    duck_under_voice(mix, voice_path=VOICE, depth_db=-8.0)
