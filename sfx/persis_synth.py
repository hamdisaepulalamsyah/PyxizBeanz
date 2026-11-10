"""Sound generators tailored for Sejarah Persis: Dalilnya Mana?

All generators return mono float samples (-1..1) at 48 kHz.
Pure Python standard library with reproducible math and random generators.
"""

import math
import random
from sfx.synth import SR, bandnoise, click, blip, pop, chime, whoosh, riser, impact, scratch


def hook_title_slam(dur=2.2):
    """Trailer hook punch for title card: sub boom + airy rush + brass chime."""
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        sub = math.sin(2 * math.pi * (46 + 35 * math.exp(-t / 0.09)) * t) * math.exp(-t / 0.42) * 1.3
        sub = math.tanh(1.4 * sub)
        thump = random.uniform(-1, 1) * math.exp(-t / 0.012) * 0.75
        chime_ring = (math.sin(2 * math.pi * 587.3 * t) * 0.4 + math.sin(2 * math.pi * 1174.6 * t) * 0.25) * math.exp(-t / 0.8)
        out.append((sub * 0.65 + thump * 0.35 + chime_ring * 0.3) * min(1.0, (dur - t) / 0.4))
    return out


def teacup_clink(dur=0.35):
    """Delicate ceramic/porcelain teacup clink."""
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        ceramic = (math.sin(2 * math.pi * 2350 * t) * 0.7 + math.sin(2 * math.pi * 3820 * t) * 0.4) * math.exp(-t / 0.045)
        click_tap = random.uniform(-1, 1) * math.exp(-t / 0.003) * 0.5
        out.append(ceramic + click_tap)
    return out


def birds_morning_bandung(dur=8.0):
    """Quiet distant birds chirping in mountain valley."""
    n = int(dur * SR)
    out = [0.0] * n
    chirp_times = [0.8, 2.4, 4.8, 6.2]
    for ct in chirp_times:
        k0 = int(ct * SR)
        dur_c = 0.22
        nc = int(dur_c * SR)
        for j in range(nc):
            idx = k0 + j
            if idx < n:
                tj = j / SR
                freq = 2800 + 800 * math.sin(2 * math.pi * 8 * tj)
                tone = math.sin(2 * math.pi * freq * tj) * math.sin(math.pi * tj / dur_c) ** 2
                out[idx] += tone * 0.14
    return out


def wind_breeze(dur, fc=450, q=0.7):
    """Gentle continuous wind/air breeze."""
    n = int(dur * SR)
    def fc_at(k):
        t = k / SR
        return fc * (1.0 + 0.35 * math.sin(2 * math.pi * 0.18 * t) + 0.2 * math.sin(2 * math.pi * 0.45 * t))
    noise = bandnoise(n, fc_at, q=q)
    out = []
    for k in range(n):
        t = k / SR
        env = min(1.0, t / 0.8) * min(1.0, (dur - t) / 0.8) if dur > 1.6 else min(1.0, t / (dur * 0.3)) * min(1.0, (dur - t) / (dur * 0.3))
        gust = 0.7 + 0.3 * math.sin(2 * math.pi * 0.22 * t)
        out.append(noise[k] * env * gust * 0.8)
    return out


def carriage_hooves(count=6, tempo=0.38):
    """Horse-drawn carriage clopping on cobblestone street."""
    tot_dur = count * tempo + 0.3
    n = int(tot_dur * SR)
    out = [0.0] * n
    for i in range(count):
        t_base = i * tempo
        for offset, f_pitch in [(0.0, 360), (0.09, 390)]:
            t = t_base + offset
            k0 = int(t * SR)
            dur_clop = 0.08
            nk = int(dur_clop * SR)
            for j in range(nk):
                idx = k0 + j
                if idx < n:
                    tj = j / SR
                    knock = math.sin(2 * math.pi * f_pitch * tj) * math.exp(-tj / 0.015)
                    stone = random.uniform(-1, 1) * math.exp(-tj / 0.005) * 0.6
                    out[idx] += (knock + stone) * 0.45
    return out


def page_turn(dur=0.42):
    """Paper rustle / turning book page."""
    n = int(dur * SR)
    def fc_at(k):
        t = k / SR
        return 2200 + 1200 * math.sin(math.pi * t / dur)
    noise = bandnoise(n, fc_at, q=0.5)
    out = []
    for k in range(n):
        t = k / SR
        env = math.sin(math.pi * t / dur) ** 2 * (1.0 + 0.4 * math.sin(2 * math.pi * 8 * t))
        out.append(noise[k] * env * 0.9)
    return out


def scale_tilt(dur=1.2):
    """Wooden balance scale tilting with subtle brass clink."""
    n = int(dur * SR)
    out = [0.0] * n
    def fc_at(k): return 900 + 400 * math.sin(k / SR * 12)
    creak_noise = bandnoise(n, fc_at, q=0.3)
    for k in range(n):
        t = k / SR
        env = math.sin(math.pi * min(1.0, t / 0.6)) * math.exp(-t / 0.5)
        out[k] += creak_noise[k] * env * 0.35
    k_clink = int(0.4 * SR)
    for j in range(int(0.6 * SR)):
        idx = k_clink + j
        if idx < n:
            tj = j / SR
            bell = (math.sin(2 * math.pi * 1480 * tj) + 0.5 * math.sin(2 * math.pi * 2240 * tj)) * math.exp(-tj / 0.12)
            out[idx] += bell * 0.25
    return out


def quill_write(dur=2.0):
    """Dip pen scratching on rough paper."""
    n = int(dur * SR)
    def fc_at(k): return 3600 + 1200 * math.sin(k / SR * 35)
    noise = bandnoise(n, fc_at, q=0.3)
    out = []
    for k in range(n):
        t = k / SR
        stroke_env = max(0.0, math.sin(2 * math.pi * 6.5 * t)) ** 2.5
        pause = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(2 * math.pi * 1.5 * t))
        out.append(noise[k] * stroke_env * pause * 0.6)
    return out


def podium_knock(dur=0.45):
    """Firm wooden podium strike / knock of conviction."""
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        wood = (math.sin(2 * math.pi * 165 * t) * 0.8 + math.sin(2 * math.pi * 350 * t) * 0.4) * math.exp(-t / 0.055)
        click_grit = random.uniform(-1, 1) * math.exp(-t / 0.003) * 0.7
        out.append(wood + click_grit)
    return out


def printing_press_mechanical(dur=7.8):
    """1920s letterpress printing press rhythm."""
    n = int(dur * SR)
    out = [0.0] * n
    cycle_dur = 1.55
    cycles = int(dur / cycle_dur) + 1
    for c in range(cycles):
        t0 = c * cycle_dur
        k0 = int(t0 * SR)
        # Gear / crank
        for j in range(int(0.2 * SR)):
            idx = k0 + j
            if idx < n:
                tj = j / SR
                gear = math.sin(2 * math.pi * (450 + 200 * tj) * tj) * math.exp(-tj / 0.04) * 0.3
                gear += random.uniform(-1, 1) * math.exp(-tj / 0.008) * 0.25
                out[idx] += gear
        # Ink roller sweep
        k_roll = k0 + int(0.3 * SR)
        roll_len = int(0.45 * SR)
        def fc_roll(k): return 1100 + 400 * math.sin(math.pi * k / roll_len)
        roll_noise = bandnoise(roll_len, fc_roll, q=0.4)
        for j in range(roll_len):
            idx = k_roll + j
            if idx < n:
                env = math.sin(math.pi * j / roll_len)
                out[idx] += roll_noise[j] * env * 0.3
        # Platen stamp hit
        k_hit = k0 + int(0.85 * SR)
        hit_len = int(0.5 * SR)
        for j in range(hit_len):
            idx = k_hit + j
            if idx < n:
                tj = j / SR
                thud = (math.sin(2 * math.pi * 78 * tj) * 1.1 + math.sin(2 * math.pi * 185 * tj) * 0.6) * math.exp(-tj / 0.08)
                metal_clank = math.sin(2 * math.pi * 1250 * tj) * math.exp(-tj / 0.02) * 0.45
                noise_impact = random.uniform(-1, 1) * math.exp(-tj / 0.01) * 0.5
                out[idx] += thud + metal_clank + noise_impact
        # Paper slide
        k_pap = k0 + int(1.15 * SR)
        pap_len = int(0.35 * SR)
        def fc_pap(k): return 3200 - 800 * (k / pap_len)
        pap_noise = bandnoise(pap_len, fc_pap, q=0.6)
        for j in range(pap_len):
            idx = k_pap + j
            if idx < n:
                env = math.sin(math.pi * j / pap_len)
                out[idx] += pap_noise[j] * env * 0.32
    return out


def ocean_surf(dur=14.0):
    """Gentle ocean waves washing ashore at Ende Flores."""
    n = int(dur * SR)
    out = [0.0] * n
    def fc_at(k):
        t = k / SR
        wave_phase = (t % 4.2) / 4.2
        return 220 + 950 * (math.sin(math.pi * wave_phase) ** 2)
    noise = bandnoise(n, fc_at, q=0.45)
    for k in range(n):
        t = k / SR
        wave_phase = (t % 4.2) / 4.2
        swell = math.sin(math.pi * wave_phase) ** 1.8
        foam = max(0.0, math.sin(math.pi * wave_phase) - 0.5) * random.uniform(-1, 1) * 0.25
        out[k] = (noise[k] * swell * 0.75 + foam) * min(1.0, t / 1.5) * min(1.0, (dur - t) / 1.5)
    return out


def paper_flutter(dur=2.2):
    """Fluttering paper wings / flying letters over sea."""
    n = int(dur * SR)
    def fc_at(k): return 2800 + 900 * math.sin(k / SR * 40)
    noise = bandnoise(n, fc_at, q=0.35)
    out = []
    for k in range(n):
        t = k / SR
        flap = (0.5 + 0.5 * math.sin(2 * math.pi * 14 * t)) ** 2
        env = math.sin(math.pi * t / dur)
        sparkle = 0.15 * math.sin(2 * math.pi * 2600 * t) * math.exp(-((t - dur * 0.5) ** 2) / 0.2)
        out.append((noise[k] * flap * 0.8 + sparkle) * env)
    return out


def steam_locomotive(dur=7.5):
    """Steam train accelerating with rhythmic chuffs and rail track clatter."""
    n = int(dur * SR)
    out = [0.0] * n
    t = 0.0
    rate = 2.2
    while t < dur - 0.2:
        k_chuff = int(t * SR)
        chuff_len = int(0.18 * SR)
        def fc_chuff(k): return 750 - 300 * (k / chuff_len)
        noise = bandnoise(chuff_len, fc_chuff, q=0.5)
        for j in range(chuff_len):
            idx = k_chuff + j
            if idx < n:
                tj = j / SR
                env = math.sin(math.pi * tj / (chuff_len / SR)) * math.exp(-tj / 0.05)
                cylinder = math.sin(2 * math.pi * 55 * tj) * math.exp(-tj / 0.04) * 0.4
                out[idx] += (noise[j] * env + cylinder) * 0.65
        if int(t * rate) % 2 == 0:
            for rail_off, f_rail in [(0.04, 1100), (0.09, 1400)]:
                k_rail = k_chuff + int(rail_off * SR)
                for j in range(int(0.04 * SR)):
                    idx = k_rail + j
                    if idx < n:
                        tj = j / SR
                        out[idx] += math.sin(2 * math.pi * f_rail * tj) * math.exp(-tj / 0.01) * 0.15
        dt = 1.0 / rate
        t += dt
        rate = min(3.8, rate + 0.18 * dt)
    k_hiss = int(5.8 * SR)
    hiss_len = int(1.4 * SR)
    def fc_hiss(k): return 3500 + 500 * math.sin(k / SR * 10)
    hiss_noise = bandnoise(hiss_len, fc_hiss, q=0.7)
    for j in range(hiss_len):
        idx = k_hiss + j
        if idx < n:
            tj = j / SR
            env = math.sin(math.pi * tj / 1.4) ** 2
            out[idx] += hiss_noise[j] * env * 0.28
    return out


def steam_whistle(dur=1.8):
    """Dual-tone vintage steam locomotive whistle."""
    n = int(dur * SR)
    out = []
    def fc_air(k): return 2400
    air = bandnoise(n, fc_air, q=0.6)
    for k in range(n):
        t = k / SR
        env = min(1.0, t / 0.22) * min(1.0, (dur - t) / 0.35)
        vibrato = 1.0 + 0.008 * math.sin(2 * math.pi * 5.2 * t)
        f1 = 587.3 * vibrato
        f2 = 739.9 * vibrato
        tone = (math.sin(2 * math.pi * f1 * t) * 0.7 +
                math.sin(2 * math.pi * f2 * t) * 0.6 +
                math.sin(2 * math.pi * f1 * 2 * t) * 0.2 +
                math.sin(2 * math.pi * f2 * 2 * t) * 0.15)
        out.append((tone * 0.65 + air[k] * 0.35) * env * 0.8)
    return out


def parliament_gavel_taps(count=3, interval=0.34):
    """Three authoritative parliament gavel strikes on wooden sound block."""
    tot_dur = count * interval + 0.5
    n = int(tot_dur * SR)
    out = [0.0] * n
    for i in range(count):
        t_hit = i * interval
        k0 = int(t_hit * SR)
        hit_len = int(0.35 * SR)
        for j in range(hit_len):
            idx = k0 + j
            if idx < n:
                tj = j / SR
                click_transient = random.uniform(-1, 1) * math.exp(-tj / 0.002) * 0.9
                block_tone = (math.sin(2 * math.pi * 440 * tj) * 0.85 + math.sin(2 * math.pi * 980 * tj) * 0.45) * math.exp(-tj / 0.038)
                out[idx] += (click_transient + block_tone) * 0.7
    return out


def map_reunification_snap(dur=0.7):
    """Solid mechanical/tactile lock when map reunites."""
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        clunk = math.sin(2 * math.pi * 120 * t) * math.exp(-t / 0.06) * 0.8
        click_hi = math.sin(2 * math.pi * 2400 * t) * math.exp(-t / 0.008) * 0.7
        chime_ring = math.sin(2 * math.pi * 880 * t) * math.exp(-t / 0.25) * 0.35
        out.append(clunk + click_hi + chime_ring)
    return out


def golden_seal_climax(dur=3.2):
    """Grand finale: heavy golden seal stamp impact + brass resonance."""
    n = int(dur * SR)
    out = []
    for k in range(n):
        t = k / SR
        sub = math.sin(2 * math.pi * (48 + 40 * math.exp(-t / 0.08)) * t) * math.exp(-t / 0.45) * 1.4
        sub = math.tanh(1.5 * sub)
        thwack = random.uniform(-1, 1) * math.exp(-t / 0.015) * 0.85
        brass = (math.sin(2 * math.pi * 520 * t) * 0.6 +
                 math.sin(2 * math.pi * 1040 * t) * 0.45 +
                 math.sin(2 * math.pi * 1560 * t) * 0.3 +
                 math.sin(2 * math.pi * 2400 * t) * 0.2) * math.exp(-t / 1.2)
        out.append((sub * 0.7 + thwack * 0.4 + brass * 0.5) * min(1.0, (dur - t) / 0.5))
    return out
