// Layar pembaca PDF: me-render dokumen lewat PdfViewer (WebView + pdf.js),
// dengan tombol cepat menuju alur tanda tangan.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import PdfViewer from '../../components/PdfViewer';
import { findPdf, readAsBase64 } from '../../lib/storage';

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entry = await findPdf(id);
      if (!entry) {
        if (!cancelled) setError('Dokumen tidak ditemukan.');
        return;
      }
      if (!cancelled) setName(entry.name);
      try {
        const b64 = await readAsBase64(entry.uri);
        if (!cancelled) setPdfBase64(b64);
      } catch {
        if (!cancelled) setError('Gagal membaca dokumen.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (name) {
      navigation.setOptions({
        title: name.length > 28 ? `${name.slice(0, 28)}…` : name,
      });
    }
  }, [name, navigation]);

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Kembali</Text>
        </Pressable>
      </View>
    );
  }

  if (!pdfBase64) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#175cd3" />
        <Text style={s.hint}>Memuat dokumen…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <PdfViewer pdfBase64={pdfBase64} zoom={zoom} />
      <View style={s.zoomBar}>
        <Pressable
          style={s.zoomBtn}
          onPress={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
        >
          <Text style={s.zoomBtnText}>−</Text>
        </Pressable>
        <Pressable style={s.zoomBtn} onPress={() => setZoom(1)}>
          <Text style={s.zoomBtnText}>{Math.round(zoom * 100)}%</Text>
        </Pressable>
        <Pressable
          style={s.zoomBtn}
          onPress={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
        >
          <Text style={s.zoomBtnText}>+</Text>
        </Pressable>
      </View>
      <Pressable
        style={s.signBar}
        onPress={() => router.push({ pathname: '/sign/[id]', params: { id } })}
      >
        <Text style={s.signBarText}>✍️  Tanda tangani dokumen ini</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  hint: { color: '#667085', fontSize: 14 },
  error: { color: '#b42318', fontSize: 15, textAlign: 'center' },
  backBtn: {
    backgroundColor: '#175cd3',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  signBar: {
    backgroundColor: '#175cd3',
    paddingVertical: 15,
    alignItems: 'center',
  },
  signBarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  zoomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
  },
  zoomBtn: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  zoomBtnText: { color: '#175cd3', fontWeight: '700', fontSize: 15 },
});
