"""Render procedural sound effects for Sejarah Persis."""

import os
import sys

# Ensure sfx package is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from sfx.mix import Mix
from sfx.cues import persis_cue

def main():
    print(f"Synthesizing SFX for duration: {persis_cue.DURATION}s...")
    mix = Mix(persis_cue.DURATION, seed=42)
    persis_cue.score(mix)
    stats = mix.master(target_lufs=persis_cue.TARGET_LUFS, ceiling_db=-2.0)
    
    out_path = os.path.join(BASE_DIR, persis_cue.OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    mix.write(out_path)
    
    print(
        f"Successfully generated {out_path}!\n"
        f"Duration: {persis_cue.DURATION}s | Sounds placed: {mix.count}\n"
        f"Loudness: {stats['lufs']:.1f} LUFS | True Peak: {stats['peak_db']:.1f} dBFS | Drive: {stats['drive']}"
    )

if __name__ == "__main__":
    main()
