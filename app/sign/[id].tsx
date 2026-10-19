// Alur tanda tangan: 1) pilih halaman → 2) pilih/buat tanda tangan →
// 3) atur posisi & ukuran pada pratinjau halaman PDF → 4) stempel via
// pdf-lib, simpan salinan "signed", dan bagikan.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import RasterBridge, { RasterBridgeHandle } from '../../components/RasterBridge';
import SignaturePad from '../../components/SignaturePad';
import PdfViewer, { PdfPageInfo } from '../../components/PdfViewer';
import { getPdfInfo, stampPngOnPdf, PdfInfo } from '../../lib/pdf';
import { base64ToBytes } from '../../lib/base64';
import {
  PdfEntry,
  SigEntry,
  deleteEntry,
  downloadPdfToDevice,
  findPdf,
  listSignatures,
  readAsBase64,
  saveSignature,
  saveSignedPdf,
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

  const [renderInfo, setRenderInfo] = useState<PdfPageInfo | null>(null);
  const [viewW, setViewW] = useState(0);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [sigW, setSigW] = useState(0);

  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [saved, setSaved] = useState<PdfEntry | null>(null);

  const bridge = useRef<RasterBridgeHandle>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const selectedSig = sigs.find((x) => x.id === sigId) ?? null;

  const pageInfo = info?.pages[page - 1];
  const sigH =
    selectedSig && sigW > 0 ? sigW * (selectedSig.height / selectedSig.width) : 0;
  const viewH =
    viewW > 0 && pageInfo ? (viewW * pageInfo.height) / pageInfo.width : 0;

  // Ukuran pratinjau halaman di langkah 1 (tanpa onLayout: lebar layar
  // dikurangi padding konten 16x2 + padding kartu 16x2).
  const { width: winW } = useWindowDimensions();
  const pvW = winW - 64;
  const pvH = pageInfo && pvW > 0 ? (pvW * pageInfo.height) / pageInfo.width : 220;

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

  // Reset status pratinjau setiap masuk langkah posisi / ganti halaman.
  useEffect(() => {
    if (step === 2) {
      anchorRef.current = null;
      setAnchor(null);
      setRenderInfo(null);
      setSigW(0);
    }
  }, [step, page]);

  // Nilai awal posisi & ukuran setelah ukuran pratinjau diketahui.
  useEffect(() => {
    if (step === 2 && viewW > 0 && viewH > 0 && sigW === 0) {
      const w = viewW * 0.45;
      const h0 = selectedSig ? w * (selectedSig.height / selectedSig.width) : 0;
      const hw = w / 2;
      const hh = h0 / 2;
      const cx = Math.min(Math.max(hw, viewW / 2), Math.max(hw, viewW - hw));
      const cy = Math.min(Math.max(hh, viewH / 2), Math.max(hh, viewH - hh));
      anchorRef.current = { x: cx, y: cy };
      setSigW(w);
      setAnchor(anchorRef.current);
    }
  }, [step, viewW, viewH, sigW, selectedSig]);

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

  const confirmDeleteSig = (sig: SigEntry) => {
    Alert.alert('Hapus tanda tangan', 'Hapus tanda tangan ini dari pustaka?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(sig.uri);
            if (sigId === sig.id) setSigId(null);
            await loadSigs();
          } catch {
            Alert.alert('Gagal', 'Tidak dapat menghapus tanda tangan.');
          }
        },
      },
    ]);
  };

  /** Pindahkan jangkar dengan clamp di dalam pratinjau. */
  const setAnchorClamped = (x: number, y: number) => {
    const hw = sigW / 2;
    const hh = sigH / 2;
    // Gunakan ukuran render aktual bila tersedia agar pas dengan PDF.
    const rw = renderInfo?.renderedWidth || viewW;
    const rh = renderInfo?.renderedHeight || viewH;
    const cx = Math.min(Math.max(hw, x), Math.max(hw, rw - hw));
    const cy = Math.min(Math.max(hh, y), Math.max(hh, rh - hh));
    anchorRef.current = { x: cx, y: cy };
    setAnchor(anchorRef.current);
  };

  // Ketuk = taruh di titik ketuk; geser = pindahkan mengikuti jari.
  const drag = useRef({ bx: 0, by: 0, moved: false });
  const stamp = async () => {
    if (!entry || !info || !pageInfo || !selectedSig || !anchor || !renderInfo)
      return;
    // px tampil per point PDF, dari ukuran render aktual viewer.
    const scale =
      renderInfo.renderedWidth > 0
        ? renderInfo.renderedWidth / pageInfo.width
        : viewW / pageInfo.width;
    const wPt = sigW / scale;
    const hPt = sigH / scale;
    let xPt = (anchor.x - sigW / 2) / scale;
    // Sumbu Y PDF dari bawah; sumbu layar dari atas.
    let yPt = pageInfo.height - (anchor.y + sigH / 2) / scale;
    xPt = Math.min(Math.max(0, xPt), pageInfo.width - wPt);
    yPt = Math.min(Math.max(0, yPt), pageInfo.height - hPt);

    setBusy(true);
    setBusyMsg('Menempelkan tanda tangan…');
    let tahap = 'awal';
    try {
      tahap = 'baca-tanda-tangan';
      const sigB64 = await readAsBase64(selectedSig.uri);
      tahap = 'konversi-base64';
      const pdfBytes = base64ToBytes(pdfB64);
      const sigBytes = base64ToBytes(sigB64);
      tahap = 'stempel-pdf-lib';
      const out = await stampPngOnPdf(pdfBytes, sigBytes, [
        { pageIndex: page - 1, x: xPt, y: yPt, width: wPt, height: hPt },
      ]);
      tahap = 'simpan-pdf';
      const savedEntry = await saveSignedPdf(out, entry.name);
      setSaved(savedEntry);
      setStep(3);
    } catch (e) {
      Alert.alert(
        'Gagal',
        'Tidak dapat menempelkan tanda tangan' +
          (tahap !== 'awal' ? ` (tahap ${tahap})` : '') +
          ': ' +
          (e instanceof Error ? e.message : String(e)),
      );
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

  const downloadSaved = async () => {
    if (!saved) return;
    try {
      await downloadPdfToDevice(saved);
      Alert.alert('Berhasil', `Tersimpan sebagai “${saved.name}”.`);
    } catch (e) {
      Alert.alert(
        'Gagal',
        'Tidak dapat menyimpan: ' + (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  return (
    <View style={s.root}>
      {/* WebView rasterisasi disembunyikan dalam wadah height:0 agar tidak
          mengganggu layout (pernah menyebabkan area kosong). */}
      <View style={{ height: 0, overflow: 'hidden' }}>
        <RasterBridge ref={bridge} />
      </View>

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
        // Scroll layar selalu aktif; gangguan coretan oleh scroll sudah
        // dicegah di dalam SignaturePad (onResponderTerminationRequest).
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
          {step === 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Pilih halaman</Text>
              <View style={[s.pagePreview, { height: pvH }]}>
                {pdfB64 ? (
                  <PdfViewer
                    pdfBase64={pdfB64}
                    page={page}
                    interactive={false}
                  />
                ) : (
                  <View style={s.previewLoading}>
                    <ActivityIndicator size="large" color="#175cd3" />
                  </View>
                )}
              </View>
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
                    <View key={sig.id} style={s.sigTileWrap}>
                      <Pressable
                        style={[s.sigTile, sigId === sig.id && s.sigTileActive]}
                        onPress={() => setSigId(sig.id)}
                      >
                        <Image
                          source={{ uri: sig.uri }}
                          style={s.sigImg}
                          resizeMode="contain"
                        />
                      </Pressable>
                      <Pressable
                        style={s.sigDel}
                        onPress={() => confirmDeleteSig(sig)}
                        accessibilityLabel="Hapus tanda tangan"
                      >
                        <Text style={s.sigDelText}>✕</Text>
                      </Pressable>
                    </View>
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
                Geser tanda tangan untuk memindahkan, atau ketuk pratinjau
                untuk menaruhnya di titik lain. Lalu atur ukurannya.
              </Text>
              <View
                style={[
                  s.previewBox,
                  // Tinggi mengikuti hasil render aktual agar overlay pas.
                  { height: renderInfo?.renderedHeight || viewH },
                ]}
                onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
              >
                {viewW > 0 && viewH > 0 ? (
                  <View style={{ flex: 1 }}>
                    <PdfViewer
                      pdfBase64={pdfB64}
                      page={page}
                      interactive={false}
                      onPageInfo={setRenderInfo}
                    />
                    {!renderInfo && (
                      <View style={[StyleSheet.absoluteFill, s.previewLoading]}>
                        <ActivityIndicator size="large" color="#175cd3" />
                      </View>
                    )}
                    {renderInfo && (
                      <View
                        style={StyleSheet.absoluteFill}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                        onResponderGrant={(e) => {
                          const { locationX, locationY } = e.nativeEvent;
                          drag.current = {
                            bx: locationX,
                            by: locationY,
                            moved: false,
                          };
                        }}
                        onResponderMove={(e) => {
                          const { locationX, locationY } = e.nativeEvent;
                          const dx = locationX - drag.current.bx;
                          const dy = locationY - drag.current.by;
                          if (Math.abs(dx) + Math.abs(dy) > 4) {
                            drag.current.moved = true;
                          }
                          // Ikuti posisi jari 1:1 saat digeser.
                          setAnchorClamped(locationX, locationY);
                        }}
                        onResponderRelease={(e) => {
                          if (!drag.current.moved) {
                            const { locationX, locationY } = e.nativeEvent;
                            setAnchorClamped(locationX, locationY);
                          }
                        }}
                        onResponderTerminationRequest={() => false}
                      >
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
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={s.previewLoading}>
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
              <Pressable style={s.primaryBtn} onPress={downloadSaved}>
                <Text style={s.primaryBtnText}>⬇ Unduh ke Perangkat</Text>
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
                (!renderInfo || !anchor || busy) && s.navDisabled,
              ]}
              disabled={!renderInfo || !anchor || busy}
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
  sigTileWrap: { width: '47%', position: 'relative' },
  sigTile: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e4e7ec',
    padding: 8,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigDel: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fee4e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigDelText: { color: '#b42318', fontSize: 13, fontWeight: '700' },
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
  pagePreview: {
    backgroundColor: '#3c4043',
    borderRadius: 10,
    overflow: 'hidden',
  },
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
