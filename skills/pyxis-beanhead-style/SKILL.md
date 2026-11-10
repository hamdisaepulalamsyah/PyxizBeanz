---
name: pyxis-beanhead-style
description: Standar produksi resmi kartun 3D vertikal gaya Bean-Head untuk Remotion (karakter bean-head bust waist-up, tangan mitten kartun rapi, pencahayaan dual-tone, sinematografi vertikal, dan pemisahan aset per-konten).
---

# pyxis-beanhead-style

Standar acuan **mutlak** untuk semua video short kartun 3D vertikal 9:16 PyxisLab di Remotion.
Implementasi referensi:

- `src/persis/toon.ts` — sumber asli gaya Bean-Head (Haji Zamzam, H. M. Yunus, A. Hassan, Soekarno, Natsir).
- `src/cikajang/toon.ts` — penerapan skill ini dengan lengan/gestur yang diperluas (Dinda + figuran).
- `src/persis/worlds.ts` → `WorldKit`, `FilmPipeline` — toolkit dunia, ramp toon, dan film pass.

Kalau ada keraguan, **tiru Persis**. Jangan membuat manekin full-body, kaki tongkat, atau lengan pipa bersendi.

---

## 1. Format & arsitektur

| Item | Nilai |
| --- | --- |
| Resolusi | 1080 × 1920 (9:16), 30 fps |
| Renderer | `@remotion/three` `<ThreeCanvas … flat dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>` |
| Karakter | Billboard Canvas2D → `THREE.CanvasTexture` di `MeshToonMaterial` |
| Determinisme | Semua nilai = fungsi murni dari `frame` (render frame acak/out-of-order harus identik) |
| Struktur per proyek | `src/<project>/story.ts` (shot list, kamera, cast), `toon.ts` (karakter), `worlds.ts` (set + film pass), `<Project>.tsx` (komposisi + overlay) |

Setiap shot = satu world yang dibangun saat pertama dipakai (`StageManager`), hanya world aktif yang `visible`.

## 2. Kanvas & proporsi bust (waist-up)

```ts
const LW = 768;            // lebar kanvas logis
const LH = 1024;           // tinggi kanvas logis
const TEXTURE_SCALE = 0.75; // backing canvas 576 × 768
const HEAD_CX = LW / 2;    // 384 — semua bagian tubuh terpusat di sini
const HEAD_CY = 380;
const HEAD_HALF_W = 240;
const HEAD_HALF_H = (HEAD_HALF_W * 2 * 0.94) / 2; // rasio tinggi/lebar kepala 0.94
const TORSO_TOP = HEAD_CY + 190;                    // 570
const OUTLINE = 11;
const PLUM = '#241726';                             // tinta plum untuk SEMUA garis
export const ACTOR_PLANE_WIDTH = 0.9;               // meter
export const ACTOR_PLANE_HEIGHT = 1.2;              // meter (bust, bukan full-body)
```

- Plane di-`translate(0, 0.6, 0)` → **origin = dasar bust** (tengah bawah). Anchor world menaruh dasar ini di lantai, dudukan bangku, atau di balik meja.
- Torso melebar seperti lonceng sampai tepi bawah kanvas (`traceTorso`: bahu ±172, dasar ±250). **Tidak ada kaki.** Dasar bust "duduk" di lantai/bangku, atau disembunyikan meja/panel depan.
- Skala karakter di world: tokoh utama **1.15–1.2**, figuran **1.05–1.1**, anak **0.8–0.85**.
- Ketinggian berguna (skala 1, di atas dasar): pusat kepala **0.755 m**, puncak torso **0.53 m**, tangan "menelusuri" **≈0.49 m**, tangan "menunjuk" **≈0.54 m**, tangan "meraih ke atas" **≈0.95 m**. Kalikan dengan skala karakter, lalu tempatkan prop (ukiran, papan, peta, papan nama) di ketinggian itu.

## 3. Kepala Bean Head (`traceBeanHead`)

Superellipse dengan mahkota sedikit runcing, dipusatkan di (0, 0) lalu di-`translate(HEAD_CX + turn*12, HEAD_CY + napas + bow*22)` dan `rotate(tilt)`:

```ts
function traceBeanHead(ctx: CanvasRenderingContext2D, scale = 1): void {
  const segments = 120;
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const top = s < 0;
    const n = top ? 2.3 : 2.9;                       // atas lebih bulat-runcing, bawah lebih persegi
    const x = HEAD_HALF_W * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let y = HEAD_HALF_H * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (top) {
      const k = 1 - Math.abs(x) / HEAD_HALF_W;
      y *= (1 + 0.22 * k * k * k) / 1.22;           // mahkota sedikit meruncing di tengah
    }
    if (i === 0) ctx.moveTo(x * scale, y * scale);
    else ctx.lineTo(x * scale, y * scale);
  }
  ctx.closePath();
}
```

Urutan lukis wajah (semua di dalam `clip` kepala):

1. Isi `skin`, lalu bayangan sisi jauh `rgba(150,80,70,0.2)` (elips di x = `W*1.05 - turn*40`).
2. **Pipi blush hangat**: elips `rgba(214,100,100,0.28)` (hijab/perempuan: `rgba(232,108,110,0.36)`) di bawah mata (`eyeY + 76`).
3. Hidung: kait sederhana warna `skinShade`, lebar garis 7.
4. **Mata bulat hidup** (`drawEye`): sklera `#fbf5ea` rx 40 × ry 47, pupil besar coklat tua + inti gelap, **dua highlight** putih (besar kiri-atas, kecil kanan-bawah), kelopak atas/bawah warna kulit untuk kedip, garis kelopak tebal. Tokoh perempuan: **bulu mata lentik** dua helai di ujung luar.
5. Tutup clip → kumis/janggut → mulut (`drawMouth`, kurva senyum `smile*22`, atau "o" kecil untuk ekspresi kagum) → garis luar kepala (`strokeOutline`, 11 px plum) → kacamata → alis (lebar garis 13, 10 untuk perempuan) → headwear.

Kehidupan idle (wajib, dari `poseFor`): kedip tidak teratur ±3–5 detik dengan kedip ganda sesekali (`blinkAt`), napas 0.22 Hz, pergeseran berat badan 0.11 Hz, sway kepala, saccade mata kecil tiap ~38 frame.

Ekspresi = preset `{lid, browRaise, browInner, browAsym, smile, bow, lookY, open}` dengan crossfade ±0.04 progress: `neutral`, `warm`, `serious`, `thinking`, `sad`, `wonder` (+ `respect` di Persis). Pilih ekspresi yang selaras dengan kalimat narasi pada shot tersebut.

## 4. Headwear

Semua headwear digambar di koordinat kepala, bergeser `turn*22`, dengan outline plum 9 px.

- **Peci**: trapesium beludru `#18131c` dari `-H*0.42` sampai `-H-22`, kilap `rgba(120,100,150,0.28)`, sudut membulat (persis Persis).
- **Sorban**: kubah `#f4f1ea` + lilitan `#cfc6b6` (Persis).
- **Caping**: kerucut lebar ±320 px dari `-H-150`, anyaman garis radial, sisi kanan diberi bayangan.
- **Topi seragam / kepi / station cap**: pita (band) 392 px, visor elips gelap, emblem emas.
- **Rambut**: tutup rambut di dalam clip kepala dengan poni bergerigi (`short`, `kid`), plus sanggul lingkaran di belakang kepala (`bun`).
- **Hijab** (wajib rapi, mengikuti kontur bean):
  1. *Lapisan belakang* (sebelum kulit wajah): tudung + **juntaian lembut di dada** berbentuk lonceng dari `±W*1.06` turun ke `TORSO_TOP + 270`, gradasi terang ke gelap, 2–3 garis lipatan gelap.
  2. *Lapisan depan* (setelah fitur wajah): pita antara `traceBeanHead(ctx, 1.07)` dan jendela wajah oval (`ellipse(fx*0.45, 34, W*0.8, H*0.98)`), diisi `fill('evenodd')` dengan gradasi radial. Kedua kontur di-ink.
  3. Lipatan highlight di mahkota kiri, lipatan gelap di pelipis kanan.
  4. **Pin/bros kecil** di bawah dagu (`HEAD_HALF_H + 36`).
  5. Mata turun 14 px agar wajah pas di jendela hijab. Alis tetap terlihat di dalam jendela.

## 5. Busana

Torso diisi `cloth`, di-clip, lalu diberi shading sisi jauh ala Persis (elips `clothShade` di `cx+260`) dan kilap hangat dari kiri atas. Variasi:

- `koko`: kerah mandarin + kancing (Persis). `safari` / `jas`: kerah V + saku (Persis).
- `jacket` (denim washed `#5b7fb5`): tekstur twill diagonal, area pudar, **kaos/kemeja putih** di tengah, kerah lapel, saku dada + paku keling tembaga, jahitan emas putus-putus.
- `uniform`: kerah tegak, kancing emas, saku bertutup.
- `kebaya`: kerah V berenda putih, bros berjajar. `lurik`: garis vertikal. `kemeja` / `polo`: kerah + kancing. `kaos`: garis leher.
- **Aksen ransel**: badan ransel mengintip di belakang bahu (dilukis sebelum torso) + dua tali dengan gesper di depan pundak.

## 6. Lengan & tangan mitten kartun

- Lengan = **satu kurva bezier kuadratik mulus** (rubber-hose) dari bahu (`cx ± 168, top + 64`) ke pergelangan: garis plum 84 px, lalu lengan baju 70 px. **Tidak ada sendi IK yang patah.** Makin dekat pergelangan ke bahu, makin besar lengkungan siku ke arah luar.
- **Kedua lengan selalu dilukis.** Saat istirahat, tangan menjuntai di sisi badan dekat dasar bust. Gestur hanya menggeser *target pergelangan* dengan crossfade, sehingga tangan tidak pernah tiba-tiba hilang atau muncul. Ini sekaligus fix untuk bug tangan hilang di Persis.
- Target pergelangan dijepit ≥ 56 px dari tepi kanvas, supaya mitten dan prop tidak pernah terpotong.
- Bentuk mitten (garis plum 7–8 px, kulit polos):
  - `fist` (genggam/pegang prop): elips 38 × 34 + 3 garis jari.
  - `point` (menunjuk): telunjuk `roundRect` 64 × 24 + kepalan + jempol. Sama dengan gestur "dalil" Persis.
  - `palm` (telapak terbuka / menelusuri / presenter): dayung 46 × 38 + jempol + 2 lipatan jari.
- Pose standar: `side`, `hip`, `strap` (tali ransel), `pocket`, `point`, `pointHigh`, `pointSide`, `spread`, `palm`, `trace`/`traceLow` (menelusuri ukiran), `write`/`pressPage` (menulis di meja), `chalk`/`holdBoard`, `whistle`, `lampLow`, `hammer`, `carryShoulder`, `hug`, `basketLap`, `suitcase`, `ticket`, `newspaper`, `reachUp`, `wave`.
- Prop kontekstual dan natural: kepala stasiun memegang satu pena, kondektur memegang peluit + lentera sinyal, pekerja memegang palu, petani memanggul keranjang, penumpang memeluk karung/bakul di pangkuan. Prop besar (buku di meja, papan kapur, koran, karung, bakul, keranjang) dilukis pada bust dan digenggam mitten.

## 7. Billboard ber-cahaya

```ts
const material = new THREE.MeshToonMaterial({
  map: texture,                 // canvas karakter
  normalMap: normalMap(),       // ellipsoid kepala + silinder torso → cahaya 3D jatuh di karakter
  normalScale: new THREE.Vector2(0.8, 0.8),
  gradientMap: kit.gradient,    // three-band ramp, lihat §8
  alphaTest: 0.5,
  alphaToCoverage: true,
});
mesh.castShadow = true;
mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.5 });
// Selalu menghadap kamera (yaw saja), dikompensasi yaw parent:
mesh.rotation.y = Math.atan2(cam.x - world.x, cam.z - world.z) - parentYaw;
```

Setelah melukis, tambahkan **grain kertas** dengan `globalCompositeOperation = 'source-atop'` supaya alpha cut-out tetap utuh. Figuran dan hewan **wajib** memakai sistem billboard yang sama (bukan model 3D lain) agar gayanya seragam 100%.

## 8. Pencahayaan dual-tone

- **Ramp toon tiga pita**: `new THREE.DataTexture(new Uint8Array([64, 150, 255]), 3, 1, THREE.RedFormat)` dengan `NearestFilter` (lit / mid / bayangan inti dingin). Gunakan `WorldKit.toon()`.
- **Key light hangat** (matahari/lampu): `DirectionalLight` dengan bayangan tajam (`mapSize 2048`, `bias -0.0004`, `normalBias 0.03`, extent shadow sekecil mungkin di sekitar subjek).
  - Golden dusk: key `#ffa550` / `#ffb064`, intensitas 2.6–3.6, posisi rendah dari samping.
- **Fill dingin twilight**: `HemisphereLight` langit `#2c1f4a` / `#4c56a8`, tanah `#1b1840` / `#120c22`.
- **Aksen praktis**: lentera berayun dengan `PointLight` `#ffae52` (decay 1.3) + glow sprite; sorot matahari palsu (`kit.shaft`) + **dust motes** yang hanya berkilau di dalam sorot (`kit.motes`) + debu melayang (`kit.dust`).
- Atmosfer: `THREE.Fog` sewarna langit; backdrop langit dilukis di canvas dan sedikit di-blur; pegunungan dibuat berlapis (siluet transparan dengan kabut di kakinya).
- **Film pass** (`FilmPipeline`): DoF berbasis depth, split-tone indigo pada bayangan + amber pada highlight, vignette, grain + dither, `dip` gelap di setiap cut. Untuk adegan arsip: uniform sepia/abu-abu.

## 9. Sinematografi vertikal

Lebar horizontal frame 9:16 sempit: lebar terlihat ≈ `2 · d · tan(fov/2) · 0.5625`.

- Gunakan **Medium shot / Over-the-shoulder (OTS) / 3/4 / Wide**. Untuk satu bust skala 1.2 dengan lengan terentang (lebar ≈ 1.1 m) pada fov 38°, jarak kamera minimal ≈ 3 m.
- **Larangan:** jangan pernah ada torso/bahu terpotong di tepi layar sementara lengannya menjulur masuk ("tangan melayang"). Lengan hanya boleh terentang ketika bahunya ikut di dalam frame. Saat kamera dolly-in ke prop, turunkan gestur ke `side`/`strap`.
- Target kamera kira-kira setinggi dada sampai mata karakter (dasar + 0.5–0.8 · skala). Gunakan rack focus lewat key `focus` (titik fokus), bukan dengan menggeser target.
- Gerak kamera: spline Catmull-Rom centripetal per shot dengan easing tiap segmen + handheld drift deterministik yang sangat kecil.
- Hook 0–3 detik: badge teaser, judul "slam" dengan squash-bounce, aura emas, dan shake.
- Caption karaoke 1–2 baris (Plus Jakarta Sans 800, highlight `#FBBF24`). **Font guard wajib**: `delayRender` + `setTimeout(done, 1200)` dengan fallback ke font sistem, supaya render tidak pernah timeout karena Google Fonts.
- Sebelum menyerahkan, periksa framing secara matematis (proyeksikan posisi kepala/bahu/tangan dari `poseLayout()` ke kamera tiap frame). Render visual dilakukan oleh sutradara secara lokal.

## 10. Isolasi aset per konten

```
public/<project>/voice.wav       narasi
public/<project>/sfx.wav         efek suara (opsional)
public/<project>/words.json      timing per kata
public/<project>/sentences.json  timing per kalimat
```

- Selalu panggil `staticFile('<project>/…')`. Jangan menaruh aset di root `public/`, supaya proyek tidak saling menimpa.
- `calculateMetadata` memuat `words.json` / `sentences.json` dari folder proyek sebelum render, sehingga props tetap serializable.

## 11. Checklist sebelum commit

- [ ] Semua karakter bean-head bust (768 × 1024, plane 0.9 × 1.2), outline plum `#241726`.
- [ ] Kedua lengan selalu dilukis sebagai kurva mulus, mitten bersih, prop kontekstual.
- [ ] Tidak ada tangan melayang (bahu harus di frame saat lengan terentang). Tidak ada dasar bust yang tampak menggantung di udara.
- [ ] Lantai/tanah luas (≥ 400 m di luar ruangan, ruangan tertutup di dalam).
- [ ] Ramp `[64, 150, 255]`, key hangat + fill twilight, motes/debu, film pass.
- [ ] Aset di `public/<project>/`, font guard 1.2 detik.
- [ ] `npx tsc --noEmit` = 0 error. **Jangan render di cloud.**
