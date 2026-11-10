"""Approximate word/sentence timings for the Cikajang narration.

No forced aligner is available offline, so this detects speech/pause segments
in public/voice.wav (RMS energy, 10 ms hops), snaps every sentence boundary to
a real pause with a monotonic DP, then spreads words across the speech inside
each sentence by spoken-syllable weight. Output matches the shapes parsed by
src/persis/story.ts (`{word,start,end}` / `{text,start,end}` in seconds).

Replace public/cikajang/words.json with ElevenLabs / WhisperX timings when
available for frame-exact karaoke captions.

Usage: python3 scripts/cikajang_timings.py
"""

from __future__ import annotations

import array
import json
import math
import re
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / "public" / "voice.wav"
OUT_DIR = ROOT / "public" / "cikajang"

NARRATION = """
Di pintu stasiun tua ini, terukir dua angka: 1930… sampai 1982.
Stasiun ini berdiri di ketinggian 1.246 meter, disebut-sebut yang tertinggi di Asia Tenggara.
Apa yang terjadi di antara dua angka itu?
Namanya Stasiun Cikajang.
Dari sekitarnya mengalir hasil bumi: sayuran, beras, dan buah.
Masalahnya… bagaimana membawanya ke kota?
Jawabannya datang dari Belanda: perusahaan kereta api negara, Staatsspoorwegen, membangun jalurnya.
Koran De Koerier mencatat: jalur baru dibuka 31 Juli 1930.
Mulai Agustus, kereta melayani lalu lintas.
Pagi hari, berangkat dari Cibatu 06.04.
Tiba di Garut 06.58.
Lalu mendaki ke Cikajang… tiba 08.25.
Gerbongnya kelas tiga, bangkunya memanjang, mengangkut penumpang dan hasil bumi.
Tahun 1935, ada lima kali perjalanan Cibatu–Garut setiap hari.
Dan setelah perang merusak infrastruktur, tahun 1947 Belanda memperbaiki jalur Cikajang–Garut.
Tapi zaman berubah.
Jumlah penumpang dan barang terus menurun, sementara lokomotif makin tua dan terbatas.
Biaya operasional tak sebanding dengan pendapatan.
Tahun 1982, Garut–Cikajang ditutup.
Enam bulan kemudian, giliran Cibatu–Garut.
Seolah semuanya berhenti.
Puluhan tahun berlalu.
Bangunan stasiun sepanjang sekitar 50 meter itu kini dipenuhi rumput liar dan mural.
Tapi ukiran “Station Tjikadjang” masih terbaca.
Seolah menolak dilupakan.
Tahun 2022, kereta Cibatu–Garut hidup lagi.
Garut–Cikajang masuk rencana reaktivasi, tapi sampai awal 2026 masih belum aktif.
Dua angka di pintu itu: 1930 dan 1982.
Akankah suatu hari ada angka ketiga?
"""

ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]


def terbilang(n: int) -> str:
    if n < 12:
        return ONES[n]
    if n < 20:
        return terbilang(n - 10) + " belas"
    if n < 100:
        return terbilang(n // 10) + " puluh " + terbilang(n % 10)
    if n < 200:
        return "seratus " + terbilang(n - 100)
    if n < 1000:
        return terbilang(n // 100) + " ratus " + terbilang(n % 100)
    if n < 2000:
        return "seribu " + terbilang(n - 1000)
    return terbilang(n // 1000) + " ribu " + terbilang(n % 1000)


def spoken(token: str) -> str:
    """Best-effort spoken form so numbers get realistic durations."""
    t = token.strip("“”\"'.,:;?!…")
    if re.fullmatch(r"\d{2}\.\d{2}", t):  # clock time 06.04
        h, m = t.split(".")
        return terbilang(int(h)) + " " + ("nol " + terbilang(int(m)) if m.startswith("0") else terbilang(int(m)))
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", t):  # 1.246
        return terbilang(int(t.replace(".", "")))
    if re.fullmatch(r"\d{4}", t):  # years
        return terbilang(int(t))
    if t.isdigit():
        return terbilang(int(t))
    return t.replace("–", " ").replace("-", " ")


def syllables(token: str) -> float:
    s = spoken(token).lower()
    groups = re.findall(r"[aiueo]+", s)
    return max(1.0, float(len(groups)))


def load_rms(path: Path, hop_s: float = 0.01) -> tuple[list[float], float]:
    with wave.open(str(path)) as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        data = array.array("h", raw)
        scale = 32768.0
    elif sw == 4:
        data = array.array("i", raw)
        scale = 2147483648.0
    else:
        raise SystemExit(f"Unsupported sample width {sw}")
    hop = int(sr * hop_s)
    total = len(data) // ch
    rms: list[float] = []
    for start in range(0, total - hop, hop):
        acc = 0.0
        for i in range(start * ch, (start + hop) * ch, ch):
            v = data[i]
            acc += v * v
        rms.append(math.sqrt(acc / hop) / scale)
    return rms, total / sr


def main() -> None:
    rms, duration = load_rms(VOICE)
    hop = 0.01
    db = [20 * math.log10(max(v, 1e-6)) for v in rms]
    srt = sorted(db)
    floor = srt[int(len(srt) * 0.08)]
    peak = srt[int(len(srt) * 0.97)]
    thr = floor + (peak - floor) * 0.28
    speech = [d > thr for d in db]
    # Close tiny gaps (<60 ms) inside words.
    i = 0
    while i < len(speech):
        if not speech[i]:
            j = i
            while j < len(speech) and not speech[j]:
                j += 1
            if 0 < i and j < len(speech) and (j - i) * hop < 0.06:
                for k in range(i, j):
                    speech[k] = True
            i = j
        else:
            i += 1

    pauses: list[tuple[float, float]] = []
    i = 0
    while i < len(speech):
        if not speech[i]:
            j = i
            while j < len(speech) and not speech[j]:
                j += 1
            if (j - i) * hop >= 0.14:
                pauses.append((i * hop, j * hop))
            i = j
        else:
            i += 1

    first_voice = next(k for k, s in enumerate(speech) if s) * hop
    last_voice = (len(speech) - next(k for k, s in enumerate(reversed(speech)) if s)) * hop
    inner = [p for p in pauses if p[0] > first_voice + 0.2 and p[1] < last_voice - 0.2]

    # Speech-time coordinate: cumulative voiced seconds.
    cum = [0.0]
    for s in speech:
        cum.append(cum[-1] + (hop if s else 0.0))

    def speech_at(t: float) -> float:
        return cum[min(len(cum) - 1, max(0, int(t / hop)))]

    lines = [s.strip() for s in NARRATION.strip().splitlines() if s.strip()]
    # Align on phrases: ellipses and colons carry audible pauses mid-sentence.
    sentences: list[str] = []
    line_of: list[int] = []
    for li, line in enumerate(lines):
        for ph in re.split(r"(?<=[…:.?])\s+", line):
            if ph.strip():
                sentences.append(ph.strip())
                line_of.append(li)
    tokens = [s.split() for s in sentences]
    weights = [sum(syllables(t) for t in toks) for toks in tokens]
    total_w = sum(weights)
    total_speech = speech_at(last_voice) - speech_at(first_voice)
    expected: list[float] = []
    acc = 0.0
    for w in weights[:-1]:
        acc += w
        expected.append(speech_at(first_voice) + total_speech * acc / total_w)

    # Monotonic DP: boundary k -> pause index; favour long pauses.
    nb, npz = len(expected), len(inner)
    if npz < nb:
        raise SystemExit(f"Only {npz} pauses for {nb} sentence boundaries; lower the pause threshold.")
    inf = float("inf")
    cost = [[inf] * npz for _ in range(nb)]
    back = [[-1] * npz for _ in range(nb)]
    pmid = [speech_at((a + b) / 2) for a, b in inner]
    plen = [b - a for a, b in inner]

    def c(k: int, p: int) -> float:
        return (pmid[p] - expected[k]) ** 2 - 1.6 * min(plen[p], 0.9)

    for p in range(npz):
        cost[0][p] = c(0, p)
    for k in range(1, nb):
        best, arg = inf, -1
        for p in range(npz):
            if p - 1 >= 0 and cost[k - 1][p - 1] < best:
                best, arg = cost[k - 1][p - 1], p - 1
            if best < inf:
                cost[k][p] = best + c(k, p)
                back[k][p] = arg
    p = min(range(npz), key=lambda q: cost[nb - 1][q])
    chosen = [0] * nb
    for k in range(nb - 1, -1, -1):
        chosen[k] = p
        p = back[k][p]

    bounds = [(first_voice, inner[chosen[0]][0])]
    for k in range(1, nb):
        bounds.append((inner[chosen[k - 1]][1], inner[chosen[k]][0]))
    bounds.append((inner[chosen[-1]][1], last_voice))

    words_out = []
    sentences_out: list[dict] = []
    for (start, end), li, toks in zip(bounds, line_of, tokens):
        if len(sentences_out) <= li:
            sentences_out.append({"text": lines[li], "start": round(start, 3), "end": round(end, 3)})
        else:
            sentences_out[li]["end"] = round(end, 3)
        s0, s1 = speech_at(start), speech_at(end)
        span = max(1e-3, s1 - s0)
        tw = [syllables(t) for t in toks]
        tot = sum(tw)

        def time_at(sp: float) -> float:
            # Inverse of the speech coordinate inside [start, end].
            lo, hi = int(start / hop), int(end / hop)
            for f in range(lo, hi + 1):
                if cum[min(f, len(cum) - 1)] >= sp:
                    return f * hop
            return end

        a = 0.0
        for tok, w in zip(toks, tw):
            ws = time_at(s0 + span * a / tot)
            a += w
            we = time_at(s0 + span * a / tot)
            words_out.append({"word": tok, "start": round(ws, 3), "end": round(max(we, ws + 0.06), 3)})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "words.json").write_text(json.dumps(words_out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT_DIR / "sentences.json").write_text(json.dumps(sentences_out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"duration {duration:.2f}s, voice {first_voice:.2f}-{last_voice:.2f}s, {len(inner)} pauses, {len(words_out)} words")
    for s in sentences_out:
        print(f"{s['start'] * 30:7.0f} {s['end'] * 30:7.0f}  {s['text'][:70]}")


if __name__ == "__main__":
    main()
