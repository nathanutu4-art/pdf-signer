// Pustaka tanda tangan: buat baru (SignaturePad), lihat, dan hapus.
// Tanda tangan disimpan sebagai PNG agar bisa dipakai ulang.
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import RasterBridge, { RasterBridgeHandle } from '../components/RasterBridge';
import SignaturePad from '../components/SignaturePad';
import {
  SigEntry,
  deleteEntry,
  listSignatures,
  saveSignature,
} from '../lib/storage';

export default function SignaturesScreen() {
  const [sigs, setSigs] = useState<SigEntry[]>([]);
  const [showPad, setShowPad] = useState(false);
  const [busy, setBusy] = useState(false);
  const bridge = useRef<RasterBridgeHandle>(null);

  const refresh = useCallback(async () => {
    try {
      setSigs(await listSignatures());
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membaca pustaka tanda tangan.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleSaved = async (pngBase64: string, width: number, height: number) => {
    setBusy(true);
    try {
      await saveSignature(pngBase64, width, height);
      setShowPad(false);
      await refresh();
    } catch {
      Alert.alert('Gagal', 'Tidak dapat menyimpan tanda tangan.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (sig: SigEntry) => {
    Alert.alert('Hapus tanda tangan', 'Hapus tanda tangan ini dari pustaka?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(sig.uri);
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <RasterBridge ref={bridge} />

      <Pressable
        style={s.newBtn}
        onPress={() => setShowPad((v) => !v)}
        disabled={busy}
      >
        <Text style={s.newBtnText}>
          {showPad ? 'Tutup papan tanda tangan' : '＋ Buat tanda tangan baru'}
        </Text>
      </Pressable>

      {showPad && (
        <View style={s.padCard}>
          <SignaturePad
            rasterizeSvg={(svg, w, h, scale) =>
              bridge.current!.rasterizeSvg(svg, w, h, scale)
            }
            onSaved={handleSaved}
            onCancel={() => setShowPad(false)}
          />
        </View>
      )}

      {busy && <ActivityIndicator size="small" color="#175cd3" />}

      <Text style={s.section}>Tersimpan ({sigs.length})</Text>
      {sigs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            Belum ada tanda tangan tersimpan. Buat satu lewat tombol di atas,
            lalu pakai ulang kapan pun saat menandatangani dokumen.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sigs}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.grid}
          renderItem={({ item }) => (
            <View style={s.tile}>
              <Image
                source={{ uri: item.uri }}
                style={s.tileImg}
                resizeMode="contain"
              />
              <Pressable
                style={s.delBtn}
                onPress={() => confirmDelete(item)}
                accessibilityLabel="Hapus tanda tangan"
              >
                <Text style={s.delText}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10 },
  newBtn: {
    backgroundColor: '#175cd3',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  padCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e4e7ec',
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: '#667085',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e4e7ec',
  },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  grid: { gap: 10, paddingBottom: 24 },
  row: { gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    padding: 10,
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImg: { width: '100%', height: 80 },
  delBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee4e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  delText: { color: '#b42318', fontSize: 14, fontWeight: '700' },
});
