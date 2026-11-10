"""Sound design cue sheet for "Sejarah Cikajang: Dua Angka di Pintu Stasiun".

Timings come from src/cikajang/story.ts (shot boundaries, cuts, kicks, flashes,
`fx` cues) and public/cikajang/words.json (narration word starts). Story beats
land on the frame the picture does; foley sits 0–2 frames ahead of the image.

Mastered to -26 LUFS integrated (ceiling -2 dBFS) because it plays alongside
public/cikajang/voice.wav (-20.8 LUFS): the narration stays about 5 LU on top,
the music bed sits under the foley, and nothing competes with Bagas's voice.
"""

from sfx.cikajang_synth import (
    carriage_rumble,
    chalk_scribble,
    chip_pop,
    clock_tick,
    conductor_whistle,
    crowd_murmur,
    dip_whoosh,
    ditutup_slam,
    dusk_crickets,
    exclaim_ping,
    flash_shimmer,
    fluorescent_hum,
    footsteps_soil,
    gear_ratchet,
    hen_cluck,
    insect_drone,
    ledger_pen,
    macro_punch_in,
    modern_station_air,
    mountain_wind,
    newspaper_open,
    nostalgia_bed,
    priangan_birds,
    rail_hammer,
    room_tone,
    spark_twinkle,
    speed_lines_swish,
    station_chime,
    sweat_drop,
    train_depart,
    train_idle_hiss,
    wicker_basket,
    wood_creak,
    xfade_swell,
    zzz_snore,
)
from sfx.persis_synth import steam_locomotive, steam_whistle
from sfx.synth import SR, envelope

import array
import math
import os
import wave

DURATION = 121.333
OUT = "public/cikajang/sfx.wav"
VOICE = "public/cikajang/voice.wav"
TARGET_LUFS = -26.0
CEILING_DB = -2.0
# Sidechain duck under the narration (skill: bed ≥ 6 dB under the voice; 8 dB here).
DUCK_DB = -8.0


def duck_under_voice(mix, voice_path=VOICE, depth_db=DUCK_DB, lookahead=0.06, attack=0.04, release=0.35):
    """Duck the whole SFX/music mix while the narrator speaks.

    Voice activity = 10 ms RMS above an adaptive threshold (same idea as
    tools/align_subtitles.py). The gain glides down `lookahead` s before each
    phrase (attack) and recovers slowly in pauses (release), so foley and the
    bed bloom between sentences and sit underneath every word.
    """
    if not os.path.exists(voice_path):
        print(f"warning: {voice_path} missing — skipping voice ducking")
        return
    with wave.open(voice_path, "rb") as wf:
        rate, ch, width, frames = wf.getframerate(), wf.getnchannels(), wf.getsampwidth(), wf.getnframes()
        raw = wf.readframes(frames)
    if width != 2:
        print("warning: voice is not 16-bit PCM — skipping ducking")
        return
    pcm = array.array("h")
    pcm.frombytes(raw)
    if ch > 1:
        pcm = array.array("h", pcm[::ch])
    hop = int(rate * 0.01)
    db = []
    for i in range(0, len(pcm) - hop + 1, hop):
        acc = 0
        for s in pcm[i:i + hop]:
            acc += s * s
        r = math.sqrt(acc / hop) / 32768.0
        db.append(20 * math.log10(r) if r > 1e-9 else -180.0)
    srt = sorted(db)
    floor, loud = srt[len(srt) // 10], srt[int(len(srt) * 0.95)]
    thr = max(floor + 10.0, loud - 30.0)
    active = [v > thr for v in db]
    look = int(lookahead / 0.01)
    # Gain per 10 ms hop with lookahead + attack/release smoothing.
    duck = 10 ** (depth_db / 20)
    a_att = 1 - math.exp(-0.01 / attack)
    a_rel = 1 - math.exp(-0.01 / release)
    hops = int(mix.duration / 0.01) + 2
    g, gains = 1.0, []
    for h in range(hops):
        speaking = any(active[j] for j in range(h, min(len(active), h + look + 1))) if h < len(active) else False
        target = duck if speaking else 1.0
        g += (target - g) * (a_att if target < g else a_rel)
        gains.append(g)
    for i in range(mix.n):
        x = i / SR / 0.01
        h = int(x)
        gi = gains[h] + (gains[min(h + 1, hops - 1)] - gains[h]) * (x - h)
        mix.left[i] *= gi
        mix.right[i] *= gi
    talk = sum(active) / max(1, len(active))
    print(f"Ducked SFX {depth_db:+.0f} dB under narration (voice active {talk * 100:.0f}% of the time, threshold {thr:.1f} dBFS)")

# Shot starts (seconds) from SHOTS in story.ts — 30 fps.
SHOT = {
    1: 0.0, 2: 8.0, 3: 18.0, 4: 28.0, 5: 38.0, 6: 47.0, 7: 56.0,
    8: 66.0, 9: 76.0, 10: 86.0, 11: 95.0, 12: 104.0, 13: 113.0,
}
CHIP = 10 / 30  # place/year chip pops 10 frames into each shot (shot 1: after the hook, 98 f)


def music(mix):
    """Warm nostalgic bed → cold drone in the 1980–82 crisis → warm again for 2022 and the question."""
    sections = [
        (0.0, ["D3", "F#3", "A3", "C#4"], 0.8),  # golden dusk: Dmaj7
        (8.0, ["B2", "D3", "F#3", "A3"], 0.7),  # mountain mist: Bm7
        (18.0, ["G3", "B3", "D4", "F#4"], 0.9),  # fields: Gmaj7
        (28.0, ["D3", "F#3", "A3", "E4"], 0.85),  # 1930 opening: Dadd9
        (38.0, ["A2", "E3", "A3", "C#4"], 0.9),  # Cibatu departure: A
        (47.0, ["G3", "B3", "D4", "F#4"], 0.9),  # carriage: Gmaj7
        (56.0, ["D3", "F#3", "A3", "C#4"], 0.8),  # 1935 heyday
        (61.0, ["B2", "F#3", "A3", "D4"], 0.55),  # 1947 war damage: Bm
        (66.0, ["E3", "G3", "B3", "D4"], 0.3),  # 1980s crisis: Em7, hollow
        (76.0, ["B2", "D3", "F#3", "A3"], 0.2),  # 1982 closure
        (86.0, ["E3", "A3", "B3"], 0.15),  # decades pass: open sus
        (95.0, ["G3", "B3", "D4", "E4"], 0.4),  # the carving still reads: G6
        (102.3, ["D3", "F#3", "A3", "C#4"], 0.85),  # "Tahun 2022": warm again
        (108.5, ["B2", "D3", "F#3", "A3"], 0.6),  # "...masih belum aktif"
        (113.0, ["G3", "B3", "D4", "F#4"], 0.9),  # twilight climax
        (118.4, ["E3", "A3", "B3", "D4"], 0.7),  # "Akankah...?" unresolved
    ]
    volume = envelope([
        (0.0, 0.0), (0.5, 0.0), (2.5, 0.45), (6.5, 0.9), (8.0, 1.0),
        (63.8, 1.0), (64.4, 0.7),  # "perang"
        (66.0, 0.55), (70.9, 0.5), (78.0, 0.45),
        (80.6, 0.4), (80.85, 0.0),  # music stops dead on "1982"
        (90.0, 0.0), (92.5, 0.35),  # "Puluhan tahun berlalu"
        (101.5, 0.45), (102.3, 0.5), (103.6, 0.95),
        (108.5, 0.7), (111.5, 0.8), (113.0, 1.0),
        (120.3, 0.9), (121.0, 0.5), (121.333, 0.0),
    ])
    left, right = nostalgia_bed(DURATION, sections, volume)
    mix.put_stereo(0.0, left, right, gain=0.016)

    # Low drone: carries the crisis, swells on the closure, returns under the final question.
    drone_vol = envelope([
        (0.0, 0.0), (64.0, 0.0), (66.5, 0.5), (80.6, 0.6), (80.9, 1.0),
        (86.0, 0.45), (89.2, 0.35), (92.5, 0.2), (95.0, 0.0),
        (118.0, 0.0), (119.0, 0.3), (121.0, 0.2), (121.333, 0.0),
    ])
    left, right = nostalgia_bed(DURATION, [(0.0, ["D2", "A2"], 0.0)], drone_vol)
    mix.put_stereo(0.0, left, right, gain=0.02)


def transitions(mix):
    put = mix.put
    # dip cuts: whoosh centred on the cut
    for t in (SHOT[2], SHOT[4], SHOT[5], SHOT[7], SHOT[8], SHOT[9], SHOT[13]):
        put(t - 0.35, dip_whoosh(0.7), gain=0.09)
    # flash cuts (era jumps) + the in-shot 1935 → 1947 flash
    for t in (SHOT[3], SHOT[10], SHOT[12], 61.07):
        put(t - 0.3, flash_shimmer(0.9), gain=0.07)
    # cross-dissolves
    for t in (SHOT[6], SHOT[11]):
        put(t - 0.2, xfade_swell(0.9), gain=0.06)
    # place/year chips
    put(98 / 30, chip_pop(), gain=0.07, pan=-0.45)
    for s in range(2, 14):
        put(SHOT[s] + CHIP, chip_pop(), gain=0.06, pan=-0.45)


def score(mix, tl=None):
    put = mix.put
    music(mix)
    transitions(mix)

    # ── 1 · PINTU SENJA, golden dusk (0.0–8.0) ─────────────────────────────
    put(0.0, macro_punch_in(1.6), gain=0.11)  # frame-0 macro punch-in; thump on the hook slam (16 f)
    put(0.17, spark_twinkle(), gain=0.06, pan=0.25)  # fx spark on the plaque corner
    put(0.5, speed_lines_swish(), gain=0.07)  # fx speedLines @ HOOK.impactFrame
    put(0.3, dusk_crickets(7.9), gain=0.018, pan=-0.3)
    put(0.0, mountain_wind(8.2, fc=340), gain=0.025)
    put(0.6, wood_creak(0.5), gain=0.05, pan=0.2)  # finger on the old door frame
    put(3.4, spark_twinkle(0.5), gain=0.02, pan=0.1)  # "1930…" glints
    put(5.8, spark_twinkle(0.5), gain=0.02, pan=0.15)  # "1982."

    # ── 2 · PERON KABUT, 1,246 m mountain morning (8.0–18.0) ───────────────
    put(SHOT[2], mountain_wind(10.2, fc=420, depth=0.6), gain=0.04)
    put(SHOT[2] + 0.4, priangan_birds(9.4, density=0.8), gain=0.04, pan=0.35)
    put(9.2, hen_cluck(3), gain=0.05, pan=-0.5)  # hen strutting across the platform
    put(12.4, hen_cluck(2), gain=0.04, pan=-0.3)
    put(9.6, wood_creak(0.35), gain=0.03, pan=0.3)  # the child waving from the bench

    # ── 3 · LADANG 1930, harvest terraces (18.0–28.0) ──────────────────────
    put(SHOT[3], mountain_wind(10.2, fc=360, depth=0.45), gain=0.04)
    put(SHOT[3] + 0.3, priangan_birds(9.6, density=1.0), gain=0.06, pan=-0.3)
    put(18.4, footsteps_soil(8, 0.52), gain=0.07, pan=-0.2)  # farmer walking the terrace
    put(19.0, wicker_basket(0.7), gain=0.07, pan=-0.2)  # shoulder basket
    put(22.4, wicker_basket(0.6), gain=0.06, pan=0.2)  # "hasil bumi"
    put(23.2, footsteps_soil(3, 0.4), gain=0.05, pan=0.25)  # "sayuran, beras, dan buah" — warga reaches down
    put(24.7, wicker_basket(0.5), gain=0.05, pan=0.25)

    # ── 4 · KANTOR 1930, Staatsspoorwegen office (28.0–38.0) ───────────────
    put(SHOT[4], room_tone(10.0), gain=0.035)
    put(SHOT[4] + 0.2, clock_tick(10, 1.0), gain=0.035, pan=0.3)
    put(28.6, ledger_pen(2.4), gain=0.05, pan=-0.25)  # station master writing the ledger
    put(31.6, ledger_pen(1.6), gain=0.06, pan=-0.25)
    put(34.45, newspaper_open(0.8), gain=0.05, pan=0.25)  # "Koran De Koerier"
    put(36.3, newspaper_open(0.6), gain=0.05, pan=0.25)  # smirk, paper snapped

    # ── 5 · CIBATU 06.04, departure (38.0–47.0) ────────────────────────────
    put(SHOT[5], crowd_murmur(9.0, busy=0.8), gain=0.04, pan=-0.1)
    put(SHOT[5] + 0.3, steam_locomotive(4.8), gain=0.05, pan=-0.3)  # idling chuffs at the platform
    put(38.6, footsteps_soil(6, 0.45), gain=0.04, pan=0.3)  # passengers with suitcases
    put(39.58, conductor_whistle(0.9), gain=0.05, pan=0.2)  # whistle + kick @39.80
    put(41.0, steam_whistle(1.6), gain=0.07, pan=-0.4)  # "kereta melayani lalu lintas"
    put(43.2, train_depart(7.4), gain=0.12, pan=-0.2)  # loco pulls away (p ≈ 0.58)
    put(43.4, gear_ratchet(1.2), gain=0.08, pan=-0.1)  # wheel/rack insert p 0.60–0.72

    # ── 6 · GERBONG KELAS 3 (47.0–56.0) ───────────────────────────────────
    put(SHOT[6], carriage_rumble(9.0), gain=0.07)
    put(SHOT[6] + 0.5, crowd_murmur(8.5, fc=600, busy=0.5), gain=0.025, pan=0.2)
    put(49.4, gear_ratchet(1.4, rate=10), gain=0.04, pan=-0.3)  # "mendaki ke Cikajang"
    put(50.9, wicker_basket(0.5), gain=0.05, pan=-0.3)  # ibu bakul laughs, basket on lap
    put(54.6, wood_creak(0.5), gain=0.05, pan=0.3)  # long benches creak

    # ── 7 · GARUT 1935 → 1947 (56.0–66.0) ─────────────────────────────────
    put(SHOT[7], crowd_murmur(5.2, busy=1.0), gain=0.045)
    put(SHOT[7] + 0.4, steam_locomotive(4.6), gain=0.035, pan=0.4)
    put(58.55, speed_lines_swish(), gain=0.05)  # fx speedLines on "lima" (5x)
    put(58.6, spark_twinkle(0.5), gain=0.05, pan=0.2)  # 5x badge pops
    for i, t in enumerate((61.6, 62.5, 63.3, 64.6, 65.4)):  # 1947 repair crew hammering
        put(t, rail_hammer(1.0), gain=0.07, pan=-0.35 if i % 2 else 0.35)
    put(61.2, mountain_wind(4.8, fc=300), gain=0.03)

    # ── 8 · KANTOR 1980, PJKA crisis (66.0–76.0) ──────────────────────────
    put(SHOT[8], fluorescent_hum(10.0), gain=0.012)
    put(SHOT[8], room_tone(10.0, fc=180), gain=0.03)
    put(SHOT[8] + 0.4, clock_tick(10, 1.0, freq=2100), gain=0.03, pan=0.35)
    put(66.6, chalk_scribble(2.2), gain=0.025, pan=-0.1)  # chalk graph line drawn
    put(69.2, chalk_scribble(2.4, strokes=5.0), gain=0.025, pan=-0.1)
    put(73.55, chalk_scribble(0.6, strokes=3.0), gain=0.05, pan=-0.1)  # "terus menurun" — chalk stops
    put(73.6, sweat_drop(), gain=0.07, pan=0.15)  # fx sweat on the clerk

    # ── 9 · GARUT 1982, DITUTUP (76.0–86.0) ───────────────────────────────
    put(SHOT[9], mountain_wind(10.0, fc=280, depth=0.4), gain=0.05)
    put(SHOT[9] + 0.5, train_depart(8.5, gap0=0.5, gap1=0.3), gain=0.06, pan=0.4)  # last train shrinking to the horizon
    put(80.2, wood_creak(0.6), gain=0.05, pan=-0.2)  # sign lifted on its hook
    put(83.75, speed_lines_swish(), gain=0.08)  # fx speedLines
    put(83.8, ditutup_slam(1.4), gain=0.16, pan=-0.1)  # "ditutup." slam + kick

    # ── 10 · CIKAJANG KINI, abandoned (86.0–95.0) ─────────────────────────
    put(SHOT[10], insect_drone(9.0), gain=0.022)
    put(SHOT[10], mountain_wind(9.2, fc=420), gain=0.03)
    put(SHOT[10] + 0.6, priangan_birds(8.0, density=0.35), gain=0.035, pan=0.4)
    put(87.9, zzz_snore(1.6), gain=0.07, pan=-0.35)  # fx zzz on the wall
    put(91.0, modern_station_air(4.0), gain=0.02)  # far road behind the station

    # ── 11 · UKIRAN "Station Tjikadjang" (95.0–104.0) ─────────────────────
    put(SHOT[11], mountain_wind(9.2, fc=380), gain=0.035)
    put(SHOT[11] + 0.5, insect_drone(8.5), gain=0.018)
    put(97.3, wood_creak(0.4), gain=0.03, pan=0.2)  # finger traces the carving edge
    put(98.3, spark_twinkle(0.6), gain=0.035, pan=0.15)  # "Tjikadjang" reads
    put(102.2, flash_shimmer(0.7), gain=0.025)  # "Tahun 2022" lift into the next shot

    # ── 12 · GARUT 2022, reactivation (104.0–113.0) ────────────────────────
    put(SHOT[12], modern_station_air(9.0), gain=0.05)
    put(SHOT[12] + 0.3, crowd_murmur(8.6, fc=560, busy=0.7), gain=0.035, pan=0.15)
    put(SHOT[12] + 0.5, train_idle_hiss(8.0), gain=0.04, pan=-0.35)
    put(104.05, station_chime(), gain=0.035, pan=0.3)  # station announcement chime
    put(105.05, exclaim_ping(), gain=0.09, pan=0.1)  # fx exclaim on "hidup lagi"

    # ── 13 · ANGKA KETIGA, twilight climax (113.0–121.33) ─────────────────
    put(SHOT[13], dusk_crickets(8.3), gain=0.018, pan=0.3)
    put(SHOT[13], mountain_wind(8.3, fc=320), gain=0.035)
    put(113.5, spark_twinkle(0.6), gain=0.035, pan=0.1)  # "1930"
    put(115.7, spark_twinkle(0.6), gain=0.035, pan=0.15)  # "1982."
    put(117.55, wood_creak(0.4), gain=0.04, pan=-0.1)  # kick @117.63
    put(120.5, spark_twinkle(0.7), gain=0.045, pan=0.25)  # fx spark by the glowing "?"

    # Keep Bagas on top: everything above ducks under the narration.
    duck_under_voice(mix)
