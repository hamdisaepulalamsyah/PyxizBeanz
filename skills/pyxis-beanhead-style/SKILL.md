---
name: pyxis-beanhead-style
description: Standar produksi resmi kartun 3D vertikal gaya Bean-Head untuk Remotion (karakter bean-head bust waist-up, tangan mitten kartun rapi, pencahayaan dual-tone, sinematografi vertikal, dan pemisahan aset per-konten).
---

# pyxis-beanhead-style

Standar acuan **mutlak** untuk semua video short kartun 3D vertikal 9:16 PyxisLab di Remotion.

Implementasi referensi di repo ini:

| File | Isi |
| --- | --- |
| `src/persis/toon.ts` | Sumber asli kepala Bean-Head (Haji Zamzam, A. Hassan, dst.). Format bust waist-up. |
| `src/cikajang/toon.ts` | **Implementasi acuan terkini.** Bean-Head full-figure berkaki dan bersepatu, lengan rubber-hose, mitten, figuran, dan hewan. |
| `src/cikajang/story.ts` | Shot list, kamera kinematik (smootherstep, creeping hold, kick, roll), flash era, grade. |
| `src/cikajang/worlds.ts` | Set, tekstur prosedural, lighting rig, film pass (DoF, split-tone, sepia, vignette, flash). |
| `src/cikajang/Cikajang.tsx` | StageManager, contact shadow, frozen sun, caption, hook, font guard. |
| `src/persis/worlds.ts` | `WorldKit` (ramp toon, ink, glow, dust, motes, shaft, label, backdrop). |

Kalau ragu, **tiru kode acuan**. Dilarang membuat manekin realistis, kaki tongkat, atau lengan pipa bersendi patah.

> Catatan sumber: standar §5–§11 merangkum konvensi `cartoon-short-kit` (`engine/roman.js`, `motion.js`, `paint.js`) sesuai brief sutradara. Angka-angka di dokumen ini adalah nilai yang benar-benar dipakai di `src/cikajang/*`.

---

## 1. Format & arsitektur

| Item | Nilai |
| --- | --- |
| Resolusi | 1080 × 1920 (9:16), 30 fps |
| Renderer | `@remotion/three` `<ThreeCanvas … flat dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>` |
| Karakter | Kartu Canvas2D → `THREE.CanvasTexture` di `MeshToonMaterial` (billboard yaw-only) |
| Determinisme | Semua nilai = fungsi murni dari `frame`. Frame acak atau out-of-order harus identik. |
| Struktur per proyek | `src/<project>/story.ts`, `toon.ts`, `worlds.ts`, `<Project>.tsx` |

Setiap shot = satu world yang dibangun saat pertama dipakai (`StageManager`). Hanya world aktif yang `visible`. Nama anchor di `story.ts` **harus** ada di `anchors` world (cek sebelum commit, karena salah ketik baru ketahuan saat render).

## 2. Kartu karakter full-figure (berdiri: kaki & sepatu wajib terlihat)

```ts
const LW = 768, LH = 1024;            // kanvas logis (backing 0.75× → 576 × 768)
const SOLE = 975;                     // garis sol sepatu = origin billboard = lantai (y = 0)
export const ACTOR_PLANE_HEIGHT = 1.7;
export const ACTOR_PLANE_WIDTH = (1.7 * LW) / LH;   // 1.275 m
const PX = LH / 1.7;                  // ≈ 602 px per meter (skala 1)
const HEAD_HALF_W = 240;              // kepala dirancang di ukuran Persis…
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2;   // rasio tinggi/lebar 0.94
const HEAD_SCALE = 118 / HEAD_HALF_W; // …lalu diskalakan: setengah lebar 118 px → lebar kepala ≈ 236 px
const HEAD_H_PX = HEAD_HALF_H * 2 * HEAD_SCALE;     // ≈ 222 px (HH)
const HIP_Y = SOLE - HEAD_H_PX * 1.35;              // kaki ≈ 1.35 × HH
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;          // torso ≈ 1.1 × HH
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;
```

- Geometri plane di-`translate(0, 0.85 - (LH - SOLE)/PX, 0)`, sehingga **sol sepatu tepat di y = 0**. Anchor world = titik lantai di bawah kaki.
- Kepala tetap besar dan manis (≈ 3.4 kepala tinggi total). Skala di world: tokoh utama **1.25** (≈ 1.58 m), dewasa **1.1–1.15**, anak **0.85**.
- Ketinggian berguna (× skala, di atas lantai): pusat kepala **1.08 m**, bahu **0.86 m**, pinggul **0.50 m**. Tangan: menelusuri (`trace`) **0.83 m** dengan jangkauan horizontal 0.47 m dari pusat badan; `traceLow` **0.69 m**; menunjuk (`point`) **0.90 m**; menunjuk tinggi **1.12 m**; meraih ke atas **1.24 m**.
- **Duduk** (`pose: 'sit'`): pinggul turun ke `SEAT_Y = HIP_Y + 40`, paha memendek ke arah kamera, betis turun, sepatu tetap menapak lantai. Tinggi dudukan = `SEAT_HEIGHT × skala` (≈ 0.43 m × s). Garis meja untuk menulis = `DESK_HEIGHT × skala` (≈ 0.62 m × s). Meja boleh menutupi kaki.

### Celana, kain, sepatu

- `pants`: dua kaki tebal 50 px (garis plum 6 px di tiap sisi), shading sisi jauh, blok pinggul, jahitan samping putus-putus. Warna senada busana (Dinda `#2e3346`).
- `skirt` (kain batik A-line) / `sarung` (kotak-kotak): tabung dari pinggul ke betis, kaki kulit di bawahnya.
- Sepatu dilukis di atas kedua kaki, dan selalu tepat di `SOLE` (kecuali sedang melangkah):
  - `sneakers`: upper bulat 92 × 52, **sol putih tebal 18 px bergaris plum** + garis tengah, tali putih, aksen swoosh.
  - `shoes`: kulit mengkilap + sol tipis gelap. `boots`: bot karet tinggi (petani, pekerja). `sandals`: kaki kulit + tali.
- Berjalan: kaki bergantian terangkat ≤ 22 px dengan fase dari jarak tempuh (kaki tidak "meluncur"), badan bob 8 px.

## 3. Kepala Bean Head (`traceBeanHead`)

```ts
function traceBeanHead(ctx: CanvasRenderingContext2D, scale = 1): void {
  const segments = 120;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const top = s < 0;
    const n = top ? 2.3 : 2.9;
    const x = HEAD_HALF_W * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let y = HEAD_HALF_H * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (top) { const k = 1 - Math.abs(x) / HEAD_HALF_W; y *= (1 + 0.22 * k * k * k) / 1.22; }
    if (i === 0) ctx.moveTo(x * scale, y * scale); else ctx.lineTo(x * scale, y * scale);
  }
  ctx.closePath();
}
```

- Kepala dilukis di koordinat Persis: `translate(headX, headY) → scale(HEAD_SCALE) → rotate(tilt)`. Selama melukis kepala, `inkMul = 0.82 / HEAD_SCALE`, supaya garis tinta kepala sama tebal dengan badan setelah diskalakan.
- Tinta: **plum `#241726`** untuk semua garis (outline kepala 11 unit Persis ≈ 9 px di kartu).
- Wajah (di dalam clip kepala): bayangan sisi jauh, **pipi blush hangat** (`rgba(214,100,100,0.28)`, perempuan/hijab `rgba(232,108,110,0.36)`), hidung kait, **mata bulat besar** (sklera `#fbf5ea`, pupil coklat + inti gelap, dua highlight putih), kelopak untuk kedip, **bulu mata lentik** untuk perempuan. Lalu mulut senyum (atau "o" untuk `wonder`), kumis/janggut, outline, kacamata, alis, headwear.
- Kehidupan idle wajib: kedip tidak teratur ±3–5 detik (sesekali kedip ganda), napas 0.22 Hz, pergeseran berat 0.11 Hz (berporos di sol, kaki tetap menapak), sway kepala, saccade mata tiap ~38 frame.
- Ekspresi: `neutral`, `warm`, `serious`, `thinking`, `sad`, `wonder`. Crossfade ±0.04 progress, dan selaraskan dengan kalimat narasi.

## 4. Headwear & hijab

Peci beludru `#18131c`, sorban, caping (kerucut ±320 unit + anyaman), kepi / topi stasiun (band + visor + emblem), topi bisbol, rambut (`short`, `kid`, `bun`). Semua bergeser `turn*22` dan diberi outline plum.

**Hijab** (mengikuti kontur bean, rapi):

1. Lapisan belakang (sebelum wajah): tudung + juntaian lonceng ke dada (`drapeY = (torsoTop + 100 − headY) / HEAD_SCALE`), gradasi terang ke gelap, 3 lipatan lembut.
2. Lapisan depan (setelah fitur wajah): pita antara `traceBeanHead(ctx, 1.07)` dan jendela wajah oval `ellipse(fx*0.45, 34, W*0.8, H*0.98)`, diisi `fill('evenodd')` dengan gradasi radial. Kedua kontur di-ink.
3. Lipatan highlight di mahkota kiri dan lipatan gelap di pelipis kanan.
4. **Pin/bros kecil** di bawah dagu. Mata turun 14 unit supaya wajah pas di jendela hijab.

## 5. Busana & lengan mitten

- Torso: `traceTorso` (bahu ±90 px, keliman ±100 px di `HIP_Y + 22`), shading sisi jauh ala Persis + kilap hangat kiri atas.
  - Varian: `jacket` (denim washed `#5b7fb5`: twill, area pudar, kaos putih, lapel, saku + paku keling, jahitan emas), `uniform` (kancing emas, saku, sabuk), `kebaya` (kerah renda, bros), `koko`, `lurik`, `kemeja`, `polo`, `kaos`.
  - Ransel: badan mengintip di belakang bahu + tali bergesper di depan.
- **Lengan = satu kurva bezier kuadratik mulus** dari bahu (`cx ± 86, top + 30`) ke pergelangan. Lebar lengan baju 36 px + garis plum, manset sebelum pergelangan. Makin dekat pergelangan ke bahu, makin besar lengkungan siku ke luar.
- **Kedua lengan selalu dilukis.** Gestur hanya menggeser *target pergelangan* (crossfade), sehingga tangan tidak pernah tiba-tiba hilang atau muncul. Target dijepit ≥ 44 px dari tepi kartu.
- Mitten dirancang di ukuran Persis dan dilukis dengan `HAND_SCALE = 0.55` di sekitar pergelangan: `fist` (genggam/pegang prop), `point` (telunjuk), `palm` (telapak terbuka: menjelaskan, menelusuri).
- Pose: `side`, `hip`, `strap`, `pocket`, `point`, `pointHigh`, `pointSide`, `spread`, `palm`, `trace`, `traceLow`, `write`, `pressPage`, `chalk`, `holdBoard`, `whistle`, `lampLow`, `hammer`, `carryShoulder`, `hug`, `basketLap`, `suitcase`, `ticket`, `newspaper`, `reachUp`, `wave`, `lap`/`knee` (duduk).
- Prop kontekstual: pena di tangan penulis, peluit + lentera sinyal, palu, keranjang di pundak, karung/bakul di pangkuan, koran di depan dada, papan kapur di pangkuan.

## 6. Kartu ber-cahaya, NOINK & contact shadow

```ts
const material = new THREE.MeshToonMaterial({
  map: texture, normalMap: normalMap(), normalScale: new THREE.Vector2(0.8, 0.8),
  gradientMap: kit.gradient, alphaTest: 0.5, alphaToCoverage: true,
});
mesh.castShadow = true;
mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });
mesh.userData.noInk = true;   // kontrak NOINK
mesh.rotation.y = Math.atan2(cam.x - world.x, cam.z - world.z) - parentYaw;
```

- **NOINK:** kartu karakter membawa tinta plum 2D sendiri. **Jangan pernah** memanggil `kit.ink()` atau menambahkan `EdgesGeometry`/`LineSegments2` pada kartu, supaya tinta 3D dunia tidak menimpa garis tinta karakter.
- Normal map: ellipsoid kepala + silinder torso/kaki, sehingga cahaya 3D jatuh di karakter.
- Grain kertas: `globalCompositeOperation = 'source-atop'` setelah melukis.
- **Contact shadow blob** (wajib untuk setiap figur, termasuk hewan): `CircleGeometry(0.5)` rebah di lantai pada `y = floorY + 0.015`, skala `[0.9·s, 0.55·s, 1]`, tekstur radial `rgba(20, 10, 25, 0.45)` → 0, `depthWrite: false`, `polygonOffset`. Blob mengikuti posisi karakter yang berjalan, jadi karakter tidak pernah tampak mengambang.
- Figuran dan hewan **wajib** memakai sistem kartu yang sama.

## 7. Kamera kinematik (`motion.js` standard)

- **Smootherstep glide** per segmen spline (Catmull-Rom centripetal): `t*t*t*(t*(t*6 - 15) + 10)`, dengan kecepatan dan akselerasi nol di ujung.
- **Creeping hold:** kamera tidak pernah membeku lebih dari 4 frame. Saat glide bergerak < ~4 mm/frame, kamera terus push-in **0.2 %** jarak ke target per frame (rentang 0.15–0.25 %, dibatasi total 12 %). Nilainya diintegrasikan sekali per shot lalu di-cache, jadi tetap murni fungsi frame.
- **Impact kick:** `kicks: [progress]` → flip-shake 7 frame (tanda berganti, meluruh linear) pada posisi dan roll. Contoh: tiupan peluit, papan "DITUTUP", munculnya "?".
- **Roll dramatis 3°–5°:** `roll: [[t, deg], …]` pada beat emosional (penutupan jalur, pertanyaan penutup).
- Handheld drift deterministik sangat kecil (≤ 8 mm). Hook 0–3 detik: badge, title slam (squash-bounce), aura emas, shake.

## 8. Pencahayaan & shader

- **Ramp toon tiga pita** `[64, 150, 255]` (`DataTexture`, `RedFormat`, `NearestFilter`) via `WorldKit.toon()`.
- **Key hangat** (DirectionalLight, bayangan tajam: `mapSize 2048`, `bias −0.0004`, `normalBias 0.03`). Golden dusk: `#ffa550`/`#ffb064`, intensitas 2.6–3.6, posisi rendah.
- **Fill twilight dingin**: HemisphereLight langit `#2c1f4a`/`#4c56a8`, tanah `#1b1840`/`#120c22`.
- **Camera-relative frozen sun:** sekali per shot, setiap DirectionalLight pembuat bayangan diarahkan ulang ke rata-rata target kamera shot (arah cahaya dipertahankan), dengan frustum bayangan ketat (4 + 0.6·sebaran target, maks 14 m). Bayangan tajam dan tidak berkedip saat kamera bergerak.
- Aksen: lentera berayun dengan PointLight `#ffae52` + glow, sorot matahari palsu (`kit.shaft`) + **dust motes** yang hanya berkilau di dalam sorot, debu melayang.
- Atmosfer: Fog sewarna langit, backdrop langit di-blur, gunung berlapis (siluet transparan + kabut di kaki).
- **Film pass:** DoF depth-based (key `focus` untuk rack focus), split-tone indigo/amber (kekuatan per shot `tone`), sepia/abu-abu untuk arsip, **vignette lembut 0.22**, grain, dip gelap di cut, dan **white flash 6 frame** pada lompatan era (`cut: 'flash'` atau `flashes: [progress]` di dalam shot).

## 9. Material & tekstur prosedural (`paint.js` standard)

Semua tekstur dilukis di Canvas2D dengan PRNG ber-seed (`mulberry32`), sehingga deterministik:

| Painter | Pakai untuk |
| --- | --- |
| `planksPaint` | lantai kayu, papan baru |
| `rottenPlanksPaint` (`rotten`) | papan tua berlumut: retak serat, noda lapuk, lumut hijau di sambungan. Untuk bangku peron, bangku gerbong. |
| `beamPaint` (`beam`) | balok/bantalan rel: serat ujung, retak, lubang baut. Untuk bantalan rel dan kaki bangku. |
| `stonePaint` | batu andesit + nat + lumut kerak: plinth stasiun, batu ukiran |
| `cementPaint`, `speckle` | peron semen retak, tanah, rumput |

## 10. Sinematografi vertikal

Lebar horizontal terlihat ≈ `2 · d · tan(fov/2) · 0.5625`.

- Gunakan **Medium / Cowboy / OTS / 3/4 / Wide**. Satu figur skala 1.25 dengan lengan terentang (≈ 1.2 m) pada fov 38° butuh jarak ≥ 3 m.
- **Larangan:** torso/bahu terpotong di tepi sementara lengan menjulur masuk ("tangan melayang"). Lengan hanya terentang ketika bahunya di frame. Saat dolly-in ke prop, turunkan gestur ke `side`/`strap`.
- Saat karakter berdiri, bingkai sampai sepatu, atau minimal cowboy shot yang jelas memperlihatkan figur menapak.
- Periksa framing secara matematis sebelum commit: proyeksikan kepala/bahu/tangan dari `poseLayout(pose, drive)` ke kamera tiap frame. Render visual dilakukan sutradara secara lokal; **jangan render di cloud.**
- Caption karaoke 1–2 baris (Plus Jakarta Sans 800, highlight `#FBBF24`). **Font guard wajib:** `delayRender` + `setTimeout(done, 1200)` dengan fallback ke font sistem.

## 11. Audio mastering standard

- **Vokal** adalah referensi.
- **Music bed** dikunci di **50 % (−6 dB gated RMS) dari vokal**, dan di-duck mengikuti vokal.
- **SFX** melewati **peak limiter** (ceiling sekitar −1 dBTP) sehingga tidak pernah menutup vokal.
- **Master** final dinormalisasi ke **−14 LUFS integrated (EBU R128 / ITU-R BS.1770)**, true peak ≤ −1 dBTP.
- Pipeline SFX Python ada di `sfx/` (`loudness.py`, `mix.py`). Render audio terpisah per proyek ke `public/<project>/`.

## 12. Isolasi aset per konten

```
public/<project>/voice.wav       narasi
public/<project>/sfx.wav         efek suara (opsional)
public/<project>/words.json      timing per kata
public/<project>/sentences.json  timing per kalimat
```

Selalu panggil `staticFile('<project>/…')`. `calculateMetadata` memuat timing dari folder proyek sebelum render.

## 13. Checklist sebelum commit

- [ ] Figur bean-head full-figure: kepala ≈ 236 px, torso 1.1×HH, kaki 1.35×HH, sepatu di `SOLE = 975`, tinta plum.
- [ ] Contact shadow blob di bawah setiap figur. Kartu NOINK.
- [ ] Kedua lengan selalu dilukis (kurva mulus + mitten). Tidak ada tangan melayang.
- [ ] Kamera: smootherstep, creeping hold, kick dan roll hanya pada beat cerita.
- [ ] Ramp `[64, 150, 255]`, key hangat + fill twilight, frozen sun, motes, film pass (vignette 0.22, flash 6 frame di lompatan era).
- [ ] Tekstur prosedural untuk kayu/rel/batu. Lantai luas, ruangan tertutup.
- [ ] Audio: bed −6 dB di bawah vokal, SFX dilimit, master −14 LUFS.
- [ ] Semua anchor di story ada di world. Aset di `public/<project>/`. Font guard 1.2 detik.
- [ ] `npx tsc --noEmit` = 0 error. **Jangan render di cloud.**
