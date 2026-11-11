"""Generate public/jam-gadang/sfx.wav from sfx/cues/jam_gadang_cue.py."""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sfx.cues.jam_gadang_cue import CEILING_DB, DURATION, OUT, TARGET_LUFS, build
from sfx.mix import Mix


def main():
    mix = Mix(DURATION, seed=77)
    build(mix)
    mix.master(target_lufs=TARGET_LUFS, ceiling_db=CEILING_DB)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    mix.write(OUT)
    print(f"Wrote {OUT} ({DURATION:.2f}s, target {TARGET_LUFS} LUFS)")


if __name__ == "__main__":
    main()
