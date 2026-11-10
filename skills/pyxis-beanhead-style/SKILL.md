---
name: pyxis-beanhead-style
description: Standar produksi resmi v2.2 kartun 3D vertikal gaya Bean-Head PyxisLab (hibrida 2D Bean-Head Nusantara full-figure + variable-weight ink + ekspresi snappy per-beat + efek komikal 2D, Z-order bahu-lengan belakang/depan natural, walk cycle bipedal anti-wayang, color script naratif & skala 3D megah, macro hook & cross-dissolve, tipografi diegetik per era tanpa terpotong, hero flora komposit, serta subtitle akustik & ekosistem Whisper/FFmpeg/yt-dlp/HyperFrames).
---

# pyxis-beanhead-style (v2.2 — PyxisLab Cinematic Bean-Head Standard)

Standar acuan **mutlak** untuk semua video short kartun 3D vertikal 9:16 PyxisLab di Remotion. Menggabungkan keunikan karakter **Bean-Head full-figure khas PyxisLab** dengan sinematografi, *color script*, ritme, dan efek hidup ala film pendek animasi 2D-dalam-3D terbaik.

Implementasi referensi di repo ini:

| File | Isi |
| --- | --- |
| `src/persis/toon.ts` | Sumber asli kepala Bean-Head (`Haji Zamzam`, `A. Hassan`, dst.). |
| `src/cikajang/toon.ts` | **Implementasi acuan terkini.** Bean-Head full-figure, variable-weight ink, soft crescent shade, ekspresi snappy (termasuk `shock`/`smirk`/`laugh`), Z-order lengan belakang/depan, walk cycle bipedal natural, figuran, dan hewan. |
| `src/cikajang/story.ts` | Shot list, **Color Script Table** per fase emosi, macro hook, ritme 2–3 dtk di konflik, kamera kinematik (smootherstep, creeping hold, kick, roll, cross-dissolve), framing anti-terpotong. |
| `src/cikajang/worlds.ts` | Set 3D skala megah, hero prop detail specular/mekanisme, lighting rig naratif, film pass. |
| `src/cikajang/flora.ts` | Hero flora & prop hidup komposit (kol berlapis daun, daun bawang, ajir bambu, keranjang sayur). |
| `src/cikajang/signage.ts` | Tipografi diegetik per era + auto-fit `measureText` anti-overflow. |
| `src/cikajang/fonts.ts` | Peta font per era (`ERA_FONT`) + CSS + Font Guard `1200 ms`. |
| `src/cikajang/Cikajang.tsx` | StageManager, contact shadow, frozen sun, efek komikal 2D overlay (`speedLines`/`sweatDrop`), caption tajam anti-pudar, hook macro slam, font guard. |
| `tools/align_subtitles.py` | Penyelaras `words.json` berbasis akustik (`Whisper` / `FFmpeg silencedetect` + RMS speech-island DP + suku kata angka Indonesia). |

Kalau ragu, **tiru kode acuan**. Dilarang keras membuat: manekin realistis, karakter bola putih polos tanpa ciri khas, kaki tongkat, jalan melompat seperti wayang, bahu menonjol di depan dada, T-pose kaku, atau teks papan/tahun yang terpotong.

---

## 1. Format & Arsitektur

| Item | Nilai |
| --- | --- |
| Resolusi | 1080 × 1920 (9:16), 30 fps (draft/preview `--scale=0.75`, final `--scale=1`) |
| Renderer | `@remotion/three` `<ThreeCanvas … flat dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>` |
| Karakter | Kartu Canvas2D → `THREE.CanvasTexture` di `MeshToonMaterial` (billboard yaw-only) |
| Determinisme | Semua nilai = fungsi murni dari `frame`. Tidak boleh ada `Math.random()` atau `Date`. |
| Struktur per proyek | `src/<project>/story.ts`, `toon.ts`, `worlds.ts`, `<Project>.tsx` (+ `flora.ts`, `signage.ts`, `fonts.ts` bila kompleks) |

---

## 2. Karakter Full-Figure (Kaki & Sepatu Wajib Menapak Lantai)

```ts
const LW = 768, LH = 1024;            // kanvas logis (backing 0.75× → 576 × 768)
const SOLE = 975;                     // garis sol sepatu = origin billboard = lantai (y = 0)
export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (1.7 * LW) / LH;   // 1.275 m
const PX = LH / 1.7;                  // ≈ 602 px per meter (skala 1)
const HEAD_HALF_W = 240;              // ukuran kepala Persis
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;
const HEAD_SCALE = 118 / HEAD_HALF_W; // lebar kepala di kartu ≈ 236 px
const HEAD_H_PX = HEAD_HALF_H * 2 * HEAD_SCALE;     // ≈ 222 px (HH)
const HIP_Y = SOLE - HEAD_H_PX * 1.35;              // kaki ≈ 1.35 × HH
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;          // torso ≈ 1.1 × HH
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;
```

- Geometri plane di-`translate(0, 0.85 - (LH - SOLE)/PX, 0)`, sehingga **sol sepatu tepat di `y = 0`**.
- Skala tokoh di world: tokoh utama **1.25** (atau lebih kecil relatif terhadap arsitektur megah agar menciptakan **rasio skala unik: karakter imut di dalam ruang 3D besar**), dewasa **1.1–1.15**, anak **0.85**.
- **Duduk (`pose: 'sit'`):** pinggul turun ke `SEAT_Y = HIP_Y + 40`, sepatu tetap menapak.

---

## 3. Kepala Bean-Head, Variable-Weight Ink & Ekspresi Snappy

- **Bean-Head Nusantara:** Tetap pertahankan identitas kulit hangat, pipi blush lembut, mata ekspresif, dan hijab rapi berbros (atau peci/caping/kepi).
- **Variable-Weight Ink (Gaya Unik Film Pendek):**
  - Outline utama kepala & busana TIDAK seragam tipisnya: **lebih tebal (≈ 1.35×) di sisi bawah & sisi bayangan**, dan **lebih tipis (≈ 0.75×) di bagian atas/mahkota terkena cahaya**. Memberi bobot grafis mahal ala ilustrasi tinta tangan!
- **Soft Crescent Shade & Rim Highlight:**
  - Bayangan bulan sabit halus di sisi menjauh dari cahaya utama + goresan *rim light* tipis mengikuti warna pencahayaan fase cerita (emas senja, biru bulan, atau terang siang).
- **Ekspresi Ditukar Snappy Per Beat (Anti-Morph Lembek):**
  - Gunakan pertukaran ekspresi **tegas & cepat (crossfade ≤ 2 frame atau snap per beat)** yang selalu dibarengi kedipan/reaksi mikro tepat **0–3 frame sebelum kata kunci narasi**.
  - Kosakata ekspresi lengkap: `neutral`, `warm`, `serious`, `thinking`, `sad`, `wonder`, **`smirk` (melirik sinis), `shock` (kaget/panik), `laugh` (tertawa lepas)**.
  - **Kehidupan Idle Wajib:** kedip 4 frame (`half/shut/shut/half`) tiap 1.5–4 detik, napas `0.22 Hz`, pergeseran berat `0.11 Hz`, *saccade* mata.

---

## 4. Lengan, Z-Order Bahu, Walk Cycle & Efek Komikal 2D

### 4.1 Z-Order Lapisan Lengan (Wajib `FRONT_POSES`)
- Urutan lukis: **lengan belakang → torso → kepala → body prop → lengan depan → semua mitten → hand prop**.
- Lengan santai/samping (`side`, `hip`, `pocket`, `point`, `pointHigh`, `pointSide`, `spread`, `trace`, `traceLow`, `palm`, `wave`, `reachUp`, `hammer`, `suitcase`, `lampLow`, `carryShoulder`) WAJIB di belakang torso & hijab (`front: false`) agar pangkal bahu tertutup alami.
- Lengan menyilang depan (`strap`, `write`, `pressPage`, `chalk`, `holdBoard`, `hug`, `basketLap`, `ticket`, `newspaper`, `whistle`) di depan torso (`front: true`) dengan pangkal bahu tanpa kapsul outline tebal memotong kerah.
- **Dilarang T-Pose:** Siku `spread`/`palm`/`pointSide` selalu turun natural oleh gravitasi.

### 4.2 Walk Cycle Bipedal Nyata (Anti-Lompat Wayang)
- **Ayunan Elips + Tekuk Lutut:** `strideX = sin(phase) * stride * walkDir`, kaki penumpu menempel datar di `SOLE = 975` agar tidak meluncur (*skating*: `walkPhase = travelled / scale * WALK_PHASE_PER_METRE`), kaki ayun terangkat ≤ 20 px dengan kemiringan sepatu.
- **Bob Halus:** `3.5 px` (`+cos(2φ) * 3.5`, titik terendah di *double-support* saat kaki menapak), condong torso `4°`, dan ayunan lengan berlawanan fase (`side`).
- **Organic Gesture Easing:** Smootherstep + *overshoot/settle* lembut + rotasi/condong torso mengikuti arah gestur.

### 4.3 Efek Komikal 2D (*Cartoon FX Cards*) di Momen Kunci
Muncul singkat **hanya pada beat cerita utama** (tidak memenuhi layar sepanjang waktu):
- **Tetes keringat (`sweat`)**: di pelipis karakter saat momen gugup/khawatir/krisis.
- **Speed lines radial (`speedLines`)**: kilasan garis fokus putih tipis saat momen *panic/punch-in/impact* (mis. palu, peluit, atau bantingan papan `"DITUTUP"`).
- **Ikon/Stiker Emosi (`?`, `!`, `Zzz`, `spiral`, `spark`)**: melayang singkat di dekat kepala/prop saat bingung, ide muncul, atau menunggu lama.
- **Mikro-aksi & *Payoff* Props**: animasi fisik serempak (grafik turun, jam berdetak, daun/uap/asap, cahaya retakan/ukiran menyala) saat narasi mencapai klimaks.

---

## 5. Sinematografi, Hook, Ritme, Transisi & Color Script

### 5.1 Hook (0–3 Detik Pertama = In Medias Res!)
- **Frame 0 langsung berada di tengah aksi visual**, bukan layar hitam atau intro kosong!
- **Macro Punch-In (`0–1 dtk`)**: kamera langsung menyorot dekat (*macro punch-in*) ke detail material mengkilap / hero prop ikonik cerita (ukiran tahun, logo lokomotif kuningan, jam) dengan sentuhan tangan karakter, diiringi Hook Title Slam yang tidak menutupi fokus objek utama.

### 5.2 Ritme Editing, Kamera & Cut-Away Mekanisme
- **Ritme Dinamis:** Babak setup & konflik bergerak cepat & menarik (**2–3 detik per beat/perubahan ukuran shot** — padukan MCU → Wide Reveal → Low Angle Agung → OTS → Insert Prop), lalu melambat memberi ruang napas (**5–6 detik**) pada shot *payoff* penutup!
- **Kamera Kinematik:** Smootherstep glide + **Creeping Hold** (`0.15–0.25 %/f`, kamera tidak pernah membeku $>4$ frame) + **Impact Kick** 7-frame + **Roll 3°–5°** pada beat dramatis + **Foreground Framing buram** ($>2\text{ m}$ di tepi lensa).
- **Cut-Away Mekanisme ("Inside Look"):** Saat narasi menjelaskan cara kerja sesuatu (jalur menanjak, mesin uap, jadwal rute), gunakan gerakan kamera menyelam/mendekat *insert/orbit* untuk memperlihatkan cara kerja mekanisnya!

### 5.3 Transisi Elegan
- **Hard Cut** jatuh tepat di pergantian frasa/jeda kata.
- **Cross-Dissolve (`0.5–0.8 dtk`)** khusus transisi lembut antar ruang atau siang-ke-malam.
- **White Flash (`6 frame`)** untuk lompatan era waktu historis (`1930 → 1947 → Kini`).
- **Dilarang efek murahan** seperti glitch atau zoom-whip berisik.

### 5.4 Color Script (Pencahayaan sebagai Narator)
Setiap proyek wajib mendefinisikan **Color Script Table** di `story.ts` yang memetakan fase cerita → palet warna, temperatur kunci, warna bayangan (hindari abu-abu mati; gunakan *indigo/lavender/warm amber*), glow, dan atmosfer:
- *Pembuka / Harapan:* **Golden Dusk** (`#ffa550` key hangat vs `#2c1f4a` bayangan twilight).
- *Kejayaan / Kolonial / Siang:* **Warm Amber Indoor** (obor/lampu + debu berkilau) atau **Cerah Segar** (langit biru + kabut pegunungan berlapis).
- *Konflik / Krisis:* **Cool Twilight / Overcast Biru-Ungu** (bayangan dalam, sorotan cahaya sempit, desaturasi terkontrol).
- *Klimaks / Reveal:* **Kontras Tinggi + Emissive Glow** (retakan/ukiran emas menyala + *god rays* + vignette 0.22).

---

## 6. Latar 3D Toon Skala Megah, Hero Prop & Environment Hidup

- **Rasio Skala Epik:** Bangunan stasiun, gunung, jembatan, atau lokomotif dibangun besar dan menjulang dibanding tinggi karakter (`~1.5 m`) agar dunia terasa megah sekaligus lucu.
- **Hero Prop Detail:** Objek pusat cerita dirender jauh lebih kaya detail (specular kuningan/besi, ukiran timbul, roda gigi, jendela berlapis) daripada tembok latar biasa, tetap dibingkai tinta 3D tipis pada siluet objek dunia (`NOINK` hanya untuk kartu 2D karakter).
- **Dilarang Primitif Tunggal Untuk Hero Flora:**
  - Kol (`flora.ts`): guludan tanah + jantung kol berurat + 6 kelopak daun luar mekar; ditemani daun bawang, ajir bambu, dan keranjang sayur penuh isian.
  - Rumput liar hanya di tanah luar lintasan/pangkal tembok — bersih dari beton pijakan tokoh & zona subtitle.

---

## 7. Zero-Clipping Framing & Tipografi Diegetik per Era

- **Audit Frustum Nyata (`sampleCamera()`):** Semua papan teks/tahun kritis wajib berada di **82% zona aman horizontal** kamera dan terbaca utuh $\ge 2\text{ detik}$ tanpa tertutup tangan atau badge lain (`5x` dipisah ke panel sendiri!).
- **Auto-Fit `measureText` (`signage.ts` & `WorldKit.label`):** Huruf otomatis mengecil agar lebar maks $86\%$ papan.
- **Tipografi Diegetik per Era (`fonts.ts`):** `Cinzel` (Kolonial 1930-an), `Playfair Display` (Koran/Prasasti), `IBM Plex Mono` (Stensil karung), `Oswald` + stempel merah pudar (1980-an `PJKA`/`DITUTUP`), `Permanent Marker` (Mural street-art), `Plus Jakarta Sans` + strip biru-oranye (KAI 2022). Wajib di-load oleh **Font Guard `1200 ms`** *sebelum* world 3D dibangun!

---

## 8. Subtitle Akustik & Ekosistem Tools (`Whisper` + `FFmpeg` + `yt-dlp` + `HyperFrames`)

- **Penyelarasan Wajib (`tools/align_subtitles.py`):** Deteksi *speech islands* (RMS/FFmpeg jeda $\ge 160\text{ ms}$) + DP pemetaan tanda baca & bobot suku kata angka Indonesia (`1935` = 14 suku kata), atau `faster-whisper` bila tersedia.
- **Tampilan Subtitle Kontras:** 1–2 baris (atau ritme 1–3 kata dinamis jika bergaya ultra-cepat), outline hitam tebal, highlight kuning `#FBBF24`, scrim gelap bawah `rgba(10,8,20,0.82)`, transisi `2 frame`, posisi aman dari UI platform (~65–72% bawah).
- **Audio & Render Lokal:** Master audio **-14 LUFS integrated** (music `-6 dB` di bawah vokal, peak ≤ `-1 dBTP`). Render lokal di RAM 4GB wajib `--concurrency=1 --gl=angle` (atau `HyperFrames`); **dilarang render di cloud.**

---

## 9. Checklist Wajib Sebelum Commit

- [ ] `words.json` teruji bebas jeda salah (lolos `align_subtitles.py`).
- [ ] Color Script per fase cerita terdokumentasi di `story.ts`; Hook detik 0–1 memakai *macro punch-in*.
- [ ] Karakter: variable-weight ink + soft crescent shade + ekspresi snappy per beat; Z-order `FRONT_POSES` benar; no T-pose; walk cycle bipedal anti-skating.
- [ ] Efek komikal 2D (`sweat`, `speedLines`, ikon) aktif di momen emosi/hentakan kunci (bukan spam terus-terusan).
- [ ] Zero clipped text: seluruh papan nama, tahun, dan prasasti (`Station Tjikadjang`, `DIENSTREGELING 1935`, `CIKAJANG`) 100% utuh dan tidak tertutup tangan/prop.
- [ ] Hero flora komposit + hero prop detail + skala megah + font guard block sebelum world dibangun.
- [ ] `npx tsc --noEmit` = 0 error. **Jangan render di cloud.**
