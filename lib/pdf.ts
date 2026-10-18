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

/**
 * Tempelkan PNG tanda tangan ke beberapa posisi lalu kembalikan
 * bytes PDF baru (dokumen asli tidak diubah).
 */
export async function stampPngOnPdf(
  pdfBytes: Uint8Array,
  pngBytes: Uint8Array,
  placements: Placement[],
): Promise<Uint8Array> {
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
