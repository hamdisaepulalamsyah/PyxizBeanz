"""Sound design cue sheet for "Hukum Hotelling: Kenapa Indomaret & Alfamart Nempel?".

Timings match src/hotelling-law/story.ts (shots, cuts, and visual beats) and
public/hotelling-law/words.json (30 fps narration timestamps, 60.00 s total).
Mastered to -25.0 LUFS (-2 dBFS ceiling) under warm voice.wav (-18.0 LUFS).

Cue sheet (seconds = frame / 30):
  0-9       Night hook: punch-in, whip whoosh 0.15, magnet snap 0.533 (brand words collide),
            sub-tag / badge pops 1.13 and 1.73, door ding-dong 1.6, street hum + neon buzz.
  9-17      Push-in transition swell ending at 9.0, classroom room tone, ticks, ping, creak.
  16.5-49   Beach: ocean waves + sea breeze bed, faint laughter (18.5/26/33.5/44), ice-cream
            bell (17.6/30.5/37.6/45), sand cart wheels (30.5-35.33, 37.5-41.33, 39.5-41.33),
            magnet snap when the carts meet at 41.33.
  48.75-49  Whip-pan whoosh peaking at 49.0 into the city; street hum + neon buzz 49-60,
            door ding-dong 51.5, outro swell looping back to the opening.
  Sticker pops at f116 196 300 410 560 840 1010 1170 1330 1520; magnet snap at +8 frames
  for the magnetic ones (f116, f1330, f1520).
A warm harmonic bed changes chords at each section boundary.
"""

from sfx.cikajang_synth import (
    chip_pop,
    clock_tick,
    crowd_murmur,
    dusk_crickets,
    exclaim_ping,
    flash_shimmer,
    footsteps_soil,
    macro_punch_in,
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
from sfx.hotelling_synth import (
    cart_wheels_sand,
    distant_laughter,
    door_dingdong,
    icecream_bell,
    magnet_snap,
    neon_buzz,
    night_street_hum,
    ocean_waves,
    sea_breeze,
    whip_whoosh,
)

DURATION = 60.00
OUT = "public/hotelling-law/sfx.wav"
VOICE = "public/hotelling-law/voice.wav"
TARGET_LUFS = -25.0
CEILING_DB = -2.0


def build(mix):
    # --- Shot 1: Street Hook (0.00 - 9.00 s) - brand words collide with a magnetic snap at f16
    mix.put(0.00, macro_punch_in(1.2), gain=0.70, pan=0.0)
    mix.put(0.15, whip_whoosh(0.45), gain=0.55, pan=0.0)
    mix.put(0.35, spark_twinkle(0.8), gain=0.60, pan=0.25)
    mix.put(16 / 30, magnet_snap(), gain=0.80, pan=0.0)
    mix.put(34 / 30, chip_pop(), gain=0.40, pan=-0.2)  # sub-tag
    mix.put(52 / 30, chip_pop(), gain=0.40, pan=0.2)  # "Hukum Hotelling 1929" badge
    mix.put(1.60, door_dingdong(), gain=0.55, pan=-0.25)
    mix.put(3.80, crowd_murmur(5.0, fc=420, busy=0.4), gain=0.16, pan=0.15)
    mix.put(6.20, spark_twinkle(0.6), gain=0.50, pan=-0.2)

    # Night city ambience at both ends (the end flows into the start when looped)
    for t0, d in ((0.0, 9.0), (49.0, 11.0)):
        mix.put(t0, night_street_hum(d), gain=0.30, pan=0.0)
        mix.put(t0, neon_buzz(d), gain=0.20, pan=0.15)

    # --- Shot 2: Classroom Theory (9.00 - 17.00 s) - push-in zoom
    mix.put(8.30, xfade_swell(0.7), gain=0.50, pan=0.0)  # soft rise ending at 9.0
    mix.put(9.20, room_tone(7.8, fc=280), gain=0.25, pan=0.0)
    mix.put(10.50, clock_tick(count=5, interval=0.8, freq=2200), gain=0.45, pan=0.2)
    mix.put(13.20, exclaim_ping(0.45), gain=0.68, pan=0.2)
    mix.put(15.40, wood_creak(0.35), gain=0.40, pan=-0.15)

    # --- Beach world (16.5 - 49.0 s)
    mix.put(16.50, ocean_waves(32.5), gain=0.34, pan=0.0)
    mix.put(16.50, sea_breeze(32.5), gain=0.22, pan=0.0)
    for t, p in ((18.5, -0.5), (26.0, 0.5), (33.5, -0.3), (44.0, 0.4)):
        mix.put(t, distant_laughter(2.2), gain=0.20, pan=p)
    for t, p in ((17.6, 0.1), (30.5, -0.2), (37.6, 0.3), (45.0, 0.1)):
        mix.put(t, icecream_bell(2), gain=0.30, pan=p)
    mix.put(17.80, priangan_birds(12.0, density=0.5), gain=0.14, pan=0.25)
    mix.put(19.50, footsteps_soil(count=6, tempo=0.38), gain=0.40, pan=-0.3)
    mix.put(24.00, spark_twinkle(0.7), gain=0.50, pan=0.3)
    mix.put(27.50, speed_lines_swish(0.35), gain=0.45, pan=0.0)
    mix.put(30.25, speed_lines_swish(0.4), gain=0.60, pan=0.0)
    # Wooden cart wheels on sand
    mix.put(30.50, cart_wheels_sand(4.83), gain=0.40, pan=-0.35)
    mix.put(37.50, cart_wheels_sand(3.83), gain=0.40, pan=0.35)
    mix.put(39.50, cart_wheels_sand(1.83), gain=0.30, pan=-0.15)
    mix.put(34.20, sweat_drop(0.5), gain=0.70, pan=0.35)
    mix.put(35.80, exclaim_ping(0.45), gain=0.65, pan=0.3)
    mix.put(37.40, flash_shimmer(0.9), gain=0.70, pan=0.0)
    # Carts meet at f1240 (41.33 s)
    mix.put(41.00, macro_punch_in(1.0), gain=0.55, pan=0.0)
    mix.put(41.33, magnet_snap(), gain=0.90, pan=0.0)
    mix.put(41.40, spark_twinkle(0.8), gain=0.65, pan=0.0)
    mix.put(43.50, clock_tick(count=6, interval=0.6, freq=2500), gain=0.45, pan=0.0)
    mix.put(46.80, station_chime(), gain=0.45, pan=0.0)

    # Whip-pan beach -> city peaking at 49.0 s (f1470)
    mix.put(48.75, whip_whoosh(0.357), gain=0.75, pan=0.0)

    # --- Shot 6: City Loop Payoff (49.0 - 60.0 s)
    mix.put(49.25, chip_pop(), gain=0.40, pan=-0.2)
    mix.put(49.30, room_tone(10.7, fc=240), gain=0.20, pan=0.0)
    mix.put(49.80, dusk_crickets(10.0, rate=3.5), gain=0.18, pan=-0.25)
    mix.put(51.50, door_dingdong(), gain=0.58, pan=0.2)
    mix.put(54.20, spark_twinkle(0.9), gain=0.65, pan=0.0)
    mix.put(58.50, xfade_swell(1.4), gain=0.60, pan=0.0)  # swell loops into the opening

    # --- Keyword sticker pop-ins (+ magnet snap at start + 8 frames for the magnetic ones)
    for i, f in enumerate((116, 196, 300, 410, 560, 840, 1010, 1170, 1330, 1520)):
        mix.put(f / 30, chip_pop(), gain=0.45, pan=-0.15 if i % 2 else 0.15)
    for f in (116, 1330, 1520):
        mix.put((f + 8) / 30, magnet_snap(), gain=0.45, pan=0.0)

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
