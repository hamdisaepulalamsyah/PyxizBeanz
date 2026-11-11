"""Sound design cue sheet for "Misteri Jam Gadang: Kenapa Angka 4 Tertulis IIII?".

Timings match src/jam-gadang/story.ts (shots, cuts, kicks, FX cues) and
public/jam-gadang/words.json (30 fps narration timestamps, 30.00 s total).
Mastered to -25.0 LUFS (-2 dBFS ceiling) under warm voice.wav (-19.0 LUFS).
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
    rail_hammer,
    room_tone,
    spark_twinkle,
    speed_lines_swish,
    station_chime,
    sweat_drop,
    wood_creak,
    xfade_swell,
)
from sfx.cues.cikajang_cue import duck_under_voice

DURATION = 30.00
OUT = "public/jam-gadang/sfx.wav"
VOICE = "public/jam-gadang/voice.wav"
TARGET_LUFS = -25.0
CEILING_DB = -2.0


def build(mix):
    # Shot 1: hook-dial (0.00 - 4.60 s)
    mix.put(0.00, macro_punch_in(1.4), gain=0.88, pan=0.0)
    mix.put(0.16, speed_lines_swish(0.35), gain=0.75, pan=0.0)
    mix.put(0.32, spark_twinkle(0.7), gain=0.74, pan=0.25)
    mix.put(0.42, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(0.00, mountain_wind(4.6, fc=360, depth=0.45), gain=0.22, pan=-0.1)
    mix.put(0.50, priangan_birds(3.8, density=0.65), gain=0.20, pan=0.25)
    mix.put(0.45, clock_tick(count=4, interval=1.0, freq=2150), gain=0.58, pan=0.0)
    mix.put(3.45, station_chime(), gain=0.44, pan=0.0)

    # Shot 2: bangun-1926 (4.60 - 11.07 s) — flash era jump
    mix.put(4.58, flash_shimmer(0.9), gain=0.85, pan=0.0)
    mix.put(4.68, chip_pop(), gain=0.48, pan=-0.2)
    mix.put(4.70, mountain_wind(6.4, fc=320, depth=0.4), gain=0.20, pan=0.1)
    mix.put(5.15, rail_hammer(1.1), gain=0.45, pan=-0.35)
    mix.put(6.45, wood_creak(0.45), gain=0.42, pan=0.25)
    mix.put(8.20, rail_hammer(1.1), gain=0.40, pan=0.35)
    mix.put(9.65, sweat_drop(0.45), gain=0.70, pan=0.3)

    # Shot 3: rumor-iv (11.07 - 14.73 s) — twilight plaza rumor & Dinda busts the myth
    mix.put(11.12, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(11.07, crowd_murmur(3.7, fc=480, busy=0.85), gain=0.25, pan=-0.1)
    mix.put(11.60, footsteps_soil(count=5, tempo=0.36), gain=0.52, pan=0.1)
    mix.put(13.10, speed_lines_swish(0.35), gain=0.72, pan=0.0)
    mix.put(13.20, exclaim_ping(0.5), gain=0.78, pan=0.2)

    # Shot 4: mesin-cutaway (14.73 - 19.27 s) — xfade into Rotterdam brass clockwork
    mix.put(14.55, xfade_swell(0.9), gain=0.78, pan=0.0)
    mix.put(14.80, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(14.73, room_tone(4.6, fc=240), gain=0.28, pan=0.0)
    mix.put(14.95, gear_ratchet(1.6, rate=11.0), gain=0.48, pan=-0.2)
    mix.put(15.20, clock_tick(count=8, interval=0.5, freq=2650), gain=0.58, pan=0.15)
    mix.put(16.90, spark_twinkle(0.7), gain=0.68, pan=-0.25)
    mix.put(17.50, gear_ratchet(1.4, rate=14.0), gain=0.44, pan=0.2)

    # Shot 5: simetri-viii (19.27 - 23.40 s) — daylight dial symmetry
    mix.put(19.32, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(19.35, mountain_wind(4.0, fc=400, depth=0.35), gain=0.20, pan=0.0)
    mix.put(21.15, speed_lines_swish(0.35), gain=0.68, pan=0.0)
    mix.put(21.25, station_chime(), gain=0.54, pan=0.0)

    # Shot 6: seimbang-senja (23.40 - 30.00 s) — warm dusk finale
    mix.put(23.15, dip_whoosh(0.6), gain=0.72, pan=0.0)
    mix.put(23.48, chip_pop(), gain=0.45, pan=-0.2)
    mix.put(23.50, dusk_crickets(6.5, rate=3.8), gain=0.26, pan=0.25)
    mix.put(23.70, priangan_birds(5.5, density=0.45), gain=0.18, pan=-0.25)
    mix.put(26.95, spark_twinkle(0.7), gain=0.74, pan=0.15)
    mix.put(28.05, station_chime(), gain=0.52, pan=0.0)

    sections = [
        (0.0,   ["D3", "A3", "E4", "F#4"], 0.72),
        (4.60,  ["B2", "F#3", "D4"],        0.35),
        (11.07, ["E2", "B2", "G3", "D4"],  0.52),
        (14.73, ["A2", "E3", "C#4", "E4"], 0.78),
        (19.27, ["D3", "A3", "F#4", "A4"], 0.85),
        (23.40, ["D2", "A2", "D3", "F#3", "A3", "D4"], 0.68),
    ]

    def bed_vol(t):
        fade_in = min(1.0, t / 0.8)
        fade_out = min(1.0, max(0.0, (DURATION - t) / 1.5))
        return 0.16 * fade_in * fade_out

    left, right = nostalgia_bed(DURATION, sections, bed_vol)
    mix.put_stereo(0.0, left, right, gain=1.0)
    duck_under_voice(mix, voice_path=VOICE, depth_db=-8.0)
