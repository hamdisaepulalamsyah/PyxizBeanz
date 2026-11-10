"""Render procedural sound effects + music bed for Sejarah Cikajang (public/cikajang/sfx.wav)."""

import os
import sys
import wave

# Ensure the sfx package is importable when run as `python3 sfx/run_cikajang_sfx.py`.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from sfx.mix import Mix
from sfx.cues import cikajang_cue


def main():
    print(f"Synthesizing Cikajang SFX + bed for duration: {cikajang_cue.DURATION}s...")
    mix = Mix(cikajang_cue.DURATION, seed=1930)
    cikajang_cue.score(mix)
    stats = mix.master(target_lufs=cikajang_cue.TARGET_LUFS, ceiling_db=cikajang_cue.CEILING_DB)

    out_path = os.path.join(BASE_DIR, cikajang_cue.OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    mix.write(out_path)

    with wave.open(out_path, "rb") as wf:
        seconds = wf.getnframes() / wf.getframerate()
    print(
        f"Successfully generated {out_path}!\n"
        f"Duration: {seconds:.3f}s | Sounds placed: {mix.count}\n"
        f"Loudness: {stats['lufs']:.1f} LUFS (target {cikajang_cue.TARGET_LUFS}) | "
        f"True Peak: {stats['peak_db']:.1f} dBFS (ceiling {cikajang_cue.CEILING_DB}) | Drive: {stats['drive']}"
    )


if __name__ == "__main__":
    main()
