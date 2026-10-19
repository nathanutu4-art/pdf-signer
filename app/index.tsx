// Pustaka dokumen: daftar PDF yang diimpor + hasil bertanda tangan.
import { useCallback, useState } from 'react';import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  PdfEntry,
  deleteEntry,
  formatBytes,
  formatDate,
  importPdfFromPicker,
  listPdfs,
  listSignedPdfs,
} from '../lib/storage';

// Nomor versi tampil di kaki layar pustaka — naikkan setiap rilis
// agar jelas build mana yang sedang diuji.
const APP_VERSION = 'v1.3.1-diag';

export default function LibraryScreen() {
  const [docs, setDocs] = useState<PdfEntry[]>([]);
  const [signed, setSigned] = useState<PdfEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([listPdfs(), listSignedPdfs()]);
      setDocs(a);
      setSigned(b);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membaca pustaka dokumen.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        // Jangan copyToCacheDirectory: file cache DocumentPicker "isn't readable"
        // bagi expo-file-system di Expo Go. Baca langsung dari content:// URI.
        copyToCacheDirectory: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      setBusy(true);
      await importPdfFromPicker(asset.uri, asset.name ?? 'dokumen.pdf');
      await refresh();
    } catch (e) {
      Alert.alert(
        'Gagal',
        'Tidak dapat mengimpor PDF: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (entry: PdfEntry) => {
    Alert.alert('Hapus dokumen', `Hapus "${entry.name}" dari pustaka?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(entry.uri);
          refresh();
        },
      },
    ]);
  };

  const sharePdf = async (entry: PdfEntry) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Tidak tersedia', 'Berbagi tidak tersedia di perangkat ini.');
        return;
      }
      await Sharing.shareAsync(entry.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Bagikan PDF',
      });
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membagikan dokumen.');
    }
  };

  const renderDocRow = (entry: PdfEntry, isSigned: boolean) => (
    <View key={entry.id} style={s.card}>
      <Pressable
        style={s.cardMain}
        onPress={() =>
          router.push({ pathname: '/reader/[id]', params: { id: entry.id } })
        }
      >
        <Text style={s.fileIcon}>{isSigned ? '✅' : '📄'}</Text>
        <View style={s.cardText}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {entry.name}
          </Text>
          <Text style={s.cardSub}>
            {formatBytes(entry.size)}
            {entry.modified ? ` • ${formatDate(entry.modified)}` : ''}
          </Text>
        </View>
      </Pressable>
      <View style={s.cardActions}>
        {!isSigned && (
          <Pressable
            style={[s.chip, s.chipPrimary]}
            onPress={() =>
              router.push({ pathname: '/sign/[id]', params: { id: entry.id } })
            }
          >
            <Text style={[s.chipText, s.chipTextPrimary]}>Tanda tangani</Text>
          </Pressable>
        )}
        {isSigned && (
          <Pressable style={s.chip} onPress={() => sharePdf(entry)}>
            <Text style={s.chipText}>Bagikan</Text>
          </Pressable>
        )}
        <Pressable style={s.chip} onPress={() => confirmDelete(entry)}>
          <Text style={[s.chipText, s.chipDanger]}>Hapus</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Pressable style={s.importBtn} onPress={pickPdf} disabled={busy}>
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={s.importBtnText}>＋ Impor PDF</Text>
        )}
      </Pressable>

      <Pressable
        style={s.sigLibBtn}
        onPress={() => router.push('/signatures')}
      >
        <Text style={s.sigLibText}>✒️  Pustaka Tanda Tangan</Text>
        <Text style={s.sigLibArrow}>›</Text>
      </Pressable>

      <Text style={s.section}>Dokumen</Text>
      {docs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>
            Belum ada dokumen. Ketuk “Impor PDF” untuk mulai membaca dan
            menandatangani.
          </Text>
        </View>
      ) : (
        docs.map((d) => renderDocRow(d, false))
      )}

      {signed.length > 0 && (
        <>
          <Text style={s.section}>Hasil bertanda tangan</Text>
          {signed.map((d) => renderDocRow(d, true))}
        </>
      )}

      <Text style={s.version}>PDF Signer {APP_VERSION}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  importBtn: {
    backgroundColor: '#175cd3',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sigLibBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e4e7ec',
  },
  sigLibText: { fontSize: 15, fontWeight: '600', color: '#101828' },
  sigLibArrow: { fontSize: 20, color: '#98a2b3' },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: '#667085',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e4e7ec',
  },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    overflow: 'hidden',
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  fileIcon: { fontSize: 28 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#101828' },
  cardSub: { fontSize: 12, color: '#667085', marginTop: 3 },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#f2f4f7',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f2f4f7',
  },
  chipPrimary: { backgroundColor: '#175cd3' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#344054' },
  chipTextPrimary: { color: '#fff' },
  chipDanger: { color: '#b42318' },
  version: {
    textAlign: 'center',
    color: '#98a2b3',
    fontSize: 12,
    marginTop: 10,
  },
});
