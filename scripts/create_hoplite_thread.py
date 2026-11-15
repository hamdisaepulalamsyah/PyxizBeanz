import urllib.request
import json
import uuid

url = "https://api.hoplite.sh/mcp"
token = "hop_svc_b9KMheDsj6qk8TjoLQZ-E0tjLz3ZUi4i4aNCKKHQhRjyc344SoQO2Ezz9UnYINcQ"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

def call_tool(name, arguments={}):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": arguments
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

prompt = """Hai Opus 5.5, hasil iterasi sebelumnya sudah luar biasa! Sekarang Bos memberikan 6 masukan evaluasi kritis dan penting untuk menyempurnakan video explainer "Hukum Hotelling: Kenapa Indomaret & Alfamart Selalu Nempel":

BACA & TERAPKAN PEMBARUAN MASTER STANDAR DI:
`skills/pyxis-beanhead-style/SKILL.md` (sudah di-update dengan aturan restyle nyata, unified extras, DoF, dan clean subtitles).

6 POIN EVALUASI WAJIB YANG HARUS DIPERBAIKI:

1. ORANG-ORANG / FIGURAN PANTAI DISAMAKAN STYLE-NYA (UNIFIED BEAN-HEAD):
   - Jangan gunakan kapsul atau silinder 3D polos untuk turis di pantai!
   - Samakan semua orang/turis pantai menggunakan format karakter kartun Bean-Head Persis (wajah ekspresif, topi pantai, kacamata, pakaian santai warna-warni, pose berjemur/duduk/berdiri yang natural). Dunia kartun harus memiliki ciri khas seragam yang utuh.

2. SUBTITLE VOICE TRANSKRIP DIRAPIKAN (ANTI-KEBESARAN & LEBIH ESTETIK):
   - Di `HotellingLaw.tsx`: Ukuran subtitle saat ini terlalu besar dan menutupi visual penting.
   - Kecilkan font size menjadi 50-54px (sebelumnya 76px).
   - Rampingkan stroke hitam menjadi 6-7px (sebelumnya 14px kaku).
   - Pastikan posisi `bottom: 290px` agar rapi dan aman di atas UI media sosial tanpa menabrak tubuh karakter.

3. POSE & PERSPEKTIF MENDORONG GEROBAK ALAMI (TIDAK MELIHAT KAMERA TERUS & BERISI):
   - Pedagang es krim biru saat mendorong gerobak TIDAK boleh terus menatap lurus ke kamera penonton sambil senyum!
   - Buat pose mendorong yang natural: badan condong ke depan (3/4 serong), kedua tangan memegang stang gerobak di depannya, pandangan mata fokus ke arah jalan dorongan gerobak.
   - PANDANGAN ATAS (TOP-DOWN DRONE VIEW): Saat dilihat dari atas, karakter terlihat sangat tipis seperti kertas. Beri kompensasi kemiringan billboard dinamis (tilt/pitch facing camera) atau volume ketebalan agar dari atas tetap terlihat padat dan berisi.

4. RESTYLE FASAD TOKO SESUAI ASLINYA DI DUNIA NYATA (INDOMARET & ALFAMART):
   - Indomaret: Lisplang tiga warna khas (Biru tua, Kuning, Merah), logo persegi Indomaret berlatar putih dengan font yang sesuai, plang neon box atas yang menyala, pintu kaca geser otomatis dengan stiker operasional.
   - Alfamart: Lisplang merah tebal dengan aksen kuning, logo Alfamart di atas panel merah menyala yang khas.
   - Tambahkan tiang pylon sign / plang tiang tinggi khas minimarket di area depan jalan.
   - Etalase kaca tetap tembus pandang memperlihatkan pencahayaan interior hangat, rak snack, dan kasir di dalam.

5. PERBAIKI TEKS POSTER KACA YANG TERPOTONG:
   - Sebelumnya teks di poster etalase kaca terpotong menjadi "ROM" dan "ROM MINGGU INI".
   - Perbaiki canvas text drawing di `worlds.ts` agar teks seperti "PROMO MINGGU INI", "PROMO HEMAT", dan "2+1 MINUMAN" tertulis lengkap, proporsional, dan estetik.

6. SINKRONISASI ARAH MUKA, TUBUH, DAN KAKI SAAT BERGERAK (ANTI-TERBALIK):
   - Sinkronkan arah pandang kepala (yaw), hadap badan, dan animasi kaki (walk cycle) langsung ke vektor arah gerak (`walkDir`).
   - Karakter yang bergerak maju/mundur/geser harus otomatis menghadap ke arah jalannya secara anatomis natural, tidak boleh kakinya ke kiri tapi mukanya menatap lurus ke penonton atau terbalik.

7. EXTRA ENVIRONMENT & DEPTH OF FIELD (ATMOSFER LEBIH HIDUP):
   - Tambahkan efek Depth of Field (DoF) / focal blur halus pada background atau foreground yang jauh agar fokus mata penonton tertuju tajam ke karakter dan aksi inti.
   - Buat suasana malam lebih bertekstur: pantulan basah aspal jalan yang memantulkan neon toko, gerimis/mist tipis, lampu jalan kuning hangat dengan berkas cahaya lembut.

Pastikan semua file (`worlds.ts`, `toon.ts`, `story.ts`, `HotellingLaw.tsx`) terintegrasi sempurna, durasi pas 1800 frame (60 detik @ 30 fps), dan lolos `npx tsc --noEmit`!"""

res = call_tool("hoplite_create_thread", {
    "projectId": "proj_189e20edc21749ddaf198d8cd0c3cf35",
    "prompt": prompt,
    "model": "claude-opus-5-5",
    "title": "Upgrade v2.4 Hotelling Law: Real-world Store, Unified Extras, DoF & Natural Poses",
    "clientOperationId": str(uuid.uuid4())
})

print("Create thread result:", json.dumps(res, indent=2))
