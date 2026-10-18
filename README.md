# PDF Signer

Aplikasi mobile untuk **membaca PDF dan membubuhkan tanda tangan** — dibuat
dengan Expo (SDK 57), TypeScript, dan Expo Router. Cakupan v1: baca PDF +
tanda tangan saja (bukan editor penuh: tanpa anotasi/highlight/teks).

## Fitur v1

- **Pustaka dokumen** — impor PDF dari perangkat (disalin ke penyimpanan
  aplikasi), buka, dan hapus.
- **Pembaca PDF** — render per halaman dengan navigasi sebelum/berikutnya,
  lompat ke halaman, dan zoom.
- **Papan tanda tangan** — gambar dengan jari (stroke halus, urungkan, hapus,
  pilihan warna tinta), tersimpan sebagai PNG untuk dipakai ulang.
- **Penempatan presisi** — pilih halaman, ketuk posisi pada pratinjau, atur
  ukuran, lalu tanda tangan ditempel ke salinan PDF baru ("signed").
  Dokumen asli tidak pernah diubah.
- **Bagikan** — kirim PDF hasil lewat dialog berbagi bawaan perangkat.

## Cara menjalankan (Expo Go)

```bash
npm install
npx expo install --fix   # selaraskan versi paket dengan SDK 57
npx expo start
```

Pindai QR dengan aplikasi **Expo Go** (Android/iOS) di jaringan yang sama.

> Catatan: `package-lock.json` sengaja diabaikan (`.gitignore`) karena
> melebihi batas push path. Jangan commit file tersebut.

## Arsitektur

Seluruh render PDF berjalan **tanpa native module di luar Expo SDK** agar
tetap bisa diuji di Expo Go:

| Kebutuhan              | Solusi |
|------------------------|--------|
| Render PDF             | pdf.js 3.11.174 di dalam WebView (`assets/pdfjs/viewer.html`, dimuat dari CDN cdnjs). Navigasi halaman, lompat halaman, dan zoom ditangani toolbar di halaman HTML. |
| Bundling viewer.html   | Metro dikonfigurasi (`metro.config.js`) mengenali `.html` sebagai asset; `components/PdfViewer.tsx` memuatnya lewat `expo-asset`. |
| Papan tanda tangan     | `react-native-svg` (stroke digambar sebagai path yang dihaluskan). |
| SVG → PNG              | WebView tersembunyi (`components/RasterBridge.tsx`) me-render SVG/canvas lalu mengembalikan PNG base64 — tanpa modul capture native. |
| Pratinjau halaman      | Halaman PDF di-render ke PNG lewat RasterBridge yang sama, ditampilkan sebagai `Image` native agar koordinat ketuk akurat. |
| Stempel ke PDF         | `pdf-lib` (pure JS): PNG ditempel pada koordinat point PDF (dihitung dari posisi ketuk ÷ skala render), lalu disimpan sebagai salinan baru. |
| File & berbagi         | `expo-document-picker`, `expo-file-system`, `expo-sharing`. |

Struktur direktori penyimpanan aplikasi:

- `pdfs/` — PDF yang diimpor
- `signed/` — salinan PDF bertanda tangan
- `signatures/` — PNG tanda tangan (`sig-<timestamp>-<lebar>x<tinggi>.png`)

## Keterbatasan yang diketahui (v1)

1. **Butuh internet saat pertama membuka PDF** — pustaka pdf.js dimuat dari
   CDN (cdnjs). Jika CDN tidak terjangkau, penampil menampilkan pesan ramah
   berbahasa Indonesia. Langkah berikut: bundle pdf.js secara lokal agar
   fully offline.
2. **Satu tanda tangan per sesi** — untuk membubuhkan beberapa tanda tangan,
   ulangi alur pada dokumen (atau pada hasil "signed").
3. **PDF terenkripsi** — dibuka dengan `ignoreEncryption`; PDF yang benar-benar
   membutuhkan kata sandi mungkin gagal dibuka.
4. **Orientasi portrait** — dikunci di `app.json`.
5. **Aset ikon** — `app.json` merujuk `assets/icon.png`,
   `assets/splash.png`, dan `assets/adaptive-icon.png` yang belum disertakan;
   tambahkan sebelum build rilis (peringatan saat `expo start` tidak
   mengganggu pengembangan).

## Build APK (nanti)

Setelah repo GitHub tersedia dan diuji di Expo Go:

```bash
npm install -g eas-cli
eas build --platform android --profile preview   # APK
```

Perlu menambahkan ikon di `assets/` dan mengonfigurasi `eas.json`
terlebih dahulu.

## Struktur proyek

```
app/
  _layout.tsx            Root layout + navigasi Stack
  index.tsx              Pustaka dokumen (impor, buka, hapus, bagikan)
  reader/[id].tsx        Pembaca PDF + tombol menuju tanda tangan
  sign/[id].tsx          Alur tanda tangan (halaman → tanda tangan → posisi → selesai)
  signatures.tsx         Pustaka tanda tangan
components/
  PdfViewer.tsx          WebView + viewer.html
  RasterBridge.tsx       WebView tersembunyi: rasterisasi halaman/SVG ke PNG
  SignaturePad.tsx       Papan gambar tanda tangan (react-native-svg)
lib/
  base64.ts              Konversi base64 <-> Uint8Array (tanpa Buffer)
  pdf.ts                 Helper pdf-lib: info halaman & stempel PNG
  storage.ts             Helper file: direktori, impor, simpan, hapus
assets/pdfjs/viewer.html Penampil PDF berbasis pdf.js (CDN)
```
