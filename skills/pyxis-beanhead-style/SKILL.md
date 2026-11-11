---
name: pyxis-beanhead-style
description: Standar produksi resmi v2.3 kartun 3D vertikal gaya Bean-Head PyxisLab (hibrida karakter 2D Bean-Head Persis + kaki menapak lantai & Z-order lengan natural, rasio skala 3D megah & atmosfer hidup ala Jam Gadang / The Ancient Jar, framing kamera dinamis, audio seimbang -14 LUFS, workflow TTS ElevenLabs Web UI, engine render hemat resource HyperFrames/Angle, serta manajemen output rapi).
---

# pyxis-beanhead-style (v2.3 — PyxisLab Cinematic Bean-Head Standard)

Standar acuan **mutlak** untuk semua video short kartun 3D vertikal 9:16 PyxisLab di Remotion. Menggabungkan kehangatan karakter **Bean-Head Nusantara khas Persis**, keanggunan gerak bipedal menapak lantai, kemegahan set 3D bertekstur atmosferik ala *Jam Gadang* dan *The Ancient Jar*, kamera dinamis, audio terkalibrasi, serta alur produksi yang bersih dan efisien.

Implementasi referensi di repo ini:

| File | Isi |
| --- | --- |
| `src/persis/toon.ts` | **Sumber asli karakter Bean-Head Nusantara.** Siluet kepala ikonik, mikro-lirikan (*eye saccades*), kedipan ganda acak, siklus napas asimetris (`0.22 Hz`), dan *lip-sync* viseme vokal AIUEO. |
| `src/cikajang/toon.ts` | **Rig bipedal & Z-order acuan.** Kaki menapak lantai (`SOLE = 975`), Z-order lengan depan/belakang anti-numpuk di bahu, variable-weight ink, dan ekspresi *snappy per beat*. |
| `src/cikajang/story.ts` & `src/jam-gadang/story.ts` | Shot list adaptif, **Color Script Table**, ritme dinamis 2–3 dtk, kamera kinematik (creeping hold, macro punch-in, impact roll), transisi cross-dissolve & flash. |
| `src/jam-gadang/worlds.ts` & `src/cikajang/worlds.ts` | Set 3D skala megah, prop arsitektur bertekstur toon line, hero prop mekanisme, lighting rig naratif (rim light senja, torch bounce, kabut atmosferik). |
| `tools/align_subtitles.py` | Penyelaras `words.json` presisi berbasis akustik audio voice ElevenLabs (`Whisper` / RMS silence detection). |
| `Hasil/` | Direktori tersentralisasi untuk semua output produksi (`Video Final`, `Stills & Review`, `Draft & Raw`). |

---

## 1. Format & Arsitektur Render (Spesifikasi Low-Resource Friendly)

| Item | Nilai Standar |
| :--- | :--- |
| **Resolusi** | 1080 × 1920 (9:16 Vertikal), 30 fps (Preview `--scale=0.75`, Final `--scale=1`) |
| **Renderer** | `@remotion/three` `<ThreeCanvas flat dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>` |
| **Material Karakter** | Kartu Canvas2D → `THREE.CanvasTexture` pada `MeshToonMaterial` + normal map (billboard yaw-only) |
| **Eksekusi Render** | **Wajib:** `--gl=angle --concurrency=1` untuk menjaga stabilitas RAM 8GB dan mencegah disk paging freeze |
| **HyperFrames** | Dapat digunakan untuk akselerasi multi-frame Remotion selama konkurensi dibatasi aman (`--concurrency=1` atau maks `2`) |
| **Determinisme** | Semua visual dan audio = fungsi murni matematis dari `frame` |

---

## 2. Karakter Bean-Head: Base Persis + Kaki Bipedal & Z-Order Lengan

Menggabungkan kehangatan pesona karakter Persis dengan fisik tubuh utuh yang proporsional:

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
const HIP_Y = SOLE - HEAD_H_PX * 1.35;              // kaki bean-head gemuk proporsional ≈ 1.35 × HH
const TORSO_TOP = HIP_Y - HEAD_H_PX * 1.1;          // torso ≈ 1.1 × HH
const HEAD_CY = TORSO_TOP - HEAD_HALF_H * HEAD_SCALE + 8;
```

### 2.1 Anatomi Wajah & Mikro-Animasi Persis
- **Siluet & Warna:** Kulit hangat Nusantara, pipi merona lembut, outline plum variable-weight (3:1 lebih tebal di sisi bayangan bawah).
- **Mata Bernyawa:** Lirikan mikro (*eye saccades*) acak tiap 1.2–2 detik, kedipan 4-frame (`half/shut/shut/half`), dan kedipan ganda acak.
- **Siklus Napas (`0.22 Hz`):** Dada mengembang-kempis asimetris (tarikan napas lebih cepat daripada hembusan napas).
- **Lip-Sync Vokal AIUEO:** Setiap tokoh yang berbicara wajib membuka mulut secara fonetik mengikuti vokal kata Indonesia dari `words.json`.

### 2.2 Z-Order Lapisan Lengan (Anti-Numpuk di Bahu)
- **Urutan lukis mutlak:** Lengan belakang → Torso & Busana → Kepala → Lengan depan → Mitten & Telapak → Aksesoris/Prop.
- **Lengan Santai / Samping / Menunjuk:** Selalu digambar di **belakang torso** (`front: false`) agar pangkal bahu menyatu mulus di balik baju.
- **Lengan Menyilang Dada / Membawa Barang di Depan:** Digambar di **depan torso** (`front: true`).

### 2.3 Kaki Bipedal Menapak Lantai
- Sol sepatu selalu menempel di `SOLE = 975` (lantai `y = 0`). Tidak boleh ada karakter yang mengambang di udara.
- Ayunan langkah menggunakan kurva elips lembut dengan sedikit tekukan lutut dan bobbing torso `3.5 px`.

---

## 3. Fleksibilitas Peran Karakter (Mix Adaptif Opsi A & B)

Jangan memaksakan karakter hadir terus-menerus di tengah frame:
1. **Fase Sinematik & Arsitektur (Opsi A):** Kamera fokus 100% pada kemegahan dunia 3D (arsitektur megah, close-up hero prop berputar, lanskap alam luas). Karakter bisa hadir kecil di balkon kejauhan atau sama sekali tidak ada agar audiens terpukau dengan visual dunia.
2. **Fase Suasana & Interaksi (Opsi B):** Karakter hadir secara natural di sudut ruangan/alam, berinteraksi fisik nyata dengan objek (memegang pagar, menarik tali pedati, mengamati instrumen).
3. **Fase Dialog / Tokoh Inti:** Kamera bergerak ke *Medium Close-Up (MCU)* dengan kedalaman ruang (*depth of field*), menonjolkan ekspresi wajah tokoh dan artikulasi bibir yang hidup.

---

## 4. Dunia 3D Skala Megah & Lingkungan Atmosferik Hidup

Mengadopsi keindahan visual referensi *Jam Gadang* dan *The Ancient Jar*:

### 4.1 Rasio Skala Epik (Epic Scale Contrast)
- Karakter bean-head yang imut (`tinggi ~1.5 m`) diletakkan di dalam set 3D yang **masif dan berwibawa** (pilar batu berukir, menara tinggi, lembah gunung luas, halaman istana ribuan prajurit). Kontras antara karakter imut dan dunia megah menciptakan daya tarik visual premium.

### 4.2 Tekstur & Detail Arsitektur Toon
- Bangunan tidak boleh sekadar blok warna polosan:
  - Tembok memiliki aksen susunan batu bata halus dan garis tinta toon luar (*edge outline*).
  - Pilar memiliki lekukan ornamen dan alas/puncak bertingkat.
  - Lantai memiliki motif paving, ubin, atau hamparan rumput berlapis.

### 4.3 Partikel Atmosfer & Kehidupan Alam
- **Partikel Udara:** Berkas cahaya lampu/matahari membawa partikel debu halus yang berpendar (*floating dust specks*), kabut tipis (*fog*), atau uap panas kancah yang meliuk.
- **Elemen Bergerak:** Pohon dan ranting bergoyang pelan tertiup angin, daun kering melayang sesekali, awan langit berarak perlahan.
- **Fauna & Figuran:** Siluet burung terbang melintas di langit senja atau kucing yang duduk santai di teras.

---

## 5. Sinematografi Kamera Dinamis

- **Macro Punch-In (Detik 0–1):** Membuka shot dengan bidikan sangat dekat ke hero prop (permukaan ukiran emas, jarum jam raksasa, adonan bergolak).
- **Creeping Hold:** Pada shot narasi statis, kamera tetap bergerak perlahan (`0.15% - 0.25% per frame`) maju atau mengitari objek agar adegan tidak pernah mati kaku.
- **Camera Roll Dinamis:** Miringkan kamera sebesar `2° – 4°` pada momen pendakian, hentakan dramatis, atau klimaks emosi.
- **Foreground Framing:** Menempatkan ornamen buram (ranting pohon, pilar, lentera) di tepi lensa depan untuk memberikan ilusi kedalaman 3D (*depth layered composition*).

---

## 6. Sound Design & Audio Mixing Terkalibrasi

- **Standar Broadcast YouTube Shorts:** Master audio terpadu di kisaran **-14 LUFS** (integrated loudness) dengan batas aman peak `-1 dBTP`.
- **Auto-Ducking Wajib:** Saat narasi vokal bersuara, SFX lingkungan dan musik latar otomatis turun **-6 s.d. -8 dB** agar kata-kata narator terdengar sangat jernih dan renyah.
- **Foley Proporsional:** Suara gemeretak api, decit roda pedati, adukan kuali, desis uap, dan gesekan kain hadir sebagai tekstur pengisi yang pas—tidak memekakkan telinga dan tidak tenggelam.

---

## 7. Workflow Suara: ElevenLabs Web UI & Penyelaras Subtitle

1. **Produksi Voiceover:**
   - Gunakan **ElevenLabs Web UI** resmi dengan model `eleven_multilingual_v2`.
   - Pilih persona suara berkarakter (misal: *Bagas* untuk narasi berwibawa Indonesia, atau suara hangat ekspresif lainnya).
   - Ekspor audio WAV/MP3 dan simpan di `public/<proyek>/voice.wav`.
2. **Penyelarasan Presisi:**
   - Jalankan `python tools/align_subtitles.py public/<proyek>/voice.wav public/<proyek>/sentences.json --out public/<proyek>/words.json`.
   - Subtitle otomatis sinkron per kata dengan highlight kuning kontras `#FBBF24` dan outline hitam tebal.

---

## 8. Standar Manajemen Direktori & Output (`Hasil/`)

Semua file output produksi dilarang menumpuk di sembarang tempat. Wajib diarahkan ke struktur rapi berikut:

```
C:\Users\Kamila\Documents\video\Hasil\
├── Video Final\          <-- Khusus video MP4 final ter-render sempurna siap rilis
│   ├── persis_remake_final.mp4
│   ├── jam_gadang_v2_final.mp4
│   ├── cikajang_v22_final.mp4
│   └── dodol_garut_v1_final.mp4
├── Stills & Review\      <-- Kumpulan tangkapan layar (contact sheet & audit beat)
│   ├── dg_v4_still_*.jpg
│   └── cikajang_still_*.jpg
└── Draft & Raw\          <-- Video mentah tanpa audio, uji coba, preview sementara
    ├── jam_gadang_raw.mp4
    └── test_frames.mp4
```
Semua script render baru dan pipeline wajib merujuk ke folder `Hasil\` ini.
