---
name: pyxis-beanhead-style
description: Standar produksi resmi v2.3 kartun 3D vertikal gaya Bean-Head PyxisLab (hibrida karakter 2D Bean-Head Persis + kaki menapak lantai & Z-order lengan natural, rasio skala 3D megah & atmosfer hidup ala Jam Gadang / The Ancient Jar, framing kamera dinamis, audio seimbang -14 LUFS, workflow TTS ElevenLabs Web UI, engine render hemat resource HyperFrames/Angle, serta manajemen output rapi).
---

# pyxis-beanhead-style (v2.3 — PyxisLab Cinematic Bean-Head Master Standard)

Standar acuan **mutlak dan permanen** untuk semua produksi video short kartun 3D vertikal 9:16 PyxisLab di Remotion. Menggabungkan kehangatan pesona karakter **Bean-Head Nusantara khas Persis**, gerak bipedal menapak lantai yang luwes, kemegahan set 3D bertekstur atmosferik ala *Jam Gadang* dan *The Ancient Jar*, trik retensi viral, tata suara *diegetic foley*, hingga alur kerja efisien berbasis *Modular Kitbash* dan ElevenLabs Web UI.

> [!IMPORTANT]
> **Prinsip Utama: Cerita Adalah Raja, Efek Visual Adalah Pelayan Cerita.**
> Seluruh fitur visual khusus (seperti *Inspect / X-Ray*, *Diorama Cutaway*, *Comic Action Zoom*, dll.) bersifat **situasional dan adaptif**. Jangan pernah memaksakan efek tertentu jika tidak cocok dengan konteks narasi. Kreator wajib cerdas memilih gaya visual yang paling memperkuat tema cerita.

---

## 1. Format & Arsitektur Render (Low-Resource Friendly)

| Parameter | Nilai Standar | Keterangan |
| :--- | :--- | :--- |
| **Resolusi** | 1080 × 1920 (9:16 Vertikal) | Standar mutlak YouTube Shorts, TikTok, IG Reels |
| **Frame Rate** | 30.0 fps murni | `30 fps` konstan, preview dev `--scale=0.75`, final `--scale=1` |
| **Canvas & Shading** | `@remotion/three` `<ThreeCanvas>` | `MeshToonMaterial` + normal map + billboard yaw-only |
| **Pagar Memori Render** | `--gl=angle --concurrency=1` | **Wajib di laptop RAM 8GB / 2 Cores** agar bebas disk paging freeze |
| **HyperFrames Engine** | Kompatibel penuh | Akselerasi Remotion aman selama konkurensi terkunci pada `1` (maks `2`) |
| **Determinisme** | Fungsi Murni Matematis | Seluruh animasi, kamera, dan audio = $f(\text{frame})$ tanpa `Math.random()` |

---

## 2. Karakter Bean-Head: Base Persis + Kaki Bipedal & Z-Order Lengan

Mengadopsi seluruh kehangatan dan ekspresi hidup dari `src/persis/toon.ts`, disempurnakan dengan anatomi tubuh bipedal dan sambungan lengan anti-tumpang tindih:

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

### 2.1 Wajah & Ekspresi Bernyawa (Formula Persis)
- **Siluet Wajah:** Kulit bernuansa hangat Nusantara, pipi blush merona halus, outline plum variable-weight (stroke 3:1 lebih tebal di sisi bayangan bawah).
- **Mikro-Animasi Wajib:**
  - Nafas organik 0.22 Hz pada torso dan bahu.
  - Kedipan mata seeded (setiap 2.5–4 detik) + lirikan mata halus mengikuti aksi/kamera.
  - Lip-sync AIUEO tersinkronisasi akustik ke `words.json`.
- **Karakter Figuran & Kerumunan Wajib Seragam (Unified Style):** DILARANG menggunakan kapsul/silinder 3D polos sebagai orang/kerumunan. Semua manusia (turis, warga kota, pembeli) WAJIB menggunakan format Bean-Head Persis berbusana santai/tematik, berekspresi hidup, dan proporsional.
- **Anatomi Aksi Alami (Pose & Arah Gerak):**
  - **Mendorong / Menarik Objek:** Badan condong ke depan (3/4 serong), kedua tangan memegang stang/beban secara realistis, wajah menatap ke arah tujuan/gerobak (bukan menatap lurus ke kamera seperti patung).
  - **Sinkronisasi Gerak & Wajah (Anti-Terbalik):** Vektor arah jalan (`walkDir`), orientasi tubuh, kepala, dan langkah kaki harus 100% searah. Jika bergerak ke kiri/kanan/maju, pandangan dan langkah kaki harus sinkron ke arah gerak.
  - **Anti-Gepeng Tampilan Atas (Volume on Top-Down View):** Saat kamera berada di sudut pandang drone / atas (*high-angle* atau *top-down*), billboard karakter 2D harus memiliki kompensasi sudut kemiringan dinamis (*billboard pitch/tilt*) atau ketebalan volume semu agar tetap terlihat padat dan berisi, tidak gepeng seperti kertas tipis.

---

## 3. Panggung 3D: Restyle Realistis Objek Nyata, Living Environment & Depth of Field

### 3.1 Restyle Akurat Berbasis Referensi Asli (Real-World Restyle Rule)
Setiap kali menampilkan bangunan, toko, atau fasilitas yang ada di dunia nyata (seperti **Indomaret**, **Alfamart**, stasiun, pasar, dsb.):
- **Riset Visual Asli Wajib:** Teliti foto fasad asli, proporsi logo, warna khas, dan detail arsitekturnya.
- **Restyle Menjadi Ciri Khas Seni Kita:**
  - **Indomaret:** Fasad garis tiga warna (Biru tua, Kuning, Merah), logo persegi merah-kuning berlatar putih dengan font khas Indomaret, plang neon box atas yang terang, pintu kaca geser otomatis dengan stiker sandblast/operasional, serta pylon sign / plang tiang tinggi di depan parkiran.
  - **Alfamart:** Fasad lis merah tebal dengan aksen kuning-biru, logo Alfamart di atas panel merah menyala, poster promo kaca (seperti JSM / Promo Hebat) yang tertata rapi tanpa teks terpotong (*text-wrapping* presisi), pintu geser kaca, dan tiang reklame khas.
  - **Interior Kaca Tembus Pandang:** Di balik kaca etalase, wajib terlihat pencahayaan lampu interior hangat, kasir, rak snack berjejer rapi, dan kulkas minuman dingin berpendar.

### 3.2 Environment Hidup & Sinematografi (Living Atmosphere & DoF)
- **Living Atmosphere:** Panggung 3D harus bernafas dan hidup:
  - Partikel debu/cahaya (*ambient dust motes / mist*).
  - Pantulan aspal basah malam hari (*wet asphalt SSR reflection*) yang memantulkan lampu neon toko dan lampu jalan kuning.
  - Elemen gerak latar belakang: lampu jalan berkedip halus, mobil/motor melintas samar di kejauhan, daun pohon berayun lembut, dan gerimis/kabut tipis.
- **Depth of Field (DoF) & Sinematik Blur:**
  - Manfaatkan efek blur kedalaman (*focal blur / bokeh*) pada latar belakang jauh dan foreground dekat untuk memfokuskan mata penonton ke karakter utama atau aksi penting.
  - Kamera Catmull-Rom spline dengan easing lembut, tilt vertikal 9:16 yang dinamis, dan transisi pencahayaan dramatis antar babak.

---

## 4. Tipografi & Subtitle Estetik (Anti-Kebesaran & Rapi)

- **Ukuran Pas & Proporsional Layar HP:**
  - `fontSize: 50–54px` (jangan pernah lebih dari 60px agar tidak menutupi visual penting atau tubuh karakter).
  - `WebkitTextStroke: 6px #000` (outline tegas tapi ramping dan elegan, bukan 14px tebal kotor).
  - Jarak aman bawah: `bottom: 280–320px` (aman dari tombol like/share/komentar TikTok, Reels, dan Shorts).
- **Teks Poster & Signage Tanpa Cacat:**
  - Semua poster etalase (misal `PROMO MINGGU INI`, `2+1 MINUMAN`, `BUKA 24 JAM`) wajib memiliki canvas text wrapping yang rapi, huruf tidak boleh terpotong (seperti `ROM` terpotong), dan ukuran font proporsional dengan bingkai poster.
  - *Eye Saccades:* Lirikan acak mata 1–2 px tiap 1.2–2 detik menjaga karakter tidak tampak seperti patung mati.
  - *Blink Rhythm:* Kedipan 4 frame (`half/shut/shut/half`) dengan sesekali kedipan ganda acak.
  - *Breathing Cycle (`0.22 Hz`):* Dada naik-turun asimetris (tarikan napas sedikit lebih cepat dari hembusan).
  - *Lip-Sync Vokal AIUEO:* Ketika ada dialog, mulut membuka-menutup secara fonetik presisi mencocokkan vokal audio narasi dari `words.json`.

### 2.2 Z-Order Layering Lengan (Anti-Numpuk di Bahu)
- **Urutan Gambar Mutlak:** `Lengan Belakang` $\rightarrow$ `Torso & Pakaian` $\rightarrow$ `Kepala` $\rightarrow$ `Lengan Depan` $\rightarrow$ `Mitten/Telapak` $\rightarrow$ `Prop Tangan`.
- **Lengan Santai / Samping / Menunjuk:** Selalu ditaruh di **belakang torso** (`front: false`) agar sambungan bahu tertutup rapi oleh kerah pakaian tanpa patahan outline kaku.
- **Lengan Memegang Dada / Benda di Depan:** Digambar di **depan torso** (`front: true`).

### 2.3 Kaki Bipedal Menapak Lantai (Anti-Skating)
- Sol sepatu selalu mendarat presisi di `SOLE = 975` (lantai dunia `y = 0`). Karakter dilarang melayang.
- Walk cycle bipedal mengayun elips dengan tekukan lutut wajar dan bobbing torso `3.5 px`, terhindar dari kesan meluncur (*foot skating*).

---

## 3. Dinamika Panggung: Fleksibilitas Kemunculan Tokoh

Karakter tidak boleh dipaksakan selalu berdiri di tengah frame setiap saat:
1. **Fase Sinematik & Arsitektur (Opsi A):** Kamera fokus 100% pada kemegahan set 3D atau mekanisme hero prop. Karakter bisa berada jauh di balkon kejauhan atau tidak muncul sama sekali agar audiens menikmati skala dunia.
2. **Fase Suasana & Interaksi (Opsi B):** Karakter hadir membaur secara natural di sudut ruangan/alam, memegang pagar, menarik tali pedati, atau berjongkok di dekat tungku.
3. **Fase Dialog / Tokoh Inti:** Kamera bergerak ke *Medium Close-Up (MCU)* dengan kedalaman ruang (*depth of field*), menonjolkan ekspresi wajah dan gerak bibir bernyawa.

---

## 4. Dunia 3D Skala Megah & Sentuhan "Living Painting"

Mengadopsi keindahan visual referensi *Jam Gadang* dan *The Ancient Jar*:

### 4.1 Rasio Skala Epik (Epic Scale Contrast)
- Karakter bean-head imut (`~1.5 m`) diletakkan di dalam set 3D yang **menjulang megah dan berwibawa** (pilar batu berukir, menara jam Minang, halaman istana luas, lembah gunung Priangan). Kontras ini memberikan sentuhan visual premium.

### 4.2 "Living Painting" Texture (Tekstur Kanvas & Cat Air Bergerak Halus)
- **Konsep:** Visual tidak boleh terlihat seperti grafik komputer 3D polos yang kaku dan mengkilap layaknya game lawas. Seluruh dunia harus terasa seperti **lukisan hidup (*story-book animation*)** yang hangat dan berjiwa ala film animasi Ghibli / festival Eropa.
- **Trik Teknis:**
  - Tambahkan lapisan *subtle paper/canvas grain* procedural dan sapuan kuas halus (*brushstroke micro-displacement*) pada shader Three.js atau pasca-proses overlay.
  - Tembok dan bangunan memiliki garis tinta toon luar (*edge outline*) bertinta plum gelap alami, bukan garis hitam tebal komputer murahan.
  - Tepian bayangan di-render dengan gradasi warna hangat (indigo / lavender / warm amber), bukan abu-abu mati.

### 4.3 Partikel Atmosfer & Kehidupan Latar Belakang
- **Partikel Udara:** Berkas cahaya matahari/lampu membawa bintik debu emas melayang (*floating dust specks*), kabut tipis (*fog*), atau uap mengepul meliuk.
- **Elemen Bergerak:** Ranting dan pohon bergoyang lembut tertiup angin, daun kering melayang sesekali, awan langit berarak perlahan.

### 4.4 Dynamic "Character Silhouette Acting" di Latar Belakang
- **Konsep:** Penonton sangat menyukai "kehidupan tersembunyi" di latar belakang panggung yang membuat dunia terasa nyata dan berpenghuni.
- **Trik Eksekusi:** Di belakang karakter utama yang sedang beraksi, hadirkan siluet figur pendukung yang bergerak alami secara diegetik:
  - *Di jendela rumah / teras:* Siluet kucing lokal yang menguap malas lalu bergulung tidur.
  - *Di lorong / jalan kejauhan:* Siluet warga desa yang sedang memikul bakul atau mendorong sepeda melintas santai.
  - *Di dahan pohon / atap:* Burung yang hinggap, menoleh ke kiri-kanan, lalu terbang saat ada suara hentakan narasi.

---

## 5. Sistem Produksi Cerdas: "Modular Kitbash & Dynamic Mood"

Agar lokasi tidak membosankan dan produksi efisien tanpa membuat set dari nol:

### 5.1 Komponen Modular (Lego Kitbash)
Koleksi aset individual yang bisa dibongkar-pasang menjadi lokasi baru dalam hitungan menit:
- *Dinding & Kusen:* Kayu lapuk, bata ekspos, dinding plester kolonial, jendela krepyak, kaca patri.
- *Elemen Alam:* 3 tipe pohon, 2 jenis semak, batu kali, jalan setapak berbatu, kontur bukit.
- *Properti Mini:* Karung goni, lentera gantung, meja kayu vintage, tong air, gerobak pedati.

### 5.2 Transformasi Mood & Pencahayaan
Satu susunan geometri yang sama dapat berubah total suasananya:
- **Siang Terik:** Cahaya putih hangat kontras, bayangan tajam, debu beterbangan.
- **Senja Golden Hour:** Cahaya emas jingga pekat dengan bayangan ungu lavender (*rich twilight*).
- **Malam Temaram:** Gelap mendalam dengan pendaran cahaya lilin/obor oranye berkedip.
- **Pagi Berkabut / Gerimis:** Warna sejuk cyan lembut, partikel titik air tipis, suasana melankolis.

### 5.3 Hero Landmark Eksklusif per Episode
Setiap episode wajib memiliki **1 objek/bangunan ikonik pusat** yang unik dan menjadi bintang cerita (misal: Menara Jam Gadang, Kuali Kancah Tembaga Raksasa, Lokomotif Uap Bergigi).

---

## 6. Sinematografi Kamera & Trik Retensi Viral

### 6.1 Trik Algoritma & Retensi (Biar Ditonton Berulang-ulang)
- **Seamless Infinite Loop:** Kalimat penutup di detik ke-59 dirancang menyambung langsung dengan frasa pembuka detik ke-0, memicu penonton menonton ulang tanpa sadar dan melipatgandakan *retention rate* (>110%).
- **The 2-Second Rule:** Setiap 2–2.5 detik wajib terjadi pergantian mikro visual (perubahan sudut kamera, lirikan mata karakter, objek melintas, atau hentakan visual).
- **Kinetic Subtitle Pop:** Kata-kata kunci bernasib lompat mikro (*spring scale 1.15x*) selama 4 frame saat kata diucapkan narator.

### 6.2 Kamera Kinematik
- **Macro Punch-In (Detik 0–1):** Membuka video dengan bidikan lensa dekat ke hero prop berkilau untuk mengikat perhatian di detik pertama.
- **Creeping Hold:** Kamera tidak pernah membeku 100%; ada pergerakan lambat maju/memutar `0.15% - 0.25% per frame`.
- **Dynamic Camera Roll:** Sudut kemiringan roll `2° – 4°` pada momen pendakian, hentakan dramatis, atau klimaks cerita.
- **Foreground Dirty Framing:** Menaruh ornamen buram (dedaunan, lentera, tiang kayu) di tepi lensa depan untuk efek kedalaman berlapis.

### 6.3 Kotak Senjata Visual: Pilihan Efek Berdasarkan Genre Cerita
Gunakan efek yang **tepat sesuai topik cerita**, jangan dipukul rata:
1. **Untuk Konten Sains & Mekanisme (Mode Inspect / X-Ray / Blueprint):**
   - Layar meredup ke perkamen kuno / blueprint gelap, objek terbelah 3D dengan garis emas mengkilap untuk memperlihatkan rahasia molekul atau roda gigi internal (contoh: *kenapa dodol awet*, *mesin jam kuno*).
2. **Untuk Konten Sejarah, Petualangan & Legenda (Mode Comic Action Zoom / Dramatic Punch):**
   - Hindari X-Ray medis! Gunakan *cinematic action punch-in*, garis fokus (*speed lines*) tipis bertinta kuas, ekspresi terkejut dramatis, dan transisi peta kuno / siluet perjalanan heroik (contoh: *sejarah kota Garut*, *legenda kerajaan*).
3. **Untuk Konten Budaya & Keindahan Alam (Mode Scenic Atmosphere):**
   - Tonjolkan *god rays*, partikel kabut pegunungan, bayangan dedaunan tertiup angin (*caustics/dappled shadows*), dan pergerakan kamera gliding megah.

---

## 7. Sound Design & Audio Mixing Terkalibrasi

- **Standar Broadcast YouTube Shorts:** Master audio terpadu di kisaran **-14 LUFS** (integrated loudness) dengan batas aman peak `-1 dBTP`.
- **Auto-Ducking Wajib:** Saat suara narator vokal masuk, musik latar dan efek atmosfer otomatis turun **-6 s.d. -8 dB** agar narasi tetap jernih.
- **Diegetic Foley Nyata:**
  - Suara langkah kaki halus menapak tanah/batu (*tap-tap* bipedal tersinkronisasi).
  - Gesekan kain baju saat bergerak.
  - Suara angin mendesir lembut di bukit atau derak api kayu bakar.
- **Adaptive Music Drops:** Musik latar mendadak berhenti (*tape-stop / silent beat*) selama 1 detik tepat saat punchline atau kejutan fakta diungkap, lalu masuk kembali di momen resolusi.

---

## 8. Workflow Suara: ElevenLabs Web UI & Subtitle Presisi

1. **Produksi Suara:**
   - Gunakan **ElevenLabs Web UI** resmi dengan model `eleven_multilingual_v2`.
   - Pilih persona suara berwibawa khas Indonesia (seperti *Bagas*).
   - Ekspor audio WAV/MP3 dan letakkan di `public/<proyek>/voice.wav`.
2. **Penyelarasan Akustik:**
   - Jalankan script penyelaras:
     ```bash
     python tools/align_subtitles.py public/<proyek>/voice.wav public/<proyek>/sentences.json --out public/<proyek>/words.json
     ```
   - Subtitle otomatis sinkron kata per kata dengan highlight kuning kontras `#FBBF24` dan outline hitam tebal.

---

## 9. Standar Manajemen Direktori & Output (`Hasil/`)

Semua hasil render dilarang menumpuk di folder build sementara. Seluruh output dialirkan ke direktori terpusat:

```
C:\Users\Kamila\Documents\video\Hasil\
├── Video Final\          <-- Khusus video MP4 final ter-render sempurna siap tayang
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

---

## 10. Checklist Brief untuk Eksekusi Opus 5.5

Saat sesi coding bersama Claude Opus 5.5 dibuka, jalankan checklist ini:
- [ ] Beri instruksi ke Opus untuk membaca file `skills/pyxis-beanhead-style/SKILL.md` (v2.3).
- [ ] Tentukan genre cerita: Sains $\rightarrow$ gunakan *Inspect/X-Ray*; Sejarah/Aksi $\rightarrow$ gunakan *Comic Action Zoom*; Alam $\rightarrow$ gunakan *Scenic Atmosphere*.
- [ ] Pastikan karakter menggunakan base siluet kepala Persis (`src/persis/toon.ts`) dengan Z-order lengan `front: false` di samping.
- [ ] Pastikan kaki menapak lantai `SOLE = 975` dengan kurva bipedal anti-skating.
- [ ] Terapkan shader tekstur kanvas/kuas *Living Painting Texture* dan garis tinta plum alami.
- [ ] Rangkai panggung 3D menggunakan sistem Modular Kitbash + Lighting Mood + siluet pendukung di latar belakang.
- [ ] Terapkan trik retensi: *Macro Punch-In*, *The 2-Second Rule*, dan *Seamless Infinite Loop*.
- [ ] Validasi audio dengan ducking -8 dB di bawah vokal, foley langkah/kain, dan master -14 LUFS.
- [ ] Pastikan typecheck `tsc --noEmit` lolos 0 error sebelum render.
