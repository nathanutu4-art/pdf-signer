// Papan tanda tangan: gambar dengan jari memakai react-native-svg
// (tersedia di Expo Go). Stroke dihaluskan dengan kurva quadratic,
// mendukung urungkan, hapus, dan pilihan warna tinta. Hasil disimpan
// sebagai PNG lewat RasterBridge (WebView + canvas).
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Pt = { x: number; y: number };
type Stroke = { pts: Pt[]; color: string };

const COLORS = [
  { name: 'Hitam', value: '#1b1b1b' },
  { name: 'Biru', value: '#1a3fa0' },
  { name: 'Merah', value: '#b3261e' },
];

/** Ubah rangkaian titik menjadi path SVG yang halus (midpoint quadratic). */
function strokeToPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  if (pts.length === 1) {
    const p = pts[0];
    return `M ${f(p.x)} ${f(p.y)} h 0.5`;
  }
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${f(last.x)} ${f(last.y)}`;
  return d;
}

function strokesToSvg(strokes: Stroke[], w: number, h: number): string {
  const paths = strokes
    .map(
      (st) =>
        `<path d="${strokeToPath(st.pts)}" fill="none" stroke="${st.color}" ` +
        `stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" ` +
    `height="${Math.round(h)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">${paths}</svg>`
  );
}

type Props = {
  rasterizeSvg: (
    svg: string,
    width: number,
    height: number,
    scale: number,
  ) => Promise<{ base64: string; width: number; height: number }>;
  onSaved: (pngBase64: string, width: number, height: number) => void;
  onCancel: () => void;
};

export default function SignaturePad({ rasterizeSvg, onSaved, onCancel }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0].value);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const current = useRef<Pt[]>([]);
  const drawing = useRef(false);
  const [, bump] = useState(0);

  const finishStroke = () => {
    drawing.current = false;
    if (current.current.length > 0) {
      const pts = current.current;
      current.current = [];
      setStrokes((prev) => [...prev, { pts, color }]);
    }
  };

  const save = async () => {
    if (strokes.length === 0 || box.w <= 0 || box.h <= 0) return;
    setSaving(true);
    try {
      const svg = strokesToSvg(strokes, box.w, box.h);
      const r = await rasterizeSvg(svg, box.w, box.h, 3);
      onSaved(r.base64, r.width, r.height);
    } catch (e) {
      Alert.alert(
        'Gagal menyimpan',
        e instanceof Error ? e.message : 'Terjadi kesalahan.',
      );
    } finally {
      setSaving(false);
    }
  };

  const live: Stroke[] =
    drawing.current && current.current.length > 0
      ? [...strokes, { pts: current.current, color }]
      : strokes;

  return (
    <View style={s.wrap}>
      <View style={s.colorRow}>
        {COLORS.map((c) => (
          <Pressable
            key={c.value}
            accessibilityLabel={`Tinta ${c.name}`}
            onPress={() => setColor(c.value)}
            style={[
              s.dot,
              { backgroundColor: c.value },
              color === c.value && s.dotActive,
            ]}
          />
        ))}
        <Text style={s.colorLabel}>
          Tinta: {COLORS.find((c) => c.value === color)?.name}
        </Text>
      </View>

      <View
        style={s.pad}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setBox({ w: width, h: height });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          drawing.current = true;
          current.current = [
            { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY },
          ];
          bump((n) => n + 1);
        }}
        onResponderMove={(e) => {
          if (!drawing.current) return;
          current.current.push({
            x: e.nativeEvent.locationX,
            y: e.nativeEvent.locationY,
          });
          bump((n) => n + 1);
        }}
        onResponderRelease={finishStroke}
        onResponderTerminate={finishStroke}
      >
        {box.w > 0 && (
          <Svg width={box.w} height={box.h}>
            {live.map((st, i) => (
              <Path
                key={i}
                d={strokeToPath(st.pts)}
                fill="none"
                stroke={st.color}
                strokeWidth={3.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        )}
        {live.length === 0 && (
          <Text style={s.hint} pointerEvents="none">
            Tanda tangani di sini
          </Text>
        )}
      </View>

      <View style={s.btnRow}>
        <Pressable
          style={[s.btn, strokes.length === 0 && s.btnDisabled]}
          disabled={strokes.length === 0}
          onPress={() => setStrokes((prev) => prev.slice(0, -1))}
        >
          <Text style={s.btnText}>Urungkan</Text>
        </Pressable>
        <Pressable
          style={[s.btn, strokes.length === 0 && s.btnDisabled]}
          disabled={strokes.length === 0}
          onPress={() => setStrokes([])}
        >
          <Text style={s.btnText}>Hapus</Text>
        </Pressable>
        <Pressable style={[s.btn, s.btnGhost]} onPress={onCancel}>
          <Text style={s.btnText}>Batal</Text>
        </Pressable>
        <Pressable
          style={[s.btn, s.btnPrimary, strokes.length === 0 && s.btnDisabled]}
          disabled={strokes.length === 0 || saving}
          onPress={save}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[s.btnText, s.btnTextPrimary]}>Simpan</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dotActive: { borderColor: '#175cd3' },
  colorLabel: { fontSize: 13, color: '#475467' },
  pad: {
    height: 190,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', color: '#98a2b3', fontSize: 14 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#eaecf0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d0d5dd' },
  btnPrimary: { backgroundColor: '#175cd3' },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 14, fontWeight: '600', color: '#344054' },
  btnTextPrimary: { color: '#fff' },
});
