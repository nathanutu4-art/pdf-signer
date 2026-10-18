// Alur tanda tangan: 1) pilih halaman → 2) pilih/buat tanda tangan →
// 3) ketuk posisi pada pratinjau + atur ukuran → 4) stempel via pdf-lib,
// simpan salinan "signed", dan bagikan.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import RasterBridge, { RasterBridgeHandle } from '../../components/RasterBridge';
import SignaturePad from '../../components/SignaturePad';
import { base64ToBytes, getPdfInfo, stampPngOnPdf, PdfInfo } from '../../lib/pdf';
import {
  PdfEntry,
  SigEntry,
  findPdf,
  listSignatures,
  readAsBase64,
  saveSignature,
  saveSignedPdf,
  writeCacheBase64,
} from '../../lib/storage';

const STEP_LABELS = ['Halaman', 'Tanda tangan', 'Posisi', 'Selesai'];

export default function SignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<PdfEntry | null>(null);
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [pdfB64, setPdfB64] = useState('');
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState('1');
  const [step, setStep] = useState(0);

  const [sigs, setSigs] = useState<SigEntry[]>([]);
  const [sigId, setSigId] = useState<string | null>(null);
  const [showPad, setShowPad] = useState(false);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewRatio, setPreviewRatio] = useState(0); // tinggi / lebar
  const [viewW, setViewW] = useState(0);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [sigW, setSigW] = useState(0);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [saved, setSaved] = useState<PdfEntry | null>(null);

  const bridge = useRef<RasterBridgeHandle>(null);
  const selectedSig = sigs.find((x) => x.id === sigId) ?? null;

  // Muat dokumen + info halaman.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const e = await findPdf(id);
      if (!e) {
        Alert.alert('Gagal', 'Dokumen tidak ditemukan.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      if (!cancelled) setEntry(e);
      try {
        const b64 = await readAsBase64(e.uri);
        const pdfInfo = await getPdfInfo(b64);
        if (cancelled) return;
        setPdfB64(b64);
        setInfo(pdfInfo);
      } catch {
        if (!cancelled) {
          Alert.alert('Gagal', 'Dokumen tidak dapat dibuka.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadSigs = async () => {
    try {
      setSigs(await listSignatures());
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membaca pustaka tanda tangan.');
    }
  };

  // Saat masuk langkah posisi: render halaman menjadi gambar pratinjau.
  useEffect(() => {
    if (step !== 2 || !pdfB64) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setBusyMsg('Me-render halaman…');
      setPreviewUri(null);
      setAnchor(null);
      try {
        const r = await bridge.current!.rasterizePdfPage(pdfB64, page, 1080);
        if (cancelled) return;
        const uri = await writeCacheBase64(`preview-p${page}.png`, r.base64);
        if (cancelled) return;
        setPreviewUri(uri);
        setPreviewRatio(r.height / r.width);
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            'Gagal me-render',
            e instanceof Error ? e.message : 'Periksa koneksi internet.',
            [{ text: 'OK', onPress: () => setStep(1) }],
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setBusyMsg('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, pdfB64, page]);

  // Nilai awal posisi & ukuran saat pratinjau siap.
  useEffect(() => {
    if (step === 2 && viewW > 0 && previewRatio > 0 && !anchor) {
      setAnchor({ x: viewW / 2, y: (viewW * previewRatio) / 2 });
      setSigW(viewW * 0.45);
    }
  }, [step, viewW, previewRatio, anchor]);

  const clampPage = (n: number) => {
    if (!info) return 1;
    return Math.min(Math.max(1, n), info.pageCount);
  };

  const gotoStep1 = () => {
    const p = clampPage(parseInt(pageText, 10) || 1);
    setPage(p);
    setPageText(String(p));
    loadSigs();
    setStep(1);
  };

  const handlePadSaved = async (pngB64: string, w: number, h: number) => {
    try {
      const sig = await saveSignature(pngB64, w, h);
      setShowPad(false);
      await loadSigs();
      setSigId(sig.id);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat menyimpan tanda tangan.');
    }
  };

  const stamp = async () => {
    if (!entry || !info || !selectedSig || !anchor || viewW <= 0) return;
    const pageInfo = info.pages[page - 1];
    const scale = viewW / pageInfo.width; // px tampil per point PDF
    const sigH = sigW * (selectedSig.height / selectedSig.width);
    const wPt = sigW / scale;
    const hPt = sigH / scale;
    let xPt = (anchor.x - sigW / 2) / scale;
    // Sumbu Y PDF dari bawah; sumbu layar dari atas.
    let yPt = pageInfo.height - (anchor.y + sigH / 2) / scale;
    xPt = Math.min(Math.max(0, xPt), pageInfo.width - wPt);
    yPt = Math.min(Math.max(0, yPt), pageInfo.height - hPt);

    setBusy(true);
    setBusyMsg('Menempelkan tanda tangan…');
    try {
      const sigB64 = await readAsBase64(selectedSig.uri);
      const out = await stampPngOnPdf(base64ToBytes(pdfB64), base64ToBytes(sigB64), [
        { pageIndex: page - 1, x: xPt, y: yPt, width: wPt, height: hPt },
      ]);
      const savedEntry = await saveSignedPdf(out, entry.name);
      setSaved(savedEntry);
      setStep(3);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat menempelkan tanda tangan.');
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  };

  const shareSaved = async () => {
    if (!saved) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Tidak tersedia', 'Berbagi tidak tersedia di perangkat ini.');
        return;
      }
      await Sharing.shareAsync(saved.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Bagikan PDF bertanda tangan',
      });
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membagikan dokumen.');
    }
  };

  const sigH = selectedSig && sigW > 0 ? sigW * (selectedSig.height / selectedSig.width) : 0;
  const viewH = viewW > 0 && previewRatio > 0 ? viewW * previewRatio : 0;

  return (
    <View style={s.root}>
      <RasterBridge ref={bridge} />

      <View style={s.stepper}>
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={s.stepItem}>
            <View style={[s.dot, i <= step && s.dotActive]}>
              <Text style={[s.dotText, i <= step && s.dotTextActive]}>{i + 1}</Text>
            </View>
            <Text style={[s.stepLabel, i === step && s.stepLabelActive]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {!info ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#175cd3" />
          <Text style={s.hint}>Memuat dokumen…</Text>
        </View>
      ) : (
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
          {step === 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Pilih halaman</Text>
              <Text style={s.cardDesc}>
                Dokumen “{entry?.name}” memiliki {info.pageCount} halaman. Pilih
                halaman tempat tanda tangan akan ditempel.
              </Text>
              <View style={s.pageRow}>
                <Pressable
                  style={s.pageBtn}
                  onPress={() => {
                    const p = clampPage(page - 1);
                    setPage(p);
                    setPageText(String(p));
                  }}
                >
                  <Text style={s.pageBtnText}>◀</Text>
                </Pressable>
                <TextInput
                  style={s.pageInput}
                  keyboardType="number-pad"
                  value={pageText}
                  onChangeText={setPageText}
                  onBlur={() => {
                    const p = clampPage(parseInt(pageText, 10) || 1);
                    setPage(p);
                    setPageText(String(p));
                  }}
                />
                <Text style={s.pageTotal}>/ {info.pageCount}</Text>
                <Pressable
                  style={s.pageBtn}
                  onPress={() => {
                    const p = clampPage(page + 1);
                    setPage(p);
                    setPageText(String(p));
                  }}
                >
                  <Text style={s.pageBtnText}>▶</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Pilih tanda tangan</Text>
              <Text style={s.cardDesc}>
                Pakai yang tersimpan, atau buat baru di bawah.
              </Text>
              {sigs.length === 0 && !showPad ? (
                <Text style={s.hint}>Belum ada tanda tangan tersimpan.</Text>
              ) : (
                <View style={s.sigGrid}>
                  {sigs.map((sig) => (
                    <Pressable
                      key={sig.id}
                      style={[s.sigTile, sigId === sig.id && s.sigTileActive]}
                      onPress={() => setSigId(sig.id)}
                    >
                      <Image
                        source={{ uri: sig.uri }}
                        style={s.sigImg}
                        resizeMode="contain"
                      />
                    </Pressable>
                  ))}
                </View>
              )}
              <Pressable style={s.secondaryBtn} onPress={() => setShowPad((v) => !v)}>
                <Text style={s.secondaryBtnText}>
                  {showPad ? 'Tutup papan' : '＋ Buat tanda tangan baru'}
                </Text>
              </Pressable>
              {showPad && (
                <View style={s.padWrap}>
                  <SignaturePad
                    rasterizeSvg={(svg, w, h, scale) =>
                      bridge.current!.rasterizeSvg(svg, w, h, scale)
                    }
                    onSaved={handlePadSaved}
                    onCancel={() => setShowPad(false)}
                  />
                </View>
              )}
            </View>
          )}

          {step === 2 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Atur posisi & ukuran</Text>
              <Text style={s.cardDesc}>
                Ketuk pratinjau untuk memindahkan tanda tangan, lalu atur
                ukurannya.
              </Text>
              <View
                style={s.previewBox}
                onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
              >
                {previewUri && viewW > 0 ? (
                  <Pressable
                    onPress={(e) =>
                      setAnchor({
                        x: e.nativeEvent.locationX,
                        y: e.nativeEvent.locationY,
                      })
                    }
                  >
                    <Image
                      source={{ uri: previewUri }}
                      style={{ width: viewW, height: viewH }}
                      resizeMode="contain"
                    />
                    {anchor && selectedSig && sigW > 0 && (
                      <Image
                        source={{ uri: selectedSig.uri }}
                        style={{
                          position: 'absolute',
                          left: anchor.x - sigW / 2,
                          top: anchor.y - sigH / 2,
                          width: sigW,
                          height: sigH,
                        }}
                        resizeMode="contain"
                        pointerEvents="none"
                      />
                    )}
                  </Pressable>
                ) : (
                  <View style={[s.previewLoading, viewH > 0 && { height: viewH }]}>
                    <ActivityIndicator size="large" color="#175cd3" />
                  </View>
                )}
              </View>
              <View style={s.sizeRow}>
                <Text style={s.sizeLabel}>Ukuran</Text>
                <Pressable
                  style={s.sizeBtn}
                  onPress={() => setSigW((w) => Math.max(40, w - 14))}
                >
                  <Text style={s.sizeBtnText}>−</Text>
                </Pressable>
                <Pressable
                  style={s.sizeBtn}
                  onPress={() =>
                    setSigW((w) => Math.min(viewW || 400, w + 14))
                  }
                >
                  <Text style={s.sizeBtnText}>＋</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 3 && saved && (
            <View style={s.card}>
              <Text style={s.doneIcon}>✅</Text>
              <Text style={s.cardTitle}>Berhasil ditandatangani</Text>
              <Text style={s.cardDesc}>
                Salinan baru tersimpan sebagai “{saved.name}”. Dokumen asli tidak
                diubah.
              </Text>
              <Pressable style={s.primaryBtn} onPress={shareSaved}>
                <Text style={s.primaryBtnText}>Bagikan PDF</Text>
              </Pressable>
              <Pressable
                style={s.secondaryBtn}
                onPress={() => router.replace('/')}
              >
                <Text style={s.secondaryBtnText}>Kembali ke Pustaka</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {busy && (
        <View style={s.busyBar}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={s.busyText}>{busyMsg || 'Memproses…'}</Text>
        </View>
      )}

      {info && step < 3 && (
        <View style={s.navBar}>
          {step > 0 ? (
            <Pressable style={s.navBtn} onPress={() => setStep((x) => x - 1)}>
              <Text style={s.navBtnText}>Kembali</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {step === 0 && (
            <Pressable style={[s.navBtn, s.navPrimary]} onPress={gotoStep1}>
              <Text style={[s.navBtnText, s.navPrimaryText]}>Lanjut</Text>
            </Pressable>
          )}
          {step === 1 && (
            <Pressable
              style={[
                s.navBtn,
                s.navPrimary,
                !selectedSig && s.navDisabled,
              ]}
              disabled={!selectedSig}
              onPress={() => setStep(2)}
            >
              <Text style={[s.navBtnText, s.navPrimaryText]}>Lanjut</Text>
            </Pressable>
          )}
          {step === 2 && (
            <Pressable
              style={[
                s.navBtn,
                s.navPrimary,
                (!previewUri || !anchor) && s.navDisabled,
              ]}
              disabled={!previewUri || !anchor || busy}
              onPress={stamp}
            >
              <Text style={[s.navBtnText, s.navPrimaryText]}>
                Tempel & Simpan
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e7ec',
  },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 64 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e4e7ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: '#175cd3' },
  dotText: { fontSize: 13, fontWeight: '700', color: '#667085' },
  dotTextActive: { color: '#fff' },
  stepLabel: { fontSize: 11, color: '#98a2b3' },
  stepLabelActive: { color: '#101828', fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { color: '#667085', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e7ec',
    gap: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#101828' },
  cardDesc: { fontSize: 14, color: '#475467', lineHeight: 20 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageBtn: {
    backgroundColor: '#f2f4f7',
    borderRadius: 10,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnText: { fontSize: 18, color: '#344054' },
  pageInput: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    width: 70,
    height: 46,
    textAlign: 'center',
    fontSize: 17,
    color: '#101828',
  },
  pageTotal: { fontSize: 16, color: '#667085' },
  sigGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sigTile: {
    width: '47%',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e4e7ec',
    padding: 8,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigTileActive: { borderColor: '#175cd3', backgroundColor: '#eff4ff' },
  sigImg: { width: '100%', height: 70 },
  padWrap: { marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#175cd3',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#344054', fontSize: 14, fontWeight: '600' },
  previewBox: { backgroundColor: '#3c4043', borderRadius: 10, overflow: 'hidden' },
  previewLoading: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sizeLabel: { fontSize: 14, fontWeight: '600', color: '#344054', flex: 1 },
  sizeBtn: {
    backgroundColor: '#f2f4f7',
    borderRadius: 10,
    width: 46,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtnText: { fontSize: 20, color: '#101828', fontWeight: '700' },
  doneIcon: { fontSize: 44, textAlign: 'center' },
  navBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
  },
  navBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  navPrimary: { backgroundColor: '#175cd3', borderColor: '#175cd3' },
  navDisabled: { opacity: 0.45 },
  navBtnText: { fontSize: 15, fontWeight: '700', color: '#344054' },
  navPrimaryText: { color: '#fff' },
  busyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#101828',
    paddingVertical: 10,
  },
  busyText: { color: '#fff', fontSize: 13 },
});
