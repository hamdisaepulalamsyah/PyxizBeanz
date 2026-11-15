"""Beach, night-city and graphic-transition sounds for the Hotelling Law video (pure Python, 48 kHz).

Same conventions as synth.py: each generator returns a mono list of floats and uses the
module-level `random` for reproducible renders. Kept soft because they sit under a voice-over.
"""

import math
import random

from .dsp import fade as _fade, reverb
from .synth import SR, bandnoise, click

TAU = 2 * math.pi


def fade(x, fin=0.0, fout=0.0):
    """Building block: linear fade in/out with lengths in seconds."""
    return _fade(x, int(fin * SR), int(fout * SR))


def _lp1(x, a, passes=1):
    """Building block: cascaded one-pole low-pass, a = coefficient (0..1, smaller is darker)."""
    for _ in range(passes):
        y = 0.0
        out = []
        ap = out.append
        for v in x:
            y += a * (v - y)
            ap(y)
        x = out
    return x


def _noise(n):
    """Building block: white noise list."""
    u = random.uniform
    return [u(-1, 1) for _ in range(n)]


def _smooth_env(n, step_s, lo, hi, a=0.0004):
    """Building block: slowly wandering random level between lo and hi, smoothed."""
    step = int(step_s * SR)
    raw = []
    while len(raw) < n:
        raw.extend([random.uniform(lo, hi)] * step)
    return _lp1(raw[:n], a, 2)


def _wet(x, size=0.6, mix=0.3, scale=1.0):
    """Building block: blend a mono signal with its mono-summed reverb."""
    l, r = reverb(x, size=size, scale=scale)
    return [d * (1 - mix) + (a + b) * 0.5 * mix for d, a, b in zip(x, l, r)]


def ocean_waves(dur):
    """Beach: gentle shore wash, slow ~0.15 Hz surges with foamy hiss tails."""
    n = int(dur * SR)
    env = [0.0] * n
    t = random.uniform(0.0, 2.0)
    while t < dur + 4:
        period = random.uniform(5.8, 7.6)
        amp = random.uniform(0.7, 1.0)
        for k in range(max(0, int(t * SR)), min(n, int((t + period) * SR))):
            x = max(0.0, (k / SR - t) / period)
            e = math.sin(math.pi * x ** 0.7) ** 2
            if e * amp > env[k]:
                env[k] = e * amp
        t += period * random.uniform(0.7, 0.9)
    env = _lp1(env, 0.0008, 1)
    body = _lp1(_noise(n), 0.035, 2)
    hiss = _lp1(_noise(n), 0.5, 1)
    hiss = [h - l for h, l in zip(hiss, _lp1(hiss, 0.12, 1))]
    lag = int(0.9 * SR)
    foam_env = [0.0] * lag + [e * e for e in env[: n - lag]]
    foam_env = _lp1(foam_env, 0.0006, 1)
    out = [body[k] * (0.15 + 1.9 * env[k]) * 3.2 + hiss[k] * foam_env[k] * 1.4 for k in range(n)]
    return fade(out, fin=1.5, fout=1.5)


def sea_breeze(dur):
    """Beach: soft sea breeze, slow gusting low wind with faint air."""
    n = int(dur * SR)
    gust = _smooth_env(n, 2.5, 0.3, 1.0, a=0.00015)
    base = _lp1(_noise(n), 0.04, 2)
    air = _lp1(_noise(n), 0.2, 1)
    air = [a - b for a, b in zip(air, _lp1(air, 0.03, 1))]
    out = [(base[k] * 3.0 + air[k] * 0.5) * gust[k] for k in range(n)]
    return fade(out, fin=1.5, fout=1.5)


def distant_laughter(dur=2.2):
    """Beach: faint far-away tourist laughter, a few 'ha-ha' vowel bursts, lowpassed with reverb."""
    n = int(dur * SR)
    out = [0.0] * n
    formants = [(random.uniform(650, 850), 1.0), (random.uniform(1100, 1500), 0.6), (2600, 0.2)]
    for voice in range(2):
        f0 = random.uniform(190, 330) if voice else random.uniform(110, 170)
        t0 = random.uniform(0.0, 0.25)
        for i in range(random.randint(4, 6)):
            start = int((t0 + i * random.uniform(0.17, 0.24)) * SR)
            ln = int(random.uniform(0.09, 0.14) * SR)
            amp = (0.9 - i * 0.12) * (0.6 if voice else 1.0)
            ph = random.uniform(0, TAU)
            fi = f0 * (1.15 - i * 0.04)
            gains = [sum(w * math.exp(-((fi * h - fc) / (fc * 0.22)) ** 2) for fc, w in formants) / h ** 0.5
                     for h in range(1, 14)]
            for k in range(ln):
                if start + k >= n:
                    break
                env = math.sin(math.pi * k / ln) ** 1.5
                ph += TAU * fi * (1 + 0.02 * math.sin(k / SR * 40)) / SR
                s = 0.0
                for h, g in enumerate(gains, 1):
                    s += g * math.sin(ph * h)
                out[start + k] += s * env * amp * 0.22
    out = _lp1(out, 0.22, 2)
    out = _wet(out, size=0.8, mix=0.55, scale=1.3)
    return fade(out, fin=0.2, fout=0.5)


def icecream_bell(rings=2):
    """Beach: bright hand bell 'ting-ting' of an ice-cream seller (inharmonic partials)."""
    gap = 0.2
    n = int((gap * rings + 1.3) * SR)
    out = [0.0] * n
    ratios = [(1.0, 1.0, 0.9), (2.76, 0.55, 0.45), (5.4, 0.35, 0.22), (8.93, 0.18, 0.12)]
    for r in range(rings):
        base = random.uniform(2350, 2550)
        s0 = int(r * gap * SR)
        for ratio, g, tau in ratios:
            f = base * ratio * (1 + random.uniform(-0.003, 0.003))
            ph = 0.0
            for k in range(n - s0):
                tt = k / SR
                a = min(1.0, tt / 0.0015) * math.exp(-tt / tau)
                if a < 1e-4:
                    break
                ph += TAU * f / SR
                out[s0 + k] += g * a * math.sin(ph) * (0.8 if r else 1.0)
    out = [v * 0.35 for v in out]
    return _wet(out, size=0.5, mix=0.2, scale=0.8)


def cart_wheels_sand(dur):
    """Beach: wooden cart wheels grinding over sand, low rumble, granular crunch, occasional creak."""
    n = int(dur * SR)
    rumble = _lp1(_noise(n), 0.02, 2)
    sh = _lp1(_noise(n), 0.35, 1)
    sh = [a - b for a, b in zip(sh, _lp1(sh, 0.08, 1))]
    grains = [0.0] * n
    pos = 0
    glen = int(0.003 * SR)
    while True:
        wob = 0.55 + 0.45 * math.sin(TAU * 2.2 * pos / SR)
        pos += int(random.expovariate(1.0) * SR / (140 * (0.3 + wob))) + 1
        if pos >= n - glen:
            break
        a = random.uniform(0.2, 1.0) * (0.5 + 0.5 * wob)
        for j in range(glen):
            grains[pos + j] += a * random.uniform(-1, 1) * (1 - j / glen)
    grains = _lp1(grains, 0.5, 1)
    out = [rumble[k] * 3.5 + sh[k] * 0.35 + grains[k] * 0.9 for k in range(n)]
    t = random.uniform(0.6, 1.2)
    while t < dur - 0.5:
        ln = int(random.uniform(0.18, 0.3) * SR)
        f0 = random.uniform(300, 420)
        ph = 0.0
        s0 = int(t * SR)
        for k in range(min(ln, n - s0)):
            x = k / ln
            ph += TAU * (f0 * (1 + 0.5 * x) + 40 * math.sin(k / SR * 90)) / SR
            out[s0 + k] += 0.09 * math.sin(math.pi * x) * (math.sin(ph) + 0.4 * math.sin(2.02 * ph))
        t += random.uniform(1.4, 2.4)
    return fade(out, fin=0.4, fout=0.5)


def door_dingdong():
    """Night city: minimarket automatic door, soft pneumatic slide hiss then two-tone ding-dong chime."""
    n = int(2.4 * SR)
    out = [0.0] * n
    hn = int(0.55 * SR)
    hiss = bandnoise(hn, lambda k: 3200 - 1800 * k / hn, q=0.7)
    for k in range(hn):
        out[k] += hiss[k] * math.sin(math.pi * k / hn) ** 1.5 * 0.35
    for t0, f, g in ((0.35, 1318.5, 0.9), (0.75, 1046.5, 0.8)):
        s0 = int(t0 * SR)
        p1 = p2 = p3 = 0.0
        for k in range(n - s0):
            tt = k / SR
            a = min(1.0, tt / 0.003) * math.exp(-tt / 0.55)
            if a < 1e-4:
                break
            p1 += TAU * f / SR
            p2 += TAU * f * 2.0 / SR
            p3 += TAU * f * 3.01 / SR
            out[s0 + k] += g * a * (math.sin(p1) + 0.25 * math.sin(p2) * math.exp(-tt / 0.25)
                                    + 0.1 * math.sin(p3) * math.exp(-tt / 0.08))
    out = [v * 0.5 for v in out]
    return _wet(out, size=0.45, mix=0.18, scale=0.6)


def night_street_hum(dur):
    """Night city: soft distant traffic rumble with slow passing swells."""
    n = int(dur * SR)
    rumble = _lp1(_noise(n), 0.012, 2)
    mid = _lp1(_noise(n), 0.06, 2)
    swell = _smooth_env(n, 3.0, 0.4, 1.0, a=0.00012)
    out = [(rumble[k] * 6.0 + mid[k] * 1.3) * swell[k] for k in range(n)]
    return fade(out, fin=1.2, fout=1.5)


def neon_buzz(dur):
    """Night city: quiet 100/120 Hz neon-tube hum with harmonics and faint flicker crackle."""
    n = int(dur * SR)
    flick = _smooth_env(n, 0.4, 0.85, 1.0, a=0.002)
    out = []
    p = [0.0, 0.0]
    for k in range(n):
        s = 0.0
        for i, f in enumerate((100.0, 120.0)):
            p[i] += TAU * f / SR
            w = 0.6 if i else 1.0
            for h, g in ((1, 1.0), (2, 0.5), (3, 0.35), (5, 0.15)):
                s += g * w * math.sin(p[i] * h)
        out.append(s * flick[k] * 0.12)
    t = random.uniform(0.3, 1.5)
    clen = int(0.004 * SR)
    while t < dur - 0.1:
        s0 = int(t * SR)
        for j in range(clen):
            out[s0 + j] += random.uniform(-1, 1) * 0.05 * (1 - j / clen)
        t += random.expovariate(1 / 2.5)
    return fade(_lp1(out, 0.3, 1), fin=1.0, fout=1.0)


def whip_whoosh(dur=0.45):
    """Graphics: sharp fast whip-pan whoosh, bright sweep peaking at ~70% of the duration."""
    n = int(dur * SR)

    def fc(k):
        x = k / n
        if x < 0.7:
            return 500 * (7000 / 500) ** (x / 0.7)
        return 7000 * 0.45 ** ((x - 0.7) / 0.3)

    noise = bandnoise(n, fc, q=0.9)
    out = []
    for k in range(n):
        x = k / n
        env = (x / 0.7) ** 1.8 if x < 0.7 else math.cos((x - 0.7) / 0.3 * math.pi / 2) ** 2
        out.append(noise[k] * env * 1.5)
    return fade(out, fin=0.003, fout=0.005)


def magnet_snap():
    """Graphics: magnetic snap, short metallic click, low thump and tiny ring."""
    n = int(0.6 * SR)
    out = [0.0] * n
    for k, v in enumerate(click(3200, 0.03)):
        out[k] += v * 0.8
    ph = ph2 = ph3 = 0.0
    for k in range(n):
        tt = k / SR
        ph += TAU * (62 + 90 * math.exp(-tt / 0.02)) / SR
        out[k] += 0.9 * math.sin(ph) * math.exp(-tt / 0.07) * min(1, tt / 0.001)
        ph2 += TAU * 4180 / SR
        ph3 += TAU * 6350 / SR
        out[k] += 0.12 * math.sin(ph2) * math.exp(-tt / 0.12) + 0.06 * math.sin(ph3) * math.exp(-tt / 0.06)
    return fade(out, fout=0.01)
