// Penampil PDF: memuat assets/pdfjs/viewer.html (dibundle via expo-asset)
// ke dalam WebView, lalu mengirim dokumen (base64). Navigasi halaman,
// lompat halaman, dan zoom ditangani toolbar di dalam HTML.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

type Props = {
  pdfBase64: string;
};

export default function PdfViewer({ pdfBase64 }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const webRef = useRef<WebView>(null);

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
      const m = JSON.parse(e.nativeEvent.data) as { type?: string };
      if (m.type === 'ready') {
        post({ type: 'init', base64: pdfBase64 });
      }
      // 'page' dan 'error' ditangani di dalam halaman HTML.
    } catch {
      /* abaikan pesan non-JSON */
    }
  };

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
