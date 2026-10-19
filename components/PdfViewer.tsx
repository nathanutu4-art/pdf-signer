// Penampil PDF: memuat assets/pdfjs/viewer.html (dibundle via expo-asset)
// ke dalam WebView, lalu mengirim dokumen (base64). Navigasi halaman,
// lompat halaman, dan zoom ditangani toolbar di dalam HTML.
//
// Mode kunci (prop `page`): halaman dikunci ke satu halaman tanpa toolbar,
// untuk pratinjau posisi tanda tangan. Ukuran render dilaporkan lewat
// `onPageInfo` agar koordinat layar dapat dipetakan ke point PDF.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

export type PdfPageInfo = {
  page: number;
  pages: number;
  pdfWidth: number; // point PDF (skala 1)
  pdfHeight: number; // point PDF (skala 1)
  renderedWidth: number; // px CSS kanvas di WebView
  renderedHeight: number; // px CSS kanvas di WebView
};

type Props = {
  pdfBase64: string;
  /** Kunci ke satu halaman (tanpa toolbar). */
  page?: number;
  /** Default true. false = WebView tidak bisa di-scroll/zoom. */
  interactive?: boolean;
  onPageInfo?: (info: PdfPageInfo) => void;
};

export default function PdfViewer({
  pdfBase64,
  page,
  interactive = true,
  onPageInfo,
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const lockedPage = page && page > 0 ? page : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(require('../assets/pdfjs/viewer.html'));
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error('Asset URI kosong.');
        const text = await FileSystem.readAsStringAsync(uri);
        if (!cancelled) setHtml(text);
      } catch {
        if (!cancelled)
          setLoadError('Gagal memuat penampil PDF. Coba tutup dan buka lagi.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const post = useCallback((msg: unknown) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as {
        type?: string;
        page?: number;
        pages?: number;
        pdfWidth?: number;
        pdfHeight?: number;
        renderedWidth?: number;
        renderedHeight?: number;
      };
      if (m.type === 'ready') {
        readyRef.current = true;
        post({ type: 'init', base64: pdfBase64, lockPage: lockedPage });
      } else if (m.type === 'page') {
        onPageInfo?.({
          page: m.page ?? 1,
          pages: m.pages ?? 1,
          pdfWidth: m.pdfWidth ?? 0,
          pdfHeight: m.pdfHeight ?? 0,
          renderedWidth: m.renderedWidth ?? 0,
          renderedHeight: m.renderedHeight ?? 0,
        });
      }
      // 'error' ditangani di dalam halaman HTML (pesan fallback Indonesia).
    } catch {
      /* abaikan pesan non-JSON */
    }
  };

  // Halaman berubah setelah init (mode kunci).
  useEffect(() => {
    if (readyRef.current && lockedPage > 0) {
      post({ type: 'goto', page: lockedPage });
    }
  }, [lockedPage, post]);

  if (loadError) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{loadError}</Text>
      </View>
    );
  }

  if (!html) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#175cd3" />
        <Text style={s.hint}>Menyiapkan penampil&hellip;</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      scrollEnabled={interactive}
      style={s.web}
    />
  );
}

const s = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#3c4043' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  hint: { marginTop: 12, color: '#667085', fontSize: 14 },
  error: { color: '#b42318', fontSize: 15, textAlign: 'center' },
});
