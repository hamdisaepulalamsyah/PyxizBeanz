#!/usr/bin/env python3
"""Acoustic subtitle aligner for PyxisLab shorts.

Rebuilds ``words.json`` (per-word timing) from a narration WAV and the
per-sentence script ``sentences.json`` so captions follow the real voice,
including the comma / breath pauses *inside* long sentences.

Pipeline
    1. Speech islands: RMS energy on 10 ms hops (Python stdlib ``wave`` +
       ``array``), or FFmpeg ``silencedetect`` with ``--backend ffmpeg``.
       Silences of at least ``--min-gap`` (default 160 ms) split islands.
    2. Optional ASR: with ``--backend whisper`` (or ``auto`` when
       ``faster-whisper`` / ``openai-whisper`` is importable) word timestamps
       come straight from Whisper and are matched to the script words.
    3. Otherwise a dynamic programme assigns each sentence's words to its
       speech islands.  Cost = squared log-ratio between an island group's
       speech time and the time its syllables should take, a strong bonus
       for breaking at ``, : ; … . ? !``, and a penalty for words that
       straddle a real pause.  Indonesian numerals are weighted by their
       spoken syllables (1935 -> "seribu sembilan ratus tiga puluh lima" = 14).
    4. Inside a group, words are laid out on speech time only (gaps skipped),
       so no word is ever stretched across a silence.

Usage
    python3 tools/align_subtitles.py public/cikajang/voice.wav \\
        public/cikajang/sentences.json --out public/cikajang/words.json

Only audio -> JSON processing; it never renders video.
"""
from __future__ import annotations

import argparse
import array
import json
import math
import re
import shutil
import subprocess
import sys
import wave
from dataclasses import dataclass

HOP = 0.010  # analysis hop, seconds
BREAK_PUNCT = (',', ':', ';', '…', '.', '?', '!', '—')
VOWELS = set('aeiouy')
# Vowel pairs spoken as one syllable (Indonesian diphthongs + Dutch spellings
# in colonial names such as Koerier / Staatsspoorwegen).
ONE_SYLLABLE_PAIRS = {'ai', 'au', 'oi', 'ei', 'oe', 'ie', 'ij', 'aa', 'ee', 'oo', 'uu'}


# --------------------------------------------------------------------------
# Indonesian spoken numerals
# --------------------------------------------------------------------------
_DIGITS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']


def number_words(n: int) -> list[str]:
    """Indonesian cardinal, e.g. 1935 -> seribu sembilan ratus tiga puluh lima."""
    if n < 10:
        return [_DIGITS[n]]
    if n < 20:
        if n == 10:
            return ['sepuluh']
        if n == 11:
            return ['sebelas']
        return [_DIGITS[n - 10], 'belas']
    if n < 100:
        tens, rest = divmod(n, 10)
        return [_DIGITS[tens], 'puluh'] + (number_words(rest) if rest else [])
    if n < 1000:
        hundreds, rest = divmod(n, 100)
        head = ['seratus'] if hundreds == 1 else [_DIGITS[hundreds], 'ratus']
        return head + (number_words(rest) if rest else [])
    if n < 1_000_000:
        thousands, rest = divmod(n, 1000)
        head = ['seribu'] if thousands == 1 else number_words(thousands) + ['ribu']
        return head + (number_words(rest) if rest else [])
    millions, rest = divmod(n, 1_000_000)
    return number_words(millions) + ['juta'] + (number_words(rest) if rest else [])


def spoken_form(token: str) -> list[str]:
    """Expand a script token into the words a narrator actually says."""
    core = token.strip('“”"\'()[]…,.:;?!')
    # Clock time 06.04 -> "enam lewat empat"; 08.25 -> "delapan lewat dua puluh lima".
    m = re.fullmatch(r'(\d{1,2})[.:](\d{2})', core)
    if m and len(m.group(1)) == 2 and m.group(1).startswith('0'):
        hh, mm = int(m.group(1)), int(m.group(2))
        return number_words(hh) + (['lewat'] + number_words(mm) if mm else [])
    # Thousands separator 1.246 -> 1246.
    if re.fullmatch(r'\d{1,3}(\.\d{3})+', core):
        return number_words(int(core.replace('.', '')))
    if re.fullmatch(r'\d+', core):
        return number_words(int(core))
    parts = re.split(r'[–\-—/]', core)
    return [p for p in parts if p]


def syllables(word: str) -> int:
    w = word.lower()
    count, prev = 0, ''
    for ch in w:
        if ch in VOWELS:
            if prev and prev in VOWELS and (prev + ch) in ONE_SYLLABLE_PAIRS:
                pass  # same syllable as previous vowel
            else:
                count += 1
        prev = ch
    return max(1, count)


def token_weight(token: str) -> float:
    return float(sum(syllables(w) for w in spoken_form(token)))


def breaks_after(token: str) -> bool:
    t = token.rstrip('”"\')]')
    return t.endswith(BREAK_PUNCT)


# --------------------------------------------------------------------------
# Speech islands
# --------------------------------------------------------------------------
@dataclass
class Island:
    start: float
    end: float

    @property
    def dur(self) -> float:
        return self.end - self.start


def rms_db_track(path: str) -> list[float]:
    with wave.open(path, 'rb') as wf:
        channels, width, rate, frames = wf.getnchannels(), wf.getsampwidth(), wf.getframerate(), wf.getnframes()
        if width != 2:
            raise SystemExit(f'{path}: only 16-bit PCM is supported (got {8 * width}-bit)')
        raw = wf.readframes(frames)
    samples = array.array('h')
    samples.frombytes(raw)
    if sys.byteorder == 'big':
        samples.byteswap()
    if channels > 1:
        samples = array.array('h', samples[::channels])
    hop = max(1, int(rate * HOP))
    out = []
    for i in range(0, len(samples) - hop + 1, hop):
        chunk = samples[i:i + hop]
        acc = sum(s * s for s in chunk)
        rms = math.sqrt(acc / hop) / 32768.0
        out.append(20.0 * math.log10(rms) if rms > 1e-9 else -180.0)
    return out


def percentile(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]


def islands_rms(path: str, min_gap: float, threshold_db: float | None) -> tuple[list[Island], float]:
    db = rms_db_track(path)
    if threshold_db is None:
        floor, loud = percentile(db, 0.10), percentile(db, 0.95)
        threshold_db = max(floor + 10.0, loud - 30.0)
    speech = [v > threshold_db for v in db]
    islands: list[Island] = []
    start = None
    for i, on in enumerate(speech + [False]):
        if on and start is None:
            start = i
        elif not on and start is not None:
            islands.append(Island(start * HOP, i * HOP))
            start = None
    return merge_islands(islands, min_gap), threshold_db


def islands_ffmpeg(path: str, min_gap: float, threshold_db: float) -> list[Island]:
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg not found; use --backend rms')
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af',
           f'silencedetect=n={threshold_db}dB:d={min_gap}', '-f', 'null', '-']
    log = subprocess.run(cmd, capture_output=True, text=True).stderr
    with wave.open(path, 'rb') as wf:
        total = wf.getnframes() / wf.getframerate()
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    islands, cursor = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s > cursor:
            islands.append(Island(cursor, s))
        cursor = e
    if cursor < total:
        islands.append(Island(cursor, total))
    return islands


def merge_islands(islands: list[Island], min_gap: float) -> list[Island]:
    merged: list[Island] = []
    for isl in islands:
        if merged and isl.start - merged[-1].end < min_gap:
            merged[-1].end = isl.end
        else:
            merged.append(Island(isl.start, isl.end))
    # Drop clicks shorter than 40 ms that sit alone.
    return [i for i in merged if i.dur >= 0.04]


def sentence_islands(all_islands: list[Island], start: float, end: float) -> list[Island]:
    pad = 0.12
    picked = []
    for isl in all_islands:
        s, e = max(isl.start, start - pad), min(isl.end, end + pad)
        if e - s >= 0.04:
            picked.append(Island(s, e))
    if not picked:
        return [Island(start, end)]
    # Keep the sentence envelope tight to the script timing.
    picked[0].start = max(picked[0].start, start - pad)
    picked[-1].end = min(picked[-1].end, end + pad)
    return picked


# --------------------------------------------------------------------------
# Dynamic programme: words -> island groups
# --------------------------------------------------------------------------
def align_sentence(tokens: list[str], islands: list[Island]) -> list[tuple[float, float]]:
    n, m = len(tokens), len(islands)
    weights = [token_weight(t) for t in tokens]
    speech_total = sum(i.dur for i in islands)
    rate = speech_total / max(1e-6, sum(weights))
    wprefix = [0.0]
    for w in weights:
        wprefix.append(wprefix[-1] + w)

    def group_cost(a: int, b: int, p: int, q: int) -> float:
        """Words a..b-1 spoken over islands p..q-1."""
        speech = sum(islands[k].dur for k in range(p, q))
        expected = (wprefix[b] - wprefix[a]) * rate
        cost = math.log(max(speech, 1e-3) / max(expected, 1e-3)) ** 2 * 4.0
        # A real pause swallowed inside a word group is unlikely; long ones more so.
        for k in range(p, q - 1):
            gap = islands[k + 1].start - islands[k].end
            cost += 0.6 + 4.0 * gap
        last = tokens[b - 1]
        if q < m:  # this group ends at a pause
            cost += -1.2 if breaks_after(last) else 0.35
        return cost

    INF = float('inf')
    # best[i][j]: cost of placing first i words onto first j islands.
    best = [[INF] * (m + 1) for _ in range(n + 1)]
    back: list[list[tuple[int, int] | None]] = [[None] * (m + 1) for _ in range(n + 1)]
    best[0][0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            for a in range(0, i):
                for p in range(0, j):
                    if best[a][p] == INF:
                        continue
                    c = best[a][p] + group_cost(a, i, p, j)
                    if c < best[i][j]:
                        best[i][j] = c
                        back[i][j] = (a, p)
    if best[n][m] == INF:  # more islands than words: impossible partition
        return spread_on_speech(weights, islands)
    groups = []
    i, j = n, m
    while i > 0:
        a, p = back[i][j]  # type: ignore[misc]
        groups.append((a, i, p, j))
        i, j = a, p
    groups.reverse()
    out: list[tuple[float, float]] = []
    for a, b, p, q in groups:
        out.extend(spread_on_speech(weights[a:b], islands[p:q]))
    return out


def spread_on_speech(weights: list[float], islands: list[Island]) -> list[tuple[float, float]]:
    """Lay words over speech time only, proportional to their syllables."""
    total_speech = sum(i.dur for i in islands)
    total_w = sum(weights) or 1.0

    def at(speech_t: float, prefer_next: bool) -> float:
        acc = 0.0
        for k, isl in enumerate(islands):
            if speech_t < acc + isl.dur - 1e-9 or k == len(islands) - 1:
                return isl.start + min(isl.dur, max(0.0, speech_t - acc))
            if abs(speech_t - (acc + isl.dur)) < 1e-9:
                return islands[k + 1].start if prefer_next else isl.end
            acc += isl.dur
        return islands[-1].end

    spans, cum = [], 0.0
    for w in weights:
        s_t = cum / total_w * total_speech
        cum += w
        e_t = cum / total_w * total_speech
        spans.append((at(s_t, True), at(e_t, False)))
    return spans


# --------------------------------------------------------------------------
# Optional Whisper backend
# --------------------------------------------------------------------------
def whisper_words(path: str, model_name: str) -> list[tuple[str, float, float]] | None:
    try:
        from faster_whisper import WhisperModel  # type: ignore
        model = WhisperModel(model_name, compute_type='int8')
        segments, _ = model.transcribe(path, language='id', word_timestamps=True)
        return [(w.word.strip(), w.start, w.end) for seg in segments for w in (seg.words or [])]
    except ImportError:
        pass
    try:
        import whisper  # type: ignore
        result = whisper.load_model(model_name).transcribe(path, language='id', word_timestamps=True)
        return [(w['word'].strip(), w['start'], w['end']) for seg in result['segments'] for w in seg.get('words', [])]
    except ImportError:
        return None


def norm(s: str) -> str:
    return re.sub(r'[^0-9a-z]', '', s.lower())


def map_whisper(tokens: list[str], asr: list[tuple[str, float, float]], start: float, end: float) -> list[tuple[float, float]] | None:
    import difflib
    local = [w for w in asr if w[2] > start - 0.2 and w[1] < end + 0.2]
    if not local:
        return None
    sm = difflib.SequenceMatcher(a=[norm(t) for t in tokens], b=[norm(w[0]) for w in local], autojunk=False)
    times: list[tuple[float, float] | None] = [None] * len(tokens)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            _, s, e = local[blk.b + k]
            times[blk.a + k] = (s, e)
    if sum(t is not None for t in times) < max(1, len(tokens) // 2):
        return None
    # Interpolate unmatched tokens between matched neighbours by syllables.
    filled: list[tuple[float, float]] = []
    i = 0
    while i < len(tokens):
        if times[i] is not None:
            filled.append(times[i])  # type: ignore[arg-type]
            i += 1
            continue
        j = i
        while j < len(tokens) and times[j] is None:
            j += 1
        lo = filled[-1][1] if filled else start
        hi = times[j][0] if j < len(tokens) else end  # type: ignore[index]
        filled.extend(spread_on_speech([token_weight(t) for t in tokens[i:j]], [Island(lo, max(hi, lo + 0.05))]))
        i = j
    return filled


# --------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('wav')
    ap.add_argument('sentences')
    ap.add_argument('--out', required=True)
    ap.add_argument('--backend', choices=['auto', 'rms', 'ffmpeg', 'whisper'], default='auto')
    ap.add_argument('--min-gap', type=float, default=0.16, help='minimum pause between islands (s)')
    ap.add_argument('--threshold-db', type=float, default=None, help='speech threshold dBFS (default: adaptive)')
    ap.add_argument('--whisper-model', default='small')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    sentences = json.load(open(args.sentences, encoding='utf-8'))
    asr = None
    if args.backend in ('auto', 'whisper'):
        asr = whisper_words(args.wav, args.whisper_model)
        if asr is None and args.backend == 'whisper':
            raise SystemExit('Neither faster-whisper nor openai-whisper is installed')
    if args.backend == 'ffmpeg':
        thr = args.threshold_db if args.threshold_db is not None else -35.0
        islands = merge_islands(islands_ffmpeg(args.wav, args.min_gap, thr), args.min_gap)
        source = f'ffmpeg silencedetect {thr} dB'
    else:
        islands, thr = islands_rms(args.wav, args.min_gap, args.threshold_db)
        source = f'RMS islands, threshold {thr:.1f} dBFS'
    if asr is not None:
        source = 'whisper word timestamps (RMS fallback per sentence)'

    words_out = []
    inner_pauses = 0
    for sent in sentences:
        tokens = sent['text'].split()
        s0, s1 = float(sent['start']), float(sent['end'])
        isl = sentence_islands(islands, s0, s1)
        inner_pauses += len(isl) - 1
        spans = map_whisper(tokens, asr, s0, s1) if asr is not None else None
        if spans is None:
            spans = align_sentence(tokens, isl)
        phrase, phrase_start, prev_end = [], None, None
        lines = []
        for tok, (a, b) in zip(tokens, spans):
            a, b = round(a, 2), round(max(b, a + 0.05), 2)
            words_out.append({'word': tok, 'start': a, 'end': b})
            if prev_end is not None and a - prev_end > 0.1:
                lines.append(f'      {phrase_start:7.2f}-{prev_end:7.2f}  {" ".join(phrase)}')
                phrase, phrase_start = [], None
            if phrase_start is None:
                phrase_start = a
            phrase.append(tok)
            prev_end = b
        lines.append(f'      {phrase_start:7.2f}-{prev_end:7.2f}  {" ".join(phrase)}')
        if not args.quiet:
            print(f'[{s0:7.2f}-{s1:7.2f}] {len(isl)} island(s)  {sent["text"]}')
            print('\n'.join(lines))

    with open(args.out, 'w', encoding='utf-8') as fh:
        # One word per line, matching the hand-maintained files.
        fh.write('[\n' + ',\n'.join('  ' + json.dumps(w, ensure_ascii=False) for w in words_out) + '\n]\n')
    print(f'\n{source}; {len(islands)} islands, {inner_pauses} in-sentence pauses; '
          f'{len(words_out)} words -> {args.out}')


if __name__ == '__main__':
    main()
