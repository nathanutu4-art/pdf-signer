// Konversi base64 <-> Uint8Array tanpa Buffer/atob,
// agar aman di React Native (Hermes) maupun WebView.

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function charIndex(ch: string): number {
  if (ch === '=') return 0;
  const idx = B64_CHARS.indexOf(ch);
  if (idx < 0) throw new Error('Karakter base64 tidak valid.');
  return idx;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length % 4 !== 0) throw new Error('Panjang base64 tidak valid.');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = charIndex(clean[i]);
    const b = charIndex(clean[i + 1]);
    const c = charIndex(clean[i + 2]);
    const d = charIndex(clean[i + 3]);
    out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s +=
      B64_CHARS[a >> 2] +
      B64_CHARS[((a & 3) << 4) | (b >> 4)] +
      B64_CHARS[((b & 15) << 2) | (c >> 6)] +
      B64_CHARS[c & 63];
  }
  const rem = bytes.length % 3;
  if (rem === 1) return s.slice(0, -2) + '==';
  if (rem === 2) return s.slice(0, -1) + '=';
  return s;
}
