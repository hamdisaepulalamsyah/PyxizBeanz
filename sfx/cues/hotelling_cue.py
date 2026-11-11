"""Sound design cue sheet for "Hukum Hotelling: Kenapa Indomaret & Alfamart Nempel?".

Timings match src/hotelling-law/story.ts (shots, cuts, and visual beats) and
public/hotelling-law/words.json (30 fps narration timestamps, 60.00 s total).
Mastered to -25.0 LUFS (-2 dBFS ceiling) under warm voice.wav (-18.0 LUFS).
"""

from sfx.cikajang_synth import (
    chip_pop,
    clock_tick,
    crowd_murmur,
    dip_whoosh,
    dusk_crickets,
    exclaim_ping,
    flash_shimmer,
    footsteps_soil,
    gear_ratchet,
    macro_punch_in,
    mountain_wind,
    nostalgia_bed,
    priangan_birds,
    room_tone,
    spark_twinkle,
    speed_lines_swish,
    station_chime,
    sweat_drop,
    wood_creak,
    xfade_swell,
)

DURATION = 60.00
OUT = "public/hotelling-law/sfx.wav"
VOICE = "public/hotelling-law/voice.wav"
TARGET_LUFS = -25.0
CEILING_DB = -2.0


def build(mix):
    # Shot 1: Street Hook (0.00 - 9.00 s / f0 - f270) - Night city neon & minimarket door chime
    mix.put(0.00, macro_punch_in(1.2), gain=0.85, pan=0.0)
    mix.put(0.18, speed_lines_swish(0.4), gain=0.70, pan=0.0)
    mix.put(0.35, spark_twinkle(0.8), gain=0.72, pan=0.25)
    mix.put(0.50, chip_pop(), gain=0.45, pan=-0.2)
    # Minimarket door bell chime (ding-dong / station chime flavor)
    mix.put(1.60, station_chime(), gain=0.55, pan=-0.25)
    mix.put(0.00, room_tone(9.0, fc=220), gain=0.22, pan=0.0)
    mix.put(3.80, crowd_murmur(5.0, fc=420, busy=0.4), gain=0.18, pan=0.15)
    mix.put(6.20, spark_twinkle(0.6), gain=0.55, pan=-0.2)

    # Shot 2: Classroom Theory (9.00 - 17.00 s / f270 - f510) - Academic slate, chalkboard, 1929 tick
    mix.put(8.85, xfade_swell(0.8), gain=0.70, pan=0.0)
    mix.put(9.10, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(9.20, room_tone(7.8, fc=280), gain=0.25, pan=0.0)
    mix.put(10.50, clock_tick(count=5, interval=0.8, freq=2200), gain=0.45, pan=0.2)
    mix.put(13.20, exclaim_ping(0.45), gain=0.68, pan=0.2)
    mix.put(15.40, wood_creak(0.35), gain=0.40, pan=-0.15)

    # Shot 3: Beach Setup (17.00 - 30.33 s / f510 - f910) - Tropical beach, ocean breeze & sea birds
    mix.put(16.80, dip_whoosh(0.7), gain=0.75, pan=0.0)
    mix.put(17.10, chip_pop(), gain=0.45, pan=-0.2)
    # Ocean wind / waves simulation
    mix.put(17.00, mountain_wind(13.3, fc=520, depth=0.65), gain=0.28, pan=0.0)
    mix.put(17.80, priangan_birds(12.0, density=0.5), gain=0.22, pan=0.25)
    mix.put(19.50, footsteps_soil(count=6, tempo=0.38), gain=0.45, pan=-0.3)
    mix.put(24.00, spark_twinkle(0.7), gain=0.60, pan=0.3)
    mix.put(27.50, speed_lines_swish(0.35), gain=0.55, pan=0.0)

    # Shot 4: Blue Advances (30.33 - 37.50 s / f910 - f1125) - Ice cream cart rolling forward, shock
    mix.put(30.25, speed_lines_swish(0.4), gain=0.72, pan=0.0)
    mix.put(30.40, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(30.50, mountain_wind(7.0, fc=480, depth=0.5), gain=0.22, pan=0.0)
    # Cart ratchet / rolling wheels
    mix.put(31.20, gear_ratchet(2.0, rate=9.0), gain=0.52, pan=-0.2)
    mix.put(34.20, sweat_drop(0.5), gain=0.75, pan=0.35)
    mix.put(35.80, exclaim_ping(0.45), gain=0.70, pan=0.3)

    # Shot 5: Red Reaction & Nash Equilibrium (37.50 - 49.17 s / f1125 - f1475) - Flash, clash in center
    mix.put(37.40, flash_shimmer(0.9), gain=0.85, pan=0.0)
    mix.put(37.60, chip_pop(), gain=0.48, pan=-0.2)
    mix.put(38.00, gear_ratchet(2.2, rate=12.0), gain=0.55, pan=0.25)
    mix.put(41.00, macro_punch_in(1.0), gain=0.80, pan=0.0)  # Met in the middle!
    mix.put(41.25, spark_twinkle(0.8), gain=0.75, pan=0.0)
    mix.put(43.50, clock_tick(count=6, interval=0.6, freq=2500), gain=0.48, pan=0.0)
    mix.put(46.80, station_chime(), gain=0.50, pan=0.0)

    # Shot 6: City Loop Payoff (49.17 - 60.00 s / f1475 - f1800) - Back to modern street night, loop setup
    mix.put(49.05, dip_whoosh(0.7), gain=0.72, pan=0.0)
    mix.put(49.25, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(49.30, room_tone(10.7, fc=240), gain=0.24, pan=0.0)
    mix.put(49.80, dusk_crickets(10.0, rate=3.5), gain=0.22, pan=-0.25)
    mix.put(51.50, station_chime(), gain=0.58, pan=0.2)
    mix.put(54.20, spark_twinkle(0.9), gain=0.70, pan=0.0)
    # Outro swell that naturally loops back into hook impact
    mix.put(58.50, xfade_swell(1.4), gain=0.65, pan=0.0)

    # Musical harmonic bed (Warm modern chords)
    sections = [
        (0.00,  ["D3", "A3", "E4", "F#4"], 0.65),
        (9.00,  ["B2", "F#3", "D4"],        0.40),
        (17.00, ["E2", "B2", "G3", "D4"],  0.60),
        (30.33, ["E2", "B2", "G3", "D4"],  0.55),
        (37.50, ["A2", "E3", "C#4", "E4"], 0.70),
        (49.17, ["D2", "A2", "D3", "F#3", "A3", "D4"], 0.65),
    ]

    def bed_vol(t):
        fade_in = min(1.0, t / 0.8)
        fade_out = min(1.0, max(0.0, (DURATION - t) / 1.5))
        return 0.16 * fade_in * fade_out

    left, right = nostalgia_bed(DURATION, sections, bed_vol)
    mix.put_stereo(0.0, left, right, gain=1.0)
