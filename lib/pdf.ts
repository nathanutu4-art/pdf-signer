// Helper PDF berbasis pdf-lib (pure JS, kompatibel Expo Go).
import { PDFDocument } from 'pdf-lib';
import { base64ToBytes } from './base64';

export type PdfPageInfo = { width: number; height: number }; // dalam point PDF
export type PdfInfo = { pageCount: number; pages: PdfPageInfo[] };
export type Placement = {
  pageIndex: number; // 0-based
  x: number; // point, dari kiri bawah
  y: number; // point, dari kiri bawah
  width: number; // point
  height: number; // point
};

/** Baca jumlah & ukuran halaman dari PDF (base64). */
export async function getPdfInfo(pdfBase64: string): Promise<PdfInfo> {
  const doc = await PDFDocument.load(base64ToBytes(pdfBase64), {
    ignoreEncryption: true,
  });
  const pages = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height };
  });
  return { pageCount: pages.length, pages };
}

/** Pastikan bytes benar-benar PNG sebelum ditempel (pesan error jelas). */
function assertPng(bytes: Uint8Array): void {
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (!isPng) {
    throw new Error(
      'File tanda tangan rusak atau bukan PNG. Hapus lalu buat ulang tanda tangan.',
    );
  }
}

/**
 * Tempelkan PNG tanda tangan ke beberapa posisi lalu kembalikan
 * bytes PDF baru (dokumen asli tidak diubah).
 */
export async function stampPngOnPdf(
  pdfBytes: Uint8Array,
  pngBytes: Uint8Array,
  placements: Placement[],
): Promise<Uint8Array> {
  assertPng(pngBytes);
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const img = await doc.embedPng(pngBytes);
  for (const pl of placements) {
    const page = doc.getPage(pl.pageIndex);
    page.drawImage(img, {
      x: pl.x,
      y: pl.y,
      width: pl.width,
      height: pl.height,
    });
  }
  return await doc.save();
}
