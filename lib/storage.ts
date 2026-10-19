// Penyimpanan file lokal: dokumen PDF, hasil bertanda tangan, dan
// pustaka tanda tangan (PNG). Semua di bawah documentDirectory aplikasi.
import * as FileSystem from 'expo-file-system/legacy';
import { File as NewApiFile } from 'expo-file-system';
import { bytesToBase64 } from './base64';

export type PdfEntry = {
  id: string; // nama file (unik per direktori)
  name: string;
  uri: string;
  size: number;
  modified: number;
};

export type SigEntry = {
  id: string;
  uri: string;
  width: number; // px PNG
  height: number; // px PNG
};

function root(): string {
  const d = FileSystem.documentDirectory;
  if (!d) throw new Error('Direktori dokumen tidak tersedia.');
  return d;
}

const pdfsDir = () => `${root()}pdfs/`;
const signedDir = () => `${root()}signed/`;
const sigDir = () => `${root()}signatures/`;

export async function ensureDirs(): Promise<void> {
  for (const d of [pdfsDir(), signedDir(), sigDir()]) {
    const info = await FileSystem.getInfoAsync(d);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(d, { intermediates: true });
    }
  }
}

async function listDir(dir: string): Promise<PdfEntry[]> {
  await ensureDirs();
  const names = await FileSystem.readDirectoryAsync(dir);
  const out: PdfEntry[] = [];
  for (const n of names) {
    const uri = dir + n;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      out.push({
        id: n,
        name: n,
        uri,
        size: info.size ?? 0,
        modified: info.modificationTime ?? 0,
      });
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export const listPdfs = (): Promise<PdfEntry[]> => listDir(pdfsDir());
export const listSignedPdfs = (): Promise<PdfEntry[]> => listDir(signedDir());

/** Cari dokumen (asli maupun hasil) berdasarkan nama file. */
export async function findPdf(id: string): Promise<PdfEntry | null> {
  await ensureDirs();
  for (const dir of [pdfsDir(), signedDir()]) {
    const uri = dir + id;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory) {
      return {
        id,
        name: id,
        uri,
        size: info.size ?? 0,
        modified: info.modificationTime ?? 0,
      };
    }
  }
  return null;
}

function uniqueName(safe: string, existing: Set<string>): string {
  if (!existing.has(safe)) return safe;
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let i = 1;
  let cand = '';
  do {
    cand = `${base} (${i})${ext}`;
    i += 1;
  } while (existing.has(cand));
  return cand;
}

/** Salin hasil document-picker ke direktori aplikasi. */
export async function importPdfFromPicker(
  pickUri: string,
  originalName: string,
): Promise<PdfEntry> {
  await ensureDirs();
  const existing = new Set(await FileSystem.readDirectoryAsync(pdfsDir()));
  const sanitized = originalName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'dokumen.pdf';
  const withExt = sanitized.toLowerCase().endsWith('.pdf')
    ? sanitized
    : `${sanitized}.pdf`;
  const name = uniqueName(withExt, existing);
  const to = pdfsDir() + name;
  if (pickUri.startsWith('content://')) {
    // Expo Go: API legacy tidak mengenali SAF URI media.documents
    // (isSAFUri-nya hanya cocok com.android.externalstorage) — baca via
    // API FileSystem baru yang memakai DocumentsContract.isDocumentUri.
    const src = new NewApiFile(pickUri);
    const bytes = new Uint8Array(await src.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error('File PDF tidak terbaca (kosong).');
    }
    await FileSystem.writeAsStringAsync(to, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else {
    // APK rilis: copyAsync native (terbukti berhasil).
    await FileSystem.copyAsync({ from: pickUri, to });
  }
  const info = await FileSystem.getInfoAsync(to);
  if (!info.exists || (info.size ?? 0) === 0) {
    throw new Error('Hasil salinan PDF kosong atau tidak terbentuk.');
  }
  return {
    id: name,
    name,
    uri: to,
    size: info.size ?? 0,
    modified: info.modificationTime ?? 0,
  };
}

/** Simpan PNG tanda tangan; dimensi dikodekan di nama file. */
export async function saveSignature(
  pngBase64: string,
  width: number,
  height: number,
): Promise<SigEntry> {
  await ensureDirs();
  const id = `sig-${Date.now()}-${Math.round(width)}x${Math.round(height)}.png`;
  const uri = sigDir() + id;
  await FileSystem.writeAsStringAsync(uri, pngBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { id, uri, width: Math.round(width), height: Math.round(height) };
}

export async function listSignatures(): Promise<SigEntry[]> {
  await ensureDirs();
  const names = await FileSystem.readDirectoryAsync(sigDir());
  const out: SigEntry[] = [];
  for (const n of names) {
    if (!n.endsWith('.png')) continue;
    const m = n.match(/-(\d+)x(\d+)\.png$/);
    out.push({
      id: n,
      uri: sigDir() + n,
      width: m ? parseInt(m[1], 10) : 300,
      height: m ? parseInt(m[2], 10) : 150,
    });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

/** Simpan PDF hasil stempel sebagai salinan baru (asli tidak diubah). */
export async function saveSignedPdf(
  bytes: Uint8Array,
  originalName: string,
): Promise<PdfEntry> {
  await ensureDirs();
  const base = originalName.replace(/\.pdf$/i, '') || 'dokumen';
  const name = `${base}-signed-${Date.now()}.pdf`;
  const uri = signedDir() + name;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { id: name, name, uri, size: bytes.length, modified: Date.now() };
}

export const deleteEntry = (uri: string): Promise<void> =>
  FileSystem.deleteAsync(uri, { idempotent: true });

export const readAsBase64 = (uri: string): Promise<string> =>
  FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

/** Tulis base64 ke cache (untuk pratinjau halaman) dan kembalikan uri file. */
export async function writeCacheBase64(
  fileName: string,
  b64: string,
): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? root();
  const uri = dir + fileName;
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/** Unduh PDF ke folder pilihan pengguna (mis. Download) via SAF. */
export async function downloadPdfToDevice(entry: PdfEntry): Promise<void> {
  const perms =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perms.granted) {
    throw new Error('Izin akses folder tidak diberikan.');
  }
  const b64 = await FileSystem.readAsStringAsync(entry.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!b64) throw new Error('File tidak terbaca.');
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    perms.directoryUri,
    entry.name,
    'application/pdf',
  );
  await FileSystem.writeAsStringAsync(destUri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Penanda onboarding sudah dilihat (file kosong sebagai flag). */
const ONBOARDING_FLAG = 'onboarding_seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  await ensureDirs();
  const info = await FileSystem.getInfoAsync(root() + ONBOARDING_FLAG);
  return info.exists;
}

export async function setOnboardingSeen(): Promise<void> {
  await ensureDirs();
  await FileSystem.writeAsStringAsync(root() + ONBOARDING_FLAG, '1');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
