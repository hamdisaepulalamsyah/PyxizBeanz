---
name: mobile-view
description: Inspect and audit mobile UI/UX viewport for Saung Hadis using lightweight headless Chromium. Provides visual screenshots, horizontal overflow detection, tap target accessibility checks, and font legibility audit.
---

# Mobile View Skill for Saung Hadis

Skill ini digunakan untuk mengaudit dan melihat rendering tampilan mobile (HP & Tablet) website **Saung Hadis** secara visual dan terukur (DOM geometry & accessibility check).

## Kapabilitas Utama
1. **Lightweight Headless Chromium**: Menggunakan Edge Chromium lokal bawaan Windows dengan flag penghemat memori (low-resource safe untuk CPU dual-core dan RAM 4GB).
2. **Built-in In-Memory HTTP Server**: Menjalankan static server lokal otomatis tanpa dependensi luar, bebas timeout jaringan, dan loading ultra-cepat (<2 detik).
3. **Automated Layout & UX Audits**:
   - **Horizontal Overflow Check**: Mendeteksi elemen bocor/melebar ke kanan (`scrollWidth > clientWidth`).
   - **Tap Target Sizes Check**: Memeriksa tombol, link, tab yang ukurannya di bawah standar jempol (<36px / 44px).
   - **Font Legibility Check**: Mendeteksi font berukuran terlalu kecil (<11px).
   - **Bottom Nav Bar & Drawer Verification**: Memastikan navbar bawah fixed tidak tertutup keyboard atau terpotong.
4. **Visual Screenshots**: Menghasilkan gambar tangkapan layar langsung ke folder brain/artifacts sehingga agen dan Bos dapat melihat wujud aslinya.

---

## Cara Penggunaan via Command Line

Jalankan perintah Node.js dari root folder proyek (`c:\Users\Pyxis\Documents\saung-hadis`):

### 1. Audit Cepat Halaman Beranda (iPhone - 390x844)
```powershell
node tools/mobile_view.js --page home --device iphone --audit
```

### 2. Audit Halaman Pencarian di Layar Android (360x800)
```powershell
node tools/mobile_view.js --page cari --device android --audit
```

### 3. Audit Drawer / Detail Perawi dengan Interaksi Klik
```powershell
node tools/mobile_view.js --page perawi --device iphone --click ".rawi-card" --audit
```

### 4. Periksa Live URL (misal Vercel Production)
```powershell
node tools/mobile_view.js --url "https://www.saunghadis.com/" --device iphone --audit
```

---

## Device Presets
- `iphone`: 390 x 844 px (iPhone 13/14/15 standard)
- `android`: 360 x 800 px (Samsung Galaxy / Android standard budget phone)
- `tablet`: 768 x 1024 px (iPad / Tablet portrait)

---

## Prinsip Desain Mobile Saung Hadis (Anti-AI-Slop)
- **Thumb Zone Friendly**: Navigasi penting berada di 1/3 bagian bawah layar (Bottom Navigation Bar & Drawer / Bottom Sheet).
- **Zero Horizontal Scroll**: `body` dan container tidak boleh memiliki `overflow-x: scroll` liar.
- **Arabic Legibility**: Harakat teks Arab tidak boleh saling tumpang tindih; `line-height` minimal 1.75x–1.85x.
- **Touch Target Minimal**: Semua area klik minimal 44x44px (atau minimal 36x36px dengan padding sentuh).
