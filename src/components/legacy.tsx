// Frozen v1 look, used ONLY by the rescue-sheet / PDF viewers (sheet.tsx, erg-pdf.tsx).
// Design sheet v2: "The rescue-sheet PDF view stays exactly as it is." Don't restyle this file.
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DISCLAIMER, USE_MOCKS } from '../config';

export const LC = {
  bg: '#0A0A0A', surface: '#161616', surface2: '#1F1F1F', red: '#E10600', text: '#F5F5F5',
  muted: '#9A9A9A', border: '#2E2E2E', hazmat: '#FFD60A', hazmatText: '#000000',
} as const;
const LS = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const narrowBold = 'ArchivoNarrow_700Bold';

export function Screen({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: LC.bg }} contentContainerStyle={{ padding: pad ? LS.lg : 0, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {USE_MOCKS && <Text style={st.mock}>MOCK DATA MODE</Text>}
      {children}
      <View style={{ alignItems: 'center', marginTop: LS.xl, gap: 6 }}>
        <Image source={require('../../assets/bolt-shield.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />
        <Text style={[st.muted, { textAlign: 'center' }]}>{DISCLAIMER}</Text>
      </View>
    </ScrollView>
  );
}

export const Muted = ({ children }: { children: React.ReactNode }) => <Text style={st.muted}>{children}</Text>;
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[st.card, style]}>{children}</View>;
}

type Tone = 'red' | 'hazmat' | 'neutral' | 'ghost';
export function Btn({ label, onPress, tone = 'neutral', big, sub, disabled }: {
  label: string; onPress?: () => void; tone?: Tone; big?: boolean; sub?: string; disabled?: boolean;
}) {
  const bg = tone === 'red' ? LC.red : tone === 'hazmat' ? LC.hazmat : tone === 'ghost' ? 'transparent' : LC.surface2;
  const fg = tone === 'hazmat' ? LC.hazmatText : LC.text;
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [st.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, paddingVertical: big ? 22 : 14 }, tone === 'ghost' && { borderWidth: 1, borderColor: LC.border }]}
    >
      <Text style={[st.btnText, { color: fg, fontSize: big ? 22 : 15 }]}>{label}</Text>
      {sub ? <Text style={[st.muted, { color: tone === 'hazmat' ? '#222' : '#DDD', marginTop: 2 }]}>{sub}</Text> : null}
    </Pressable>
  );
}

export const st = StyleSheet.create({
  body: { color: LC.text, fontSize: 16, lineHeight: 22 },
  muted: { color: LC.muted, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: LC.surface, borderColor: LC.border, borderWidth: 1, borderRadius: 10, padding: LS.md, gap: LS.sm },
  btn: { borderRadius: 10, paddingHorizontal: LS.lg, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: narrowBold, letterSpacing: 0.6, textAlign: 'center' },
  mock: { color: LC.muted, borderColor: LC.border, borderWidth: 1, textAlign: 'center', fontSize: 11, padding: 4, marginBottom: LS.sm, letterSpacing: 1 },
});
export const LS_ = LS;
