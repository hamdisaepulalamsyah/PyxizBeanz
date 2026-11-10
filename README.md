# 🎬 KontenVideo — PyxisLab 3D Short Video Engine

> **PyxisLab Animated Video Shorts Engine**: Studio produksi video pendek vertikal 9:16 (1080×1920) berbasis **Remotion**, **Three.js (R3F)**, dan standar seni resmi **Pyxis BeanHead Style**.

---

## 📁 Struktur Repositori

```text
KontenVideo/
├── skills/
│   └── pyxis-beanhead-style/      # Standar seni & pedoman produksi resmi Pyxis BeanHead
│       └── SKILL.md
├── src/
│   ├── Root.tsx                   # Registrasi komposisi Remotion
│   ├── index.ts                   # Entry point Remotion bundler
│   ├── persis/                    # Komposisi 1: "Sejarah Persis: Dalilnya Mana?"
│   │   ├── Persis.tsx
│   │   ├── story.ts
│   │   ├── toon.ts
│   │   └── worlds.ts
│   └── cikajang/                   # Komposisi 2: "Sejarah Cikajang, Garut: Dua Angka di Pintu Stasiun"
│       ├── Cikajang.tsx
│       ├── story.ts
│       ├── toon.ts
│       └── worlds.ts
├── public/
│   ├── persis/                    # Aset terisolasi untuk Sejarah Persis
│   │   ├── voice.wav
│   │   ├── words.json
│   │   ├── sentences.json
│   │   └── sfx.wav
│   └── cikajang/                  # Aset terisolasi untuk Sejarah Cikajang
│       ├── voice.wav
│       ├── words.json
│       └── sentences.json
├── sfx/                           # Mesin DSP sintesis audio & mastering kenyaringan (-14 LUFS)
└── scripts/                       # Skrip automasi timing & utilitas produksi
```

---

## 🎨 Standar Seni: `pyxis-beanhead-style`

Seluruh produksi video di repositori ini mengacu pada standar seni resmi di [`skills/pyxis-beanhead-style/SKILL.md`](skills/pyxis-beanhead-style/SKILL.md):

1. **Karakter Bean Head Ikonik:**
   * Kepala bulat telur (*bean head*) besar nan ekspresif (`HEAD_HALF_W = 240`, rasio `0.94`, tinta plum `#241726`).
   * Wajah ramah dengan mata bulat berbinar, bulu mata lentik, rona pipi hangat (*blush*), dan senyum manis.
   * Headwear (Hijab Dinda, Peci Haji Zamzam/Hassan) membungkus kontur kepala secara rapi dan estetis.
   * Lengan kartun *rubber-hose* yang lentur dan halus dengan tangan *mitten* kartun (tanpa sendi pipa robotik).
   * Kaki dan sepatu kartun menapak rapi di lantai peron (`sole = 975`, $y = 0$).
2. **Pijakan Kokoh (*Contact Shadow Blob*):**
   * Setiap karakter dan hewan memiliki bayangan kontak elips lembut di permukaan lantai (`y = floor + 0.015`) agar tidak pernah terlihat mengambang.
3. **Sinematografi Dinamis (*Motion Kinetics*):**
   * *Smootherstep glides* kurva polinomial tingkat 5 (`18–45 frame`).
   * *Creeping push-in holds* (kamera bergerak maju pelan ~0.2%/frame saat adegan diam).
   * *Impact kicks* (getaran hentakan 7-frame pada momen benturan atau punchline).
4. **Pencahayaan & Shader Sinematik:**
   * *Camera-relative frozen sun* (mencegah flickering bayangan).
   * Kontrak `NOINK` pada kartu karakter 2D.
   * *Vignette* lembut `0.22` dan *transition white flash* (6-frame) pada lompatan waktu sejarah.
5. **Standar Audio Mastering Studio:**
   * Vokal narasi sebagai jangkar utama.
   * BGM bed dikunci pada 50% (-6 dB gated RMS) dari vokal narasi.
   * SFX dengan batas *peak limiter* agar tidak menutupi dialog.
   * Output akhir di-mastering ke standar broadcast **-14 LUFS EBU R128**.

---

## 🚀 Perintah Cepat (Quick Start)

### 1. Pratinjau Interaktif (Remotion Studio)
```bash
npm run studio
```

### 2. Validasi Tipe Kode
```bash
npm run typecheck
```

### 3. Render Video Lokal
```bash
# Render Sejarah Cikajang (HD Vertikal 810x1440)
npm run render:cikajang

# Render Sejarah Persis (HD Vertikal 810x1440)
npm run render:persis
```

---

## ⚙️ Kebijakan Hardware Rendah Sumber Daya (RAM 4GB)

Untuk menjaga kestabilan laptop host (RAM 4GB & CPU Dual-Core):
* Seluruh perintah render lokal wajib menggunakan flag:
  ```bash
  --concurrency=1 --gl=angle --scale=0.75
  ```
* Rendering di cloud/Hoplite dinonaktifkan (Opus hanya bertugas coding & typecheck) untuk menghemat kuota dan memprioritaskan render lokal.

---
*Dikelola oleh PyxisLab & Didukung oleh Claude Opus 5.5 + Google Antigravity.*
