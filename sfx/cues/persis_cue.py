"""Sound design cue sheet for Sejarah Persis: Dalilnya Mana?

Pure procedural Foley, atmospheric, and kinetic sound design without background music.
Calibrated with polite gains and mastered to -22.0 LUFS so narration stays 100% clear.
"""

from sfx.synth import click, pop, whoosh, riser, chime
from sfx.persis_synth import (
    wind_breeze,
    carriage_hooves,
    page_turn,
    scale_tilt,
    quill_write,
    podium_knock,
    printing_press_mechanical,
    ocean_surf,
    paper_flutter,
    steam_locomotive,
    steam_whistle,
    parliament_gavel_taps,
    map_reunification_snap,
    golden_seal_climax,
)

DURATION = 78.916
OUT = "public/sfx.wav"
TARGET_LUFS = -22.0  # Polite background level to ensure voice narration is always crystal clear


def score(mix, tl=None):
    put = mix.put

    # ── SHOT 1: BANDUNG 1923 (0.0s - 9.83s) ───────────────────────────────────
    # Opening subtle entry into colonial Bandung
    put(0.05, whoosh(1.1, 160, 2200, peak=0.35), gain=0.10)
    put(0.2, wind_breeze(9.5, fc=380), gain=0.04)
    put(0.48, pop(420, 850), gain=0.10, pan=-0.4)  # Chip reveal
    put(1.0, carriage_hooves(count=14, tempo=0.42), gain=0.08, pan=-0.2)  # Cobblestone street
    # Question setup "Dalilnya mana?"
    put(8.3, click(1600), gain=0.06)
    # Transition dip to Langgar
    put(9.2, whoosh(0.75, 450, 2600, peak=0.6), gain=0.11)

    # ── SHOT 2: LANGGAR, BANDUNG (9.83s - 24.50s) ────────────────────────────
    put(9.85, click(2100), gain=0.08, pan=-0.4)  # Chip reveal
    put(10.0, wind_breeze(14.2, fc=320), gain=0.03)  # Langgar acoustic breeze
    # Zamzam & Yunus dialogue & scale of dalil
    put(13.8, scale_tilt(1.2), gain=0.08, pan=-0.2)
    # "Setiap amalan ditimbang dengan Al-Qur'an dan Sunnah"
    put(17.9, scale_tilt(1.4), gain=0.09, pan=0.0)
    put(19.4, page_turn(0.55), gain=0.09, pan=0.3)  # Holy scripture page turn
    # "Persatuan Islam"
    put(22.8, chime([659.25, 987.77], dur=1.2, tau=0.4), gain=0.06, pan=0.1)
    # Transition dip to Ahmad Hassan study
    put(23.9, whoosh(0.7, 400, 2800, peak=0.55), gain=0.11)

    # ── SHOT 3: AHMAD HASSAN STUDY & DEBATE (24.50s - 33.00s) ─────────────────
    put(24.55, pop(480, 1050), gain=0.09, pan=-0.4)  # Chip reveal
    put(24.8, wind_breeze(8.0, fc=290), gain=0.03)
    # Ahmad Hassan writes answers to the community
    put(28.3, quill_write(2.3), gain=0.09, pan=-0.2)
    put(29.7, page_turn(0.48), gain=0.08, pan=-0.1)
    # Hassan ascends podium & raises finger with conviction
    put(31.2, whoosh(0.5, 300, 1800, peak=0.4), gain=0.08, pan=0.2)
    put(31.45, podium_knock(0.45), gain=0.14, pan=0.2)  # Polite wooden podium knock
    # Transition dip to printing press
    put(32.4, whoosh(0.7, 350, 2600, peak=0.55), gain=0.11)

    # ── SHOT 4: PERCETAKAN MAJALAH PEMBELA ISLAM (33.00s - 41.00s) ───────────
    put(33.05, pop(450, 920), gain=0.09, pan=-0.4)
    # 1929 Mechanical letterpress printing press (calibrated down to background rhythm)
    put(33.15, printing_press_mechanical(7.7), gain=0.10, pan=0.1)
    # Transition dip across the sea to Flores
    put(40.4, whoosh(0.75, 300, 2800, peak=0.6), gain=0.12)

    # ── SHOT 5: ENDE, FLORES - BUNG KARNO (41.00s - 55.40s) ──────────────────
    put(41.05, click(1800), gain=0.08, pan=-0.4)
    # Gentle coastal ocean surf of Ende Flores
    put(41.2, ocean_surf(14.0), gain=0.08, pan=0.0)
    # Bung Karno writing letter under breadfruit tree
    put(46.0, quill_write(2.2), gain=0.08, pan=-0.2)
    put(47.8, page_turn(0.42), gain=0.07, pan=-0.1)
    # Letters taking flight across the sea to Bandung
    put(49.8, whoosh(0.8, 400, 2400, peak=0.4), gain=0.07, pan=0.2)
    put(50.2, paper_flutter(2.6), gain=0.08, pan=0.3)
    put(52.6, paper_flutter(2.4), gain=0.07, pan=-0.2)
    # Long flight whoosh back to Java
    put(54.6, whoosh(0.9, 220, 3200, peak=0.65), gain=0.12)

    # ── SHOT 6: PESANTREN PERSIS & KERETA BANGIL (55.40s - 63.00s) ───────────
    put(55.45, pop(420, 950), gain=0.09, pan=-0.4)
    # Pesantren bell
    put(55.7, chime([587.33, 880.0], dur=1.6, tau=0.6), gain=0.08, pan=-0.3)
    # Steam train to Bangil
    put(57.1, steam_whistle(1.8), gain=0.12, pan=0.2)
    put(57.3, steam_locomotive(5.6), gain=0.10, pan=0.1)
    # Transition dip to Parliament
    put(62.3, whoosh(0.75, 380, 2800, peak=0.55), gain=0.11)

    # ── SHOT 7: SIDANG PARLEMEN RIS 1950 - NATSIR (63.00s - 72.00s) ──────────
    put(63.05, pop(520, 1150), gain=0.09, pan=-0.4)
    put(63.2, wind_breeze(8.5, fc=270), gain=0.03)
    # Gavel strikes by speaker
    put(64.15, parliament_gavel_taps(count=3, interval=0.32), gain=0.14, pan=0.0)
    # Mosi Integral reunification snap
    put(67.4, map_reunification_snap(0.75), gain=0.11, pan=0.0)
    # Transition dip to modern Bandung
    put(71.3, whoosh(0.85, 280, 3400, peak=0.68), gain=0.12)

    # ── SHOT 8: GEDUNG SATE MODERN CLIMAX (72.00s - 78.916s) ──────────────────
    put(72.05, pop(600, 1350), gain=0.09, pan=-0.4)
    put(72.2, wind_breeze(6.5, fc=330), gain=0.04)
    # Climax riser leading to final question
    put(75.2, riser(2.4, f0=150, f1=3600), gain=0.11, pan=0.0)
    # Final golden seal slam: "DALILNYA MANA?"
    put(77.65, golden_seal_climax(3.2), gain=0.22, pan=0.0)
