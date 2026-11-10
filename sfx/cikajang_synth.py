"""Sound generators for "Sejarah Cikajang: Dua Angka di Pintu Stasiun".

Every generator returns mono float samples (about -1..1) at 48 kHz, except
`nostalgia_bed`, which returns a stereo pair for Mix.put_stereo. Pure Python
standard library; noise comes from the module-level `random`, which Mix seeds,
so every render is identical.

Families:
  * Ambience beds: mountain wind, Priangan birds, dusk crickets, room tone,
    fluorescent hum, crowd murmur, carriage rumble, modern-station air.
  * Foley: rail hammer, chalk, DITUTUP slam, departing train, ledger pen,
    newspaper, soil footsteps, wicker basket, conductor whistle, gear ratchet,
    clock ticks, hen cluck, KAI-style station chime.
  * Cartoon FX synced to src/cikajang/fx.ts: spark, sweat, speed lines,
    exclaim, zzz.
  * Transitions: macro punch-in, dip whoosh, flash shimmer, cross-dissolve swell.
  * Music: `nostalgia_bed`, a soft warm pad that cools into a drone for the
    1980–1982 crisis and warms again for 2022 and the final question.
"""

import math
import random

from sfx.synth import SR, bandnoise, chime, whoosh, riser

TAU = 2 * math.pi


def _n(dur):
    return int(dur * SR)


def _edge(k, n, fin=0.02, fout=0.05):
    """Click-free fade in/out envelope value at sample k."""
    t = k / SR
    return min(1.0, t / fin if fin > 0 else 1.0, (n - k) / SR / fout if fout > 0 else 1.0)


def _lowpass(x, fc):
    """One-pole low-pass (gentle darkening)."""
    a = 1 - math.exp(-TAU * fc / SR)
    y, out = 0.0, []
    for s in x:
        y += a * (s - y)
        out.append(y)
    return out


def _add(dst, src, at, gain=1.0):
    i0 = int(at * SR)
    for k, s in enumerate(src):
        i = i0 + k
        if 0 <= i < len(dst):
            dst[i] += s * gain


# ── Ambience beds ───────────────────────────────────────────────────────────


def mountain_wind(dur, fc=380, depth=0.55, rate=0.11):
    """Cool wind through the 1,246 m pass: slow swells, breathy band-passed noise."""
    n = _n(dur)
    ph = random.uniform(0, TAU)
    noise = bandnoise(n, lambda k: fc * (1 + 0.45 * math.sin(TAU * 0.07 * k / SR + ph)), q=0.6)
    out = []
    for k in range(n):
        t = k / SR
        swell = 1 - depth + depth * (0.5 + 0.5 * math.sin(TAU * rate * t + ph)) * (0.7 + 0.3 * math.sin(TAU * rate * 2.7 * t))
        out.append(noise[k] * swell * 1.6 * _edge(k, n, 1.2, 1.5))
    return out


def _chirp(f0, f1, dur, vib=0.0, vib_rate=30.0):
    n = _n(dur)
    out, ph = [], 0.0
    for k in range(n):
        u = k / n
        f = f0 + (f1 - f0) * u + vib * math.sin(TAU * vib_rate * k / SR)
        ph += TAU * f / SR
        out.append(math.sin(ph) * math.sin(math.pi * u) ** 1.5)
    return out


def priangan_birds(dur, density=0.7):
    """Highland birdsong: kutilang-like two-note calls, trills and far peeps."""
    n = _n(dur)
    out = [0.0] * n
    t = random.uniform(0.2, 0.8)
    while t < dur - 0.8:
        kind = random.random()
        g = random.uniform(0.35, 1.0)
        if kind < 0.4:  # two-note whistled call
            base = random.uniform(2100, 2900)
            _add(out, _chirp(base, base * 1.25, 0.11), t, g)
            _add(out, _chirp(base * 1.25, base * 0.95, 0.16, vib=60), t + 0.15, g * 0.9)
        elif kind < 0.7:  # trill
            base = random.uniform(3200, 4200)
            for j in range(random.randint(4, 8)):
                _add(out, _chirp(base, base * 1.12, 0.04), t + j * 0.055, g * 0.6)
        else:  # distant peep
            base = random.uniform(4300, 5200)
            _add(out, _chirp(base, base * 0.85, 0.07), t, g * 0.35)
        t += random.uniform(0.6, 2.2) / density
    return out


def dusk_crickets(dur, rate=4.2):
    """Golden-dusk crickets: pulsed 4.5 kHz chirps, two voices out of phase."""
    n = _n(dur)
    out = []
    p2 = random.uniform(0, 1)
    for k in range(n):
        t = k / SR
        a = max(0.0, math.sin(TAU * rate * t)) ** 6 * (0.5 + 0.5 * math.sin(TAU * 31 * t))
        b = max(0.0, math.sin(TAU * (rate * 0.83) * t + p2 * TAU)) ** 6 * (0.5 + 0.5 * math.sin(TAU * 27 * t))
        s = a * math.sin(TAU * 4600 * t) + 0.7 * b * math.sin(TAU * 5200 * t)
        out.append(s * 0.5 * _edge(k, n, 0.8, 1.0))
    return out


def room_tone(dur, fc=220):
    """Quiet interior air for the station offices."""
    n = _n(dur)
    noise = bandnoise(n, lambda k: fc, q=0.4)
    return [noise[k] * 0.9 * _edge(k, n, 0.5, 0.6) for k in range(n)]


def fluorescent_hum(dur, mains=50.0):
    """1980s office tube light: 100 Hz buzz with a faint flicker crackle."""
    n = _n(dur)
    out = []
    for k in range(n):
        t = k / SR
        hum = math.sin(TAU * mains * 2 * t) * 0.6 + math.sin(TAU * mains * 4 * t) * 0.25 + math.sin(TAU * mains * 6 * t) * 0.12
        crackle = random.uniform(-1, 1) * 0.25 if random.random() < 0.0004 else 0.0
        out.append((hum * (0.85 + 0.15 * math.sin(TAU * 0.3 * t)) + crackle) * _edge(k, n, 0.4, 0.5))
    return out


def crowd_murmur(dur, fc=520, busy=1.0):
    """Station crowd: low formant-like murmur with syllable modulation."""
    n = _n(dur)
    a = bandnoise(n, lambda k: fc * (1 + 0.3 * math.sin(TAU * 1.7 * k / SR)), q=1.4)
    b = bandnoise(n, lambda k: fc * 1.9 * (1 + 0.25 * math.sin(TAU * 2.3 * k / SR + 1)), q=1.6)
    out = []
    for k in range(n):
        t = k / SR
        syl = 0.55 + 0.45 * abs(math.sin(TAU * 2.9 * t) * math.sin(TAU * 1.3 * t + 0.7))
        out.append((a[k] + 0.6 * b[k]) * syl * busy * 1.4 * _edge(k, n, 0.8, 0.8))
    return out


def carriage_rumble(dur, clack_every=1.05):
    """Third-class carriage on old rails: low rumble, clack-clack joints, wood creaks."""
    n = _n(dur)
    rumble = bandnoise(n, lambda k: 95, q=0.5)
    out = [rumble[k] * 1.4 * (0.85 + 0.15 * math.sin(TAU * 0.9 * k / SR)) * _edge(k, n, 0.6, 0.8) for k in range(n)]
    t = 0.3
    while t < dur - 0.3:
        for off, g in ((0.0, 1.0), (0.16, 0.8)):
            _add(out, rail_click(), t + off, g * 0.7)
        if random.random() < 0.35:
            _add(out, wood_creak(random.uniform(0.25, 0.5)), t + random.uniform(0.3, 0.7), 0.25)
        t += clack_every * random.uniform(0.96, 1.04)
    return out


def modern_station_air(dur):
    """Present-day station: soft HVAC air, distant traffic swells, a far motorbike."""
    n = _n(dur)
    air = bandnoise(n, lambda k: 300, q=0.35)
    out = [air[k] * 0.8 * _edge(k, n, 0.8, 0.8) for k in range(n)]
    t = random.uniform(1.0, 3.0)
    while t < dur - 3.0:
        _add(out, motorbike_pass(2.6), t, 0.35)
        t += random.uniform(5.0, 9.0)
    return out


def insect_drone(dur):
    """Abandoned-platform insects at midday: thin high shimmer, very soft."""
    n = _n(dur)
    out = []
    for k in range(n):
        t = k / SR
        s = math.sin(TAU * 6100 * t) * (0.5 + 0.5 * math.sin(TAU * 13 * t)) * (0.6 + 0.4 * math.sin(TAU * 0.21 * t))
        out.append(s * 0.18 * _edge(k, n, 1.0, 1.0))
    return out


# ── Foley ───────────────────────────────────────────────────────────────────


def rail_click(dur=0.06):
    """Single steel rail-joint click (building block for carriage clacks)."""
    n = _n(dur)
    out = []
    for k in range(n):
        t = k / SR
        out.append((math.sin(TAU * 640 * t) * 0.6 + math.sin(TAU * 1730 * t) * 0.3) * math.exp(-t / 0.012) + random.uniform(-1, 1) * math.exp(-t / 0.003) * 0.6)
    return out


def wood_creak(dur=0.4):
    """Old wooden bench / carriage body creak."""
    n = _n(dur)
    noise = bandnoise(n, lambda k: 380 + 260 * math.sin(math.pi * k / n), q=6.0)
    return [noise[k] * math.sin(math.pi * k / n) * (0.6 + 0.4 * math.sin(TAU * 38 * k / SR)) * 3.0 for k in range(n)]


def rail_hammer(dur=1.1):
    """Spike hammer on a steel rail (1947 repair crew): bright inharmonic clang + thud."""
    n = _n(dur)
    partials = ((1180, 1.0, 0.32), (2760, 0.55, 0.18), (4130, 0.35, 0.09), (6020, 0.18, 0.05))
    out = []
    for k in range(n):
        t = k / SR
        ring = sum(a * math.sin(TAU * f * t) * math.exp(-t / tau) for f, a, tau in partials)
        thud = math.sin(TAU * 120 * t) * math.exp(-t / 0.03) * 0.6
        hit = random.uniform(-1, 1) * math.exp(-t / 0.002) * 0.9
        out.append((ring * 0.6 + thud + hit) * min(1.0, (n - k) / SR / 0.05))
    return out


def chalk_scribble(dur=2.0, strokes=7.0):
    """Chalk on a board (1980 falling chart): gritty strokes with tiny squeaks."""
    n = _n(dur)
    grit = bandnoise(n, lambda k: 3200 + 900 * math.sin(TAU * 3.1 * k / SR), q=0.4)
    out = []
    for k in range(n):
        t = k / SR
        stroke = max(0.0, math.sin(TAU * strokes / 2 * t)) ** 0.6
        squeak = math.sin(TAU * (2300 + 300 * math.sin(TAU * 5 * t)) * t) * 0.12 * max(0.0, math.sin(TAU * 0.8 * t)) ** 8
        out.append((grit[k] * stroke * 1.3 + squeak) * _edge(k, n, 0.03, 0.08))
    return out


def ditutup_slam(dur=1.4):
    """'DITUTUP' board slammed and stamped: deep wooden thump, rattling chain, ink-stamp clack."""
    n = _n(dur)
    out = []
    for k in range(n):
        t = k / SR
        body = math.sin(TAU * (70 + 50 * math.exp(-t / 0.04)) * t) * math.exp(-t / 0.22) * 1.2
        wood = (math.sin(TAU * 185 * t) * 0.6 + math.sin(TAU * 430 * t) * 0.35 + math.sin(TAU * 910 * t) * 0.15) * math.exp(-t / 0.09)
        crack = random.uniform(-1, 1) * math.exp(-t / 0.006) * 0.9
        out.append(math.tanh(1.3 * (body + wood + crack)))
    # Chain rattle as the board swings.
    for j in range(7):
        _add(out, rail_click(0.04), 0.12 + j * 0.085 + random.uniform(-0.01, 0.01), 0.22 * (1 - j / 8))
    return out


def train_depart(dur=8.0, gap0=0.55, gap1=0.16):
    """Steam train pulling away: chuffs accelerate, then fade and darken into the distance."""
    n = _n(dur)
    out = [0.0] * n
    t, gap = 0.1, gap0
    while t < dur - 0.3:
        u = t / dur
        cl = _n(min(0.22, gap * 0.8))
        fc = 900 - 400 * u
        noise = bandnoise(cl, lambda k, fc=fc: fc * (1 - 0.4 * k / cl), q=0.8)
        far = (1 - u) ** 1.6
        for j in range(cl):
            i = int(t * SR) + j
            if i < n:
                out[i] += noise[j] * math.exp(-j / (0.07 * SR)) * 2.2 * far
        t += gap
        gap = max(gap1, gap * 0.93)
    hiss = bandnoise(n, lambda k: 3600, q=0.5)
    for k in range(n):
        u = k / n
        out[k] += hiss[k] * 0.25 * math.exp(-u * 5)
    return _lowpass(out, 5200)


def ledger_pen(dur=2.0):
    """Steel nib scratching a 1930 ledger: fine high strokes with short pauses."""
    n = _n(dur)
    noise = bandnoise(n, lambda k: 5200 + 1400 * math.sin(TAU * 19 * k / SR), q=0.5)
    out = []
    for k in range(n):
        t = k / SR
        word = 1.0 if (t % 0.9) < 0.7 else 0.15
        stroke = max(0.0, math.sin(TAU * 6.5 * t)) ** 2
        out.append(noise[k] * stroke * word * 1.1 * _edge(k, n, 0.02, 0.06))
    return out


def newspaper_open(dur=0.8):
    """De Koerier being shaken open: crisp paper crackle bursts."""
    n = _n(dur)
    noise = bandnoise(n, lambda k: 2600 + 1800 * (k / n), q=0.45)
    out = []
    for k in range(n):
        t = k / SR
        bursts = sum(math.exp(-((t - c) / 0.035) ** 2) for c in (0.05, 0.22, 0.31, 0.5))
        out.append(noise[k] * bursts * 1.8)
    return out


def footsteps_soil(count=6, tempo=0.5):
    """Bare feet / sandals on soft terrace soil: dull thuds with grit."""
    out = [0.0] * _n(count * tempo + 0.4)
    for j in range(count):
        n = _n(0.16)
        g = bandnoise(n, lambda k: 900, q=0.6)
        step = [(math.sin(TAU * 85 * k / SR) * 0.8 + g[k] * 0.9) * math.exp(-k / (0.035 * SR)) for k in range(n)]
        _add(out, step, j * tempo + random.uniform(-0.03, 0.03), random.uniform(0.7, 1.0))
    return out


def wicker_basket(dur=0.7):
    """Harvest basket settling on a shoulder: wicker creak + vegetables bumping."""
    out = wood_creak(dur)
    for j in range(3):
        n = _n(0.08)
        _add(out, [math.sin(TAU * 210 * k / SR) * math.exp(-k / (0.02 * SR)) for k in range(n)], 0.1 + j * 0.13, 0.5)
    return out


def conductor_whistle(dur=0.9):
    """Pea whistle of the 1930 conductor: trilled 2.9 kHz with breath."""
    n = _n(dur)
    breath = bandnoise(n, lambda k: 2900, q=4.0)
    out = []
    for k in range(n):
        t = k / SR
        f = 2900 + 140 * math.sin(TAU * 26 * t)
        tone = math.sin(TAU * f * t) * (0.7 + 0.3 * math.sin(TAU * 26 * t))
        out.append((tone * 0.7 + breath[k] * 0.5) * _edge(k, n, 0.03, 0.12))
    return out


def gear_ratchet(dur=1.2, rate=14.0):
    """Cog wheel biting the rack rail: metallic ratchet ticks with a low grind."""
    n = _n(dur)
    out = [0.0] * n
    grind = bandnoise(n, lambda k: 240, q=0.8)
    for k in range(n):
        out[k] = grind[k] * 0.5 * _edge(k, n, 0.1, 0.2)
    t = 0.02
    while t < dur - 0.05:
        tk = [(math.sin(TAU * 2100 * k / SR) * 0.6 + math.sin(TAU * 3400 * k / SR) * 0.3) * math.exp(-k / (0.006 * SR)) for k in range(_n(0.03))]
        _add(out, tk, t, 0.8)
        t += 1 / rate
    return out


def clock_tick(count=10, interval=1.0, freq=2500):
    """Wall clock ticks (alternating tick/tock)."""
    out = [0.0] * _n(count * interval + 0.1)
    for j in range(count):
        f = freq if j % 2 == 0 else freq * 0.8
        n = _n(0.03)
        _add(out, [math.sin(TAU * f * k / SR) * math.exp(-k / (0.004 * SR)) + random.uniform(-1, 1) * math.exp(-k / (0.001 * SR)) * 0.4 for k in range(n)], j * interval)
    return out


def hen_cluck(count=3):
    """Village hen on the misty platform: short nasal clucks."""
    out = [0.0] * _n(count * 0.32 + 0.3)
    for j in range(count):
        n = _n(0.11)
        f0 = random.uniform(520, 640)
        s = []
        for k in range(n):
            u = k / n
            f = f0 * (1.3 - 0.5 * u)
            s.append((math.sin(TAU * f * k / SR) + 0.5 * math.sin(TAU * 2 * f * k / SR) + 0.3 * math.sin(TAU * 3.1 * f * k / SR)) * math.sin(math.pi * u))
        _add(out, s, j * random.uniform(0.25, 0.36), 0.6)
    return out


def station_chime():
    """Modern station announcement chime (generic rising three-note ding)."""
    return chime([659.25, 830.61, 987.77], dur=2.2, tau=0.75)


def motorbike_pass(dur=2.6):
    """Distant motorbike passing on the road behind the station."""
    n = _n(dur)
    out, ph = [], 0.0
    for k in range(n):
        u = k / n
        f = 95 * (1.08 - 0.16 * u)  # slight Doppler drop
        ph += TAU * f / SR
        buzz = math.sin(ph) + 0.5 * math.sin(2 * ph) + 0.3 * math.sin(3 * ph + 0.4)
        out.append(buzz * math.sin(math.pi * u) ** 2 * 0.5)
    return _lowpass(out, 900)


def train_idle_hiss(dur=6.0):
    """Modern diesel train idling at the platform: low hum + brake air hiss."""
    n = _n(dur)
    air = bandnoise(n, lambda k: 3000, q=0.6)
    out = []
    for k in range(n):
        t = k / SR
        hum = math.sin(TAU * 48 * t) * 0.5 + math.sin(TAU * 96 * t) * 0.25
        hiss = air[k] * 0.4 * max(0.0, math.sin(TAU * 0.18 * t)) ** 4
        out.append((hum + hiss) * _edge(k, n, 1.0, 1.0))
    return out


# ── Cartoon FX (src/cikajang/fx.ts) ─────────────────────────────────────────


def spark_twinkle(dur=0.7):
    """`spark` FX: glittering high arpeggio."""
    out = [0.0] * _n(dur)
    for j, f in enumerate((2093.0, 2637.0, 3136.0, 4186.0)):
        n = _n(0.35)
        _add(out, [math.sin(TAU * f * k / SR) * math.exp(-k / (0.09 * SR)) for k in range(n)], j * 0.06, 0.6)
    return out


def sweat_drop(dur=0.45):
    """`sweat` FX: nervous descending 'bloop' with a tiny plink."""
    n = _n(dur)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        f = 950 * math.exp(-t * 2.6) + 380
        ph += TAU * f / SR
        out.append(math.sin(ph) * math.exp(-t / 0.16) * min(1.0, t / 0.005))
    _add(out, [math.sin(TAU * 1900 * k / SR) * math.exp(-k / (0.02 * SR)) for k in range(_n(0.08))], 0.3, 0.35)
    return out


def speed_lines_swish(dur=0.35):
    """`speedLines` FX: sharp airy swish that snaps in with the radial lines."""
    return whoosh(dur, 1800, 7000, peak=0.25, q=0.7)


def exclaim_ping(dur=0.5):
    """`exclaim` FX: bright upward pop + 'ding!'."""
    n = _n(dur)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        f = 700 + 900 * min(1.0, t / 0.05)
        ph += TAU * f / SR
        out.append(math.sin(ph) * math.exp(-t / 0.05) * 0.6)
    _add(out, [math.sin(TAU * 1568 * k / SR) * math.exp(-k / (0.15 * SR)) + 0.4 * math.sin(TAU * 3136 * k / SR) * math.exp(-k / (0.08 * SR)) for k in range(_n(0.45))], 0.04, 0.7)
    return out


def zzz_snore(dur=1.6):
    """`zzz` FX: three soft sleepy buzzes, each a little higher and fainter."""
    out = [0.0] * _n(dur)
    for j in range(3):
        n = _n(0.38)
        f = 180 + j * 40
        s = []
        for k in range(n):
            u = k / n
            v = math.sin(TAU * f * k / SR)
            s.append((v + 0.4 * math.copysign(1, v)) * math.sin(math.pi * u) ** 2 * 0.4)
        _add(out, _lowpass(s, 1400), j * 0.48, 1 - j * 0.25)
    return out


# ── Transitions ─────────────────────────────────────────────────────────────


def macro_punch_in(dur=1.6):
    """Frame-0 macro punch-in on the carved years: air rush into a soft sub thump + brass glint."""
    n = _n(dur)
    rush = whoosh(0.5, 300, 3600, peak=0.85, q=0.9)
    out = [0.0] * n
    _add(out, rush, 0.0, 0.7)
    hit = 0.5
    for k in range(_n(hit), n):
        t = (k - _n(hit)) / SR
        sub = math.tanh(1.3 * math.sin(TAU * (44 + 30 * math.exp(-t / 0.08)) * t) * math.exp(-t / 0.4))
        glint = (math.sin(TAU * 1318.5 * t) * 0.35 + math.sin(TAU * 1975.5 * t) * 0.2) * math.exp(-t / 0.5)
        out[k] += sub * 0.8 + glint * 0.35 + random.uniform(-1, 1) * math.exp(-t / 0.01) * 0.3
    return out


def dip_whoosh(dur=0.6):
    """`dip` cut: soft dark whoosh into and out of black."""
    return whoosh(dur, 260, 1900, peak=0.55, q=0.8)


def flash_shimmer(dur=0.9):
    """`flash` era jump: short bright riser into a glassy shimmer."""
    out = riser(0.35, 900, 6400)
    out = [s * 0.6 for s in out] + [0.0] * _n(dur - 0.35)
    shimmer = chime([1760.0, 2217.5, 2637.0, 3520.0], dur=dur - 0.3, tau=0.35)
    _add(out, shimmer, 0.3, 0.5)
    return out


def xfade_swell(dur=0.9):
    """`xfade` cross-dissolve: airy breath swell, no transient."""
    n = _n(dur)
    noise = bandnoise(n, lambda k: 700 + 900 * math.sin(math.pi * k / n), q=0.6)
    return [noise[k] * math.sin(math.pi * k / n) ** 2 * 1.2 for k in range(n)]


def chip_pop():
    """Place/year chip popping in (soft wooden tok)."""
    n = _n(0.12)
    return [math.sin(TAU * (900 - 300 * k / n) * k / SR) * math.exp(-k / (0.02 * SR)) for k in range(n)]


# ── Music bed ───────────────────────────────────────────────────────────────

# Equal-tempered note frequencies used by the bed (D major / B minor colour).
NOTE = {
    "D2": 73.42, "E2": 82.41, "A2": 110.0, "B2": 123.47,
    "D3": 146.83, "E3": 164.81, "F#3": 185.0, "G3": 196.0, "A3": 220.0, "B3": 246.94,
    "C#4": 277.18, "D4": 293.66, "E4": 329.63, "F#4": 369.99, "A4": 440.0,
}


def nostalgia_bed(duration, sections, volume):
    """Warm, slow pad bed; returns (left, right). sections = [(start_s, [note names], brightness 0..1)].

    Brightness mixes in upper partials (warm when high, hollow/cold when low).
    `volume(t)` is the overall gain curve (ducking, crisis drop-outs).
    """
    n = _n(duration)
    left = [0.0] * n
    right = [0.0] * n
    xf = 2.5  # slow chord crossfades
    for si, (t0, names, bright) in enumerate(sections):
        t1 = sections[si + 1][0] if si + 1 < len(sections) else duration
        freqs = [NOTE[x] for x in names]
        i0 = max(0, _n(t0 - (xf if si else 0)))
        i1 = min(n, _n(t1 + xf))
        ph = [[random.uniform(0, TAU), random.uniform(0, TAU)] for _ in freqs]
        for i in range(i0, i1):
            t = i / SR
            w = 1.0
            if si and t < t0 + xf:
                w = max(0.0, (t - (t0 - xf)) / (2 * xf))
            if si + 1 < len(sections) and t > t1 - xf:
                w *= max(0.0, 1 - (t - (t1 - xf)) / (2 * xf))
            if w <= 0:
                continue
            v = w * volume(t)
            if v <= 0:
                continue
            sl = sr = 0.0
            for j, f in enumerate(freqs):
                dl, dr = f * 0.9985, f * 1.0015  # gentle chorus detune
                ph[j][0] += TAU * dl / SR
                ph[j][1] += TAU * dr / SR
                g = 1 / (1 + j * 0.45)
                a, b = ph[j]
                sl += g * (math.sin(a) + bright * 0.22 * math.sin(2 * a) + bright * 0.08 * math.sin(3 * a))
                sr += g * (math.sin(b) + bright * 0.22 * math.sin(2 * b) + bright * 0.08 * math.sin(3 * b))
            breathe = 0.88 + 0.12 * math.sin(TAU * 0.09 * t)
            left[i] += sl * v * breathe
            right[i] += sr * v * breathe
    return left, right
