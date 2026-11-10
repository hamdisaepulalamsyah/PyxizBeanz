---
name: pyxis-beanhead-style
description: Standar produksi resmi v2 kartun 3D vertikal gaya Bean-Head untuk Remotion PyxisLab (karakter bean-head full-figure, Z-order bahu-lengan belakang/depan natural, walk cycle bipedal anti-wayang, tipografi diegetik per era tanpa terpotong, environment 3D hero flora & foreground framing, serta sinkronisasi subtitle akustik & ekosistem tools Whisper/FFmpeg/yt-dlp/HyperFrames).
---

# pyxis-beanhead-style (v2.0 — PyxisLab Official Production Standard)

Standar acuan **mutlak** untuk semua video short kartun 3D vertikal 9:16 PyxisLab di Remotion.

Implementasi referensi di repo ini:

| File | Isi |
| --- | --- |
| `src/persis/toon.ts` | Sumber asli kepala Bean-Head (`Haji Zamzam`, `A. Hassan`, dst.). |
| `src/cikajang/toon.ts` | **Implementasi acuan terkini.** Bean-Head full-figure, Z-order lengan belakang/depan, walk cycle bipedal natural, lengan rubber-hose + mitten, figuran, dan hewan. |
| `src/cikajang/story.ts` | Shot list, kamera kinematik (smootherstep, creeping hold, kick, roll), framing anti-terpotong, beat sinkron narasi, grade. |
| `src/cikajang/worlds.ts` | Set 3D, hero flora komposit (kol berlapis, teh, bambu), tekstur prosedural, tipografi diegetik per era, lighting rig, film pass. |
| `src/cikajang/Cikajang.tsx` | StageManager, contact shadow, frozen sun, caption tajam anti-pudar, hook title slam, font guard aman. |
| `src/persis/worlds.ts` | `WorldKit` (ramp toon, ink, glow, dust, motes, shaft, label auto-fit, backdrop). |
| `tools/align_subtitles.py` | Penyelaras `words.json` berbasis akustik (`Whisper` / `FFmpeg silencedetect` + RMS speech-island DP + suku kata angka Indonesia). |
| `src/cikajang/fonts.ts` | `ERA_FONT` (stack font per era + fallback senada), `DIEGETIC_FONT_CSS`, `FONT_GUARD_MS = 1200`. |
| `src/cikajang/signage.ts` | Painter papan per era: `platePaint`, `carvedStonePaint`, `stencilPaint`, `inkStampPaint`, `muralLetteringPaint`, `platePlane` (emissive) + `fitFont` (auto-fit 86 %). |
| `src/cikajang/flora.ts` | Prefab hero flora ter-instance: kol komposit, daun bawang, wortel, guludan, tiang telegraf + kabel, burung, daun foreground. |

Kalau ragu, **tiru kode acuan**. Dilarang keras membuat: manekin realistis, kaki tongkat, lengan pipa bersendi patah, T-pose kaku, jalan melompat seperti wayang, bahu menonjol di depan dada, atau teks papan/tahun yang terpotong bingkai kamera.

---

## 1. Format & Arsitektur

| Item | Nilai |
| --- | --- |
| Resolusi | 1080 × 1920 (9:16), 30 fps (draft/preview `--scale=0.75`, final `--scale=1`) |
| Renderer | `@remotion/three` `<ThreeCanvas … flat dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>` |
| Karakter | Kartu Canvas2D → `THREE.CanvasTexture` di `MeshToonMaterial` (billboard yaw-only) |
| Determinisme | Semua nilai = fungsi murni dari `frame`. Tidak boleh ada `Math.random()` atau `Date`. |
| Struktur per proyek | `src/<project>/story.ts`, `toon.ts`, `worlds.ts`, `<Project>.tsx` |

Setiap shot = satu world yang dibangun saat pertama dipakai (`StageManager`). Hanya world aktif yang `visible`.

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
- Skala tokoh di world: tokoh utama **1.25** (≈ 1.58 m), dewasa **1.1–1.15**, anak **0.85**.
- **Duduk (`pose: 'sit'`):** pinggul turun ke `SEAT_Y = HIP_Y + 40`, paha memendek ke depan, betis turun, sepatu tetap menapak.

---

## 3. Kepala Bean-Head (`traceBeanHead`), Hijab & Ekspresi

- Superellipse lancip lembut di mahkota (`n = 2.3` atas, `2.9` dagu), dilukis di koordinat Persis lalu diskalakan `HEAD_SCALE`, `inkMul = 0.82 / HEAD_SCALE`.
- Tinta **plum `#241726`** untuk semua garis.
- Wajah wajib punya: bayangan sisi jauh, pipi blush hangat, hidung kait lembut, mata bulat besar ber-highlight ganda, bulu mata lentik (perempuan/hijab), alis ekspresif.
- **Hijab Rapi:** lapis belakang (*drape* 3 lipatan) sebelum wajah + pita depan `fill('evenodd')` mengikuti kontur `traceBeanHead(1.07)` + pin/bros kecil di bawah dagu. Mata turun +14 unit agar pas di jendela hijab.
- **Kehidupan Idle Wajib:** kedip tidak teratur 3–5 detik (sesekali kedip ganda), napas `0.22 Hz`, pergeseran berat badan `0.11 Hz` berporos di sol, ayunan kepala lembut, *saccade* mata tiap ~38 frame.

---

## 4. Lengan, Z-Order Bahu & Gerakan Natural (Anti-Tempel Depan & Anti-Wayang)

Ini adalah aturan krusial agar karakter terlihat hidup dan anatomis kartun rapi, bukan wayang kertas yang lengan & bahunya menempel canggung di depan dada:

### 4.1 Z-Order Lapisan Lengan (Wajib `front` vs `back`)

Setiap `ArmPose` wajib diklasifikasikan apakah berada di **belakang** torso (`front: false`) atau **menyilang di depan** dada/perut/meja (`front: true`):

- **Lengan Belakang (`front: false` — dilukis SEBELUM `drawBody()` dan `drawHead()`):**
  - Meliputi: `side`, `hip`, `pocket`, `point`, `pointHigh`, `pointSide`, `spread`, `trace`, `traceLow`, `palm`, `wave`, `reachUp`, `hammer`, `suitcase`, `lampLow`, `carryShoulder`.
  - Karena dilukis di belakang torso & hijab, pangkal bahu (`shoulder`) terpotong/tersembunyi rapi oleh garis outline jaket/baju/hijab! Lengan muncul mulus dari sisi luar bahu, **tidak pernah menonjol seperti kapsul yang ditempel di depan dada.**
- **Lengan Depan (`front: true` — dilukis SETELAH torso):**
  - Hanya untuk pose yang memang melintasi bagian depan tubuh/benda: `strap`, `write`, `pressPage`, `chalk`, `holdBoard`, `hug`, `basketLap`, `ticket`, `newspaper`, `whistle`.
  - Pangkal bahu untuk pose `front: true` dibuat menyatu dengan bahu torso (`splitQuad` di titik keluar torso atau *socket shading* tanpa bulatan cap garis plum tebal menabrak kerah/lapel!).

### 4.2 Larangan T-Pose & Sudut Alami

- **DILARANG T-POSE:** Pose `spread`, `palm`, maupun `pointSide` tidak boleh merentangkan kedua tangan lurus horizontal sejajar bahu (`sy ± 20`). Siku harus turun santai oleh gravitasi (`y ≈ sy + 75..120`, bentangan horizontal sedang), dengan lengkungan siku alami mengarah ke bawah/luar.
- **Asimetri Gestur:** Hindari dua tangan membentuk pose cerminan simetris kaku saat berdiri berbicara (padukan mis. kanan `palm` + kiri `strap` atau `side` yang sedikit bergeser dengan napas).
- **Transisi Easing Organik:** Blend antar `ArmPose` wajib memakai kurva `smootherstep` / `easeInOut` dengan sedikit *overshoot/settle* lembut (bukan interpolasi linear robotik), disertai sedikit condong/rotasi torso (`tilt` & `shiftX`) mengikuti arah tangan yang sedang beraksi.

### 4.3 Walk Cycle Bipedal Nyata (Anti-Lompat Seperti Wayang)

Dilarang keras menggerakkan kaki hanya naik-turun di tempat (`Math.abs(sin)` vertikal tanpa ayunan langkah!). Saat `walkPhase !== null`:

1. **Ayunan Kaki Elips (Stride X + Lift Y):**
   - Kaki penumpu (*stance foot*) tetap menapak datar di `SOLE = 975` (`lift = 0`) dan mengayun ke belakang secara simetris agar tidak terasa meluncur (*skating*).
   - Kaki yang melangkah (*swing foot*) menekuk di lutut (`knee` terangkat dan maju) dengan jejak melengkung halus ke depan (`strideX = Math.sin(phase) * strideAmp * walkDir`, `liftY = Math.max(0, Math.cos(phase)) * 20`), lalu menapak lembut (`footTilt` mengikuti fase tumit–ujung kaki).
2. **Body Bob Halus (3–4 px, Terendah Saat Kontak):**
   - Bukan lompatan `-10 px`! Gunakan osilasi ganda lembut `-Math.cos(phase * 2) * 3.5` (3–4 px), di mana titik **terendah** terjadi saat kedua kaki menapak (posisi kontak), sesuai prinsip animasi *cartoon-3d-short*.
3. **Condong & Counter-Swing Tangan:**
   - Torso condong ringan `3°–5°` searah `walkDir`.
   - Tangan yang sedang dalam pose `side` ikut mengayun berlawanan fase dengan kaki (`±28 px` horisontal), membuat jalan terasa bertenaga dan natural.

---

## 5. Sinematografi Vertikal, Framing & Zero-Clipping Text

Lebar horizontal terlihat di kedalaman $d$ adalah $W_{\text{vis}} = 2 \cdot d \cdot \tan(\text{fov}/2) \cdot 0.5625$.

- **Kontrak Zero-Clipping (Wajib Audit Matematis):**
  - **TIDAK ADA TEKS TERPOTONG** di tepi frame (terutama angka tahun `1930`, `1935`, `1947`, `1982`, `2022`, nama stasiun, atau prasasti). Seluruh lebar papan teks harus masuk di dalam **$82\%$ zona aman horizontal** frame kamera aktif.
  - **Auto-Fit Font (`measureText`):** `WorldKit.label` maupun custom `canvas` papan wajib mengukur `ctx.measureText(line).width` dan mengecilkan ukuran font otomatis bila lebar teks melebihi `86%` lebar papan — teks tidak boleh keluar dari border papan!
  - **Anti-Overlap Prop & Teks:** Lencana tambahan (seperti badge `5x`) atau tangan tokoh yang menunjuk tidak boleh menutupi huruf di papan latar. Pisahkan panel atau geser posisi papan & karakter agar keduanya terbaca penuh 100%.
  - **Keterbacaan Papan di Bayangan:** Papan teks/prasasti kritis gunakan pencahayaan merata atau sedikit emissive/high-ambient agar tidak berubah jadi biru-kelabu kusam saat matahari menyamping.
  - **Area Aman Bawah:** Jaga area bawah pijakan tokoh utama dan zona subtitle (`y < 380 px` layar) bersih dari rumput liar raksasa yang mencuat menembus lantai beton.

---

## 6. Environment 3D Hidup, Detail Hero Flora & Foreground Framing

Bangunan dan alam tidak boleh terasa seperti kubus/bola poligon kosong:

1. **Dilarang Primitif Tunggal Untuk Objek Fokus:**
   - **Tanaman Kol / Kubis (`ladang`):** Wajib model komposit — guludan tanah gembur bergelombang + jantung kol hijau-pucat berurat + 4–5 daun luar hijau tua yang terbuka mekar bertingkat (bukan 1 bola `Icosahedron`!).
   - **Flora Lain:** Rumpun bambu beruas + rumpun daun; pohon/semak teh berlayer; keranjang panen terisi sayur/buah yang jelas bentuknya (wortel jingga, tomat merah, kol berlapis).
   - **Rumput Liar Realistis:** Tumbuhkan rumpun rumput di tanah luar rel dan di *retakan tepi/pangkal dinding*, jangan menembus bidang beton solid tempat tokoh berdiri.
2. **Foreground Framing (`~1/3` jumlah shot):**
   - Tambahkan elemen bingkai depan berjarak $> 2\text{ m}$ dari kamera (dedaunan tepi, pilar besi peron di pinggir frame, bingkai jendela, kabut lembut) untuk efek paralaks sinematik tanpa pernah menghalangi wajah tokoh atau papan teks.
3. **Material Prosedural (`paint.js` standard) & Aset Hidup:**
   - Gunakan `planksPaint`, `rottenPlanksPaint`, `beamPaint`, `stonePaint`, `cementPaint`, `speckle`.
   - Elemen dinamis kecil di setiap shot: uap kopi, debu berkilau dalam `kit.shaft`, burung/kupu-kupu, jam dinding berdetik, dedaunan jatuh, kereta bergerak jauh, lentera berayun.

---

## 7. Tipografi Diegetik Sesuai Zaman & Bahan

**Dilarang menyamaratakan semua tulisan di dinding/papan/koran dengan font standar biasa!**

| Era / Konteks | Gaya Tipografi & Bahan | Contoh di Scene |
| --- | --- | --- |
| **1930-an Kolonial (`Staatsspoorwegen`)** | Condensed Classic Serif / Art Deco (`Cinzel`, `Playfair Display`, fallback `Georgia serif`) huruf kapital renggang (`letterSpacing`), paku keling kuningan, bingkai enamel dobel atau pahatan batu ber-bevel. | `TJIKADJANG`, `DIENSTREGELING 1935`, `STAATSSPOORWEGEN` |
| **Prasasti / Batu Pahat** | Serif klasik berukir dengan *inner recess shadow* gelap & *lower rim highlight* terang + bercak lumut tipis di tepi batu. | `1930 – 1982`, `Station Tjikadjang` |
| **Koran Tahun 1930 (`DE KOERIER`)** | Header Blackletter/Condensed Editorial (`Playfair Display Black`), garis pemisah kolom tipis, kolom berita rapi di atas kertas menguning. | `DE KOERIER · 31 JULI 1930` |
| **Peti Kayu / Logistik (`BERAS`)** | Gaya stempel *Stencil* terputus (`Courier New` tebal / `IBM Plex Mono`) tinta arang agak pudar mengikuti serat kayu/karung goni. | `BERAS` |
| **1980-an Orde Baru (`PJKA`, `DITUTUP`)** | Sans industrial tegas & monospace administratif (`Oswald`, `IBM Plex Mono`, fallback condensed sans), plus tekstur stempel/cat merah tegas untuk `DITUTUP`. | `PJKA`, `DITUTUP`, grafik kantor |
| **Mural Jalanan Kini** | Tipografi street-art mural ekspresif (`Permanent Marker`, gaya kuas tebal miring, outline gelap tebal + *drop shadow* warna cerah + efek cat menetes). | Mural `CIKAJANG` di dinding |
| **Era KAI Modern (2022+)** | Geometric transit sans bersih (`Plus Jakarta Sans` / `Montserrat`), papan putih berlis biru-oranye ikonik KAI + ikon garis rute presisi. | `GARUT +717 M`, `PETA RUTE` |

Semua pemuatan Google Fonts di luar `Plus Jakarta Sans` tetap wajib melalui **Font Guard `1200 ms`** agar render lokal never hang jika offline.

---

## 8. Kamera Kinematik, Pencahayaan & Film Pass

- **Kamera (`motion.js` + `motion-design`):**
  - Spline `CatmullRom` centripetal + **smootherstep** per segmen (`0` kecepatan & akselerasi di ujung).
  - **Creeping Hold:** kamera tidak pernah membeku $>4$ frame; saat glide melambat ($<4\text{ mm/f}$), kamera terus push-in `0.15–0.25 %/f` (maks `12 %`).
  - **Impact Kick:** getaran 7-frame *flip-shake* saat hentakan cerita; **Camera Roll 3°–5°** pada beat emosional; **White Flash 6 frame** (`cut: 'flash'`) pada lompatan era.
- **Pencahayaan & Shader:**
  - Ramp toon tiga pita `[64, 150, 255]`, Key hangat + Fill twilight dingin + **Camera-relative frozen sun** (dibekukan per shot terhadap target rata-rata kamera agar bayangan tajam tidak berkedip).
  - Kontrak **NOINK**: `mesh.userData.noInk = true` pada semua kartu karakter/hewan + **Contact Shadow Blob** wajib di `y = floorY + 0.015`.
  - Film Pass: DoF (`aperture` & rack `focus`), split-tone, sepia arsip, **vignette lembut 0.22**, grain `source-atop`.

---

## 9. Sinkronisasi Subtitle Akustik & Ekosistem Tools (Whisper + FFmpeg + yt-dlp + HyperFrames)

### 9.1 Sinkronisasi Audio–Subtitle Anti-Balap
- **Akar masalah yang dilarang terulang:** Membagi kata secara linear rata per kalimat panjang padahal ada jeda koma/napas di tengah kalimat membuat kata setelah jeda tertinggal atau membalap suara narator!
- **Standar Wajib (`tools/align_subtitles.py`):**
  1. Jika `faster-whisper` / `openai-whisper` tersedia, ambil timestamp kata akustik secara langsung.
  2. Jika memakai alignment naskah (`sentences.json` + `voice.wav`), **deteksi semua pulau suara (*speech islands*) lewat RMS energi / `FFmpeg silencedetect` (ambang jeda ≥ 150 ms)** di dalam tiap kalimat, lalu pasangkan frasa ke pulau suara memakai Dynamic Programming (prioritas pemecahan di tanda baca `, : ; …` + bobot suku kata fonetik angka Indonesia seperti `1935` = 14 suku kata).
- **Render Subtitle Tajam:** Gunakan `enter` & `exit` cepat (`2–3 frame`, hindari transisi fade panjang yang tampak transparan pudar di tengah adegan) dan *bottom scrim* gelap bersih (`rgba(10,8,20,0.8)`) agar teks tetap kontras terbaca.

### 9.2 Pipeline Terintegrasi PyxisLab
1. **`yt-dlp`**: Pengumpulan referensi visual & audio Foley sumber terbuka secara cepat.
2. **`Whisper` / `tools/align_subtitles.py`**: Penyelarasan presisi `words.json` & `sentences.json` sebelum animasi dimulai; seluruh aksi visual (*key beats*) mendarat **0–3 frame sebelum** kata terkait terucap.
3. **Audio Mastering (`sfx/` + `FFmpeg`)**: Vokal sebagai acuan (0 dB), music bed di **−6 dB gated RMS (50 % vokal)**, SFX melewati peak limiter (−1 dBTP), output master dinormalisasi ke **−14 LUFS integrated (EBU R128)** sebelum muxing akhir.
4. **Render Hemat RAM & `HyperFrames`**: Pada mesin RAM 4GB (Dual-Core), render lokal Remotion WAJIB memakai `--concurrency=1 --gl=angle`, atau integrasi frame-capture deterministik (`HyperFrames`) untuk proyek ber-VRAM ketat; **dilarang render visual di cloud.**

---

## 9.3 Konvensi Implementasi v2.1 (hasil revisi 7 poin Cikajang)

- **Subtitle:** jalankan `python3 tools/align_subtitles.py public/<p>/voice.wav public/<p>/sentences.json --out public/<p>/words.json` setiap kali voice/naskah berubah. Tanpa Whisper, backend RMS stdlib (ambang adaptif, jeda ≥ 160 ms) dipakai; cek print per-frasa (`Tahun 1935,` 56.01–57.89 → `ada` 58.14). Token kata = `text.split()` sehingga harus identik dengan kata di kalimat. Jam `06.04` dibobot sebagai "enam lewat empat". Caption: `enter`/`exit` 2 frame, scrim `rgba(10,8,20,0.82)`.
- **Font guard memblokir panggung:** tekstur papan dilukis saat world dibangun, jadi `<ThreeCanvas>` baru di-mount setelah `useFontGuard()` siap (font termuat atau 1200 ms), dan `continueRender` dipanggil setelah mount. Jangan melukis canvas teks sebelum font siap — font fallback akan "terbakar" ke tekstur.
- **Z-order lengan:** klasifikasi `front` disimpan di set `FRONT_POSES` di `toon.ts` (pose = string di `story.ts`). Urutan lukis: lengan belakang → torso → kepala → body prop → lengan depan → semua mitten → hand prop. Mitten selalu di atas badan (tangan di saku/pinggang tetap terlihat). Lengan belakang berpangkal 30 px ke dalam bahu; lengan depan tanpa outline 46 px dari soket + socket shade lembut. Saat blend, layer berganti di `mix = 0.5`.
- **Walk tanpa skating:** fase jalan dihitung dari jarak tempuh: `walkPhase = travelled / scale * WALK_PHASE_PER_METRE` (`= PX / (2·STRIDE_AMP/π)`, ±21.5 rad/m). Jangan pakai faktor tebakan — kaki penumpu akan meluncur. Bob di canvas memakai `+cos(2φ)·3.5` (sumbu y canvas ke bawah → titik terendah saat double-support).
- **Teks vs kamera bergerak:** audit frustum harus memakai `sampleCamera()` nyata (creep, kick, roll), bukan hanya keyframe. Papan yang keluar frame karena dolly/pan harus: (1) terbaca utuh ≥ 2 detik dulu (tahan kamera dengan keyframe hold), (2) keluar **sekali** di bagian cepat smootherstep, (3) tidak pernah "mengintip" terpotong lagi di gerakan berikutnya. Contoh: papan PJKA shot 8 (`i93 c29 o178`).
- **Panel tambahan** (badge `5x`, tanggal) digantung sebagai panel terpisah di bawah/atas papan utama, tidak pernah ditempel di atas huruf atau di jalur tangan tokoh.

---

## 10. Isolasi Aset & Checklist Wajib Sebelum Commit

```
public/<project>/voice.wav       narasi
public/<project>/sfx.wav         efek suara (opsional)
public/<project>/words.json      timing per kata (WAJIB lolos cek speech-island akustik!)
public/<project>/sentences.json  timing per kalimat
```

- [ ] `words.json` diselaraskan ke pulau suara aktual `voice.wav` (tidak ada angka/kata pasca-koma yang meleset $>0.2\text{ s}$).
- [ ] Semua `ArmPose` punya `front: boolean`; lengan belakang digambar sebelum torso & hijab (bahu tidak menonjol di depan dada). Tidak ada T-pose.
- [ ] Karakter berdiri bersepatu di `SOLE = 975` + contact shadow blob; walk cycle memiliki ayunan kaki elips, tekuk lutut, bob 3–4 px di titik kontak, dan ayunan tangan berlawanan.
- [ ] Zero clipped text: seluruh papan nama, prasasti, dan tahun masuk 82 % zona aman kamera + auto-fit `measureText` + tidak tertutup tangan/lencana lain.
- [ ] Hero environment komposit (kol/sayuran berlapis daun, bambu rimbun, rumput tidak menembus beton peron utama, foreground framing tersedia).
- [ ] Tipografi diegetik berbeda per era/bahan (kolonial serif/stencil/koran/PJKA/mural/modern) dengan font guard ≤ 1.2 detik.
- [ ] `npx tsc --noEmit` = 0 error. **Jangan render di cloud.**
