// Layar pembuka: menjelaskan cara memakai aplikasi dalam 3 langkah
// berilustrasi. Tampil sekali saat pertama dibuka.
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ONBOARD_1 } from '../assets/onboard1';
import { ONBOARD_2 } from '../assets/onboard2';
import { ONBOARD_3 } from '../assets/onboard3';

const SLIDES = [
  {
    img: ONBOARD_1,
    title: 'Impor Dokumen',
    desc: 'Pilih file PDF dari perangkat Anda untuk mulai.',
  },
  {
    img: ONBOARD_2,
    title: 'Buat Tanda Tangan',
    desc: 'Gambar tanda tangan langsung di layar dengan jari.',
  },
  {
    img: ONBOARD_3,
    title: 'Tempel & Simpan',
    desc: 'Geser tanda tangan ke posisi yang pas, atur ukuran, lalu simpan. Hasil bisa dibagikan atau diunduh.',
  },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const last = idx === SLIDES.length - 1;
  const s = SLIDES[idx];

  return (
    <View style={st.root}>
      <View style={st.card}>
        <Image source={{ uri: s.img }} style={st.img} resizeMode="contain" />
        <Text style={st.title}>{s.title}</Text>
        <Text style={st.desc}>{s.desc}</Text>
        <View style={st.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[st.dot, i === idx ? st.dotActive : null]}
            />
          ))}
        </View>
      </View>
      <View style={st.actions}>
        {!last ? (
          <>
            <Pressable onPress={onDone} style={st.skipBtn}>
              <Text style={st.skipText}>Lewati</Text>
            </Pressable>
            <Pressable
              onPress={() => setIdx(idx + 1)}
              style={st.nextBtn}
            >
              <Text style={st.nextText}>Lanjut</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={onDone} style={st.nextBtn}>
            <Text style={st.nextText}>Mulai</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  img: { width: 220, height: 220, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#101828', marginBottom: 10 },
  desc: {
    fontSize: 15,
    color: '#475467',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d0d5dd',
  },
  dotActive: { backgroundColor: '#175cd3', width: 24 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
  },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  skipText: { color: '#667085', fontSize: 15, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#175cd3',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
