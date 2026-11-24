import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S } from '../theme';
import { CONFIRM, DISCLAIMER, USE_MOCKS } from '../config';

/** Bolt-in-a-shield — real branding (assets/bolt-shield.png, backdrop keyed transparent). */
export function BoltShield({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/bolt-shield.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

/** Stencil bolt-A wordmark: FULL white, CHARGE red, A in CHARGE is a bolt — real branding (assets/wordmark.png). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/wordmark.png')}
      style={{ width: size * 3, height: size }}
      resizeMode="contain"
    />
  );
}

export function Screen({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: pad ? S.lg : 0, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {USE_MOCKS && <Text style={st.mock}>MOCK DATA MODE</Text>}
      {children}
      <Footer />
    </ScrollView>
  );
}

export function Footer() {
  return (
    <View style={{ alignItems: 'center', marginTop: S.xl, gap: 6 }}>
      <BoltShield size={22} />
      <Text style={[st.muted, { textAlign: 'center' }]}>{DISCLAIMER}</Text>
    </View>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={st.h1}>{children}</Text>;
export const H2 = ({ children }: { children: React.ReactNode }) => <Text style={st.h2}>{children}</Text>;
export const Muted = ({ children }: { children: React.ReactNode }) => <Text style={st.muted}>{children}</Text>;
export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[st.body, style]}>{children}</Text>;

export function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={st.body}>•</Text>
          <Text style={[st.body, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[st.card, style]}>{children}</View>;
}

/** A labelled fact. Unverified text ("Confirm…", "Check ERG") gets the CONFIRM badge. */
export function Field({ label, value }: { label: string; value: string }) {
  const unverified = /confirm in the erg|check erg/i.test(value);
  return (
    <View style={st.field}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={st.label}>{label}</Text>
        {unverified && <Text style={st.confirm}>CONFIRM</Text>}
      </View>
      <Text style={st.body}>{value}</Text>
    </View>
  );
}

export function More({ title = 'More', children }: { title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: S.sm }}>
      <Pressable onPress={() => setOpen(!open)} style={st.more} accessibilityRole="button">
        <Text style={st.moreText}>{open ? '▾' : '▸'} {title.toUpperCase()}</Text>
      </Pressable>
      {open && <View style={{ paddingTop: S.sm, gap: S.sm }}>{children}</View>}
    </View>
  );
}

type Tone = 'red' | 'hazmat' | 'neutral' | 'ghost';
export function Btn({ label, onPress, tone = 'neutral', big, sub, disabled }: {
  label: string; onPress?: () => void; tone?: Tone; big?: boolean; sub?: string; disabled?: boolean;
}) {
  const bg = tone === 'red' ? C.red : tone === 'hazmat' ? C.hazmat : tone === 'ghost' ? 'transparent' : C.surface2;
  const fg = tone === 'hazmat' ? C.hazmatText : C.text;
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [st.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, paddingVertical: big ? 22 : 14 }, tone === 'ghost' && { borderWidth: 1, borderColor: C.border }]}
    >
      <Text style={[st.btnText, { color: fg, fontSize: big ? 22 : 15 }]}>{label}</Text>
      {sub ? <Text style={[st.muted, { color: tone === 'hazmat' ? '#222' : '#DDD', marginTop: 2 }]}>{sub}</Text> : null}
    </Pressable>
  );
}

/** The four page tabs. NOT sticky — they sit under the name and scroll away with the page. */
export function PageTabs({ kind, id }: { kind: 'vehicle' | 'bess'; id: string }) {
  const r = useRouter();
  return (
    <View style={{ gap: S.sm, marginVertical: S.md }}>
      <Btn tone="red" label="ERG — MANUFACTURER CUT SHEET (PDF)" onPress={() => r.push(`/erg-pdf?kind=${kind}&id=${id}`)} />
      <Btn tone="hazmat" label="HAZMAT ERG 147" onPress={() => r.push(`/hazmat?kind=${kind}&id=${id}`)} />
      <Btn tone="red" label="ISOLATION ZONES + MAP" onPress={() => r.push(`/zones?kind=${kind}&id=${id}`)} />
      <Btn tone="neutral" label="QUICK SHEET — OFFLINE" onPress={() => r.push(`/quick?kind=${kind}&id=${id}`)} />
    </View>
  );
}

export const Confirm = () => <Text style={st.confirm}>{CONFIRM.toUpperCase()}</Text>;

export const st = StyleSheet.create({
  h1: { color: C.text, fontFamily: F.display, fontSize: 28, lineHeight: 32 },
  h2: { color: C.text, fontFamily: F.narrowBold, fontSize: 18, marginTop: S.lg, marginBottom: S.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { color: C.text, fontSize: 16, lineHeight: 22 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 18 },
  label: { color: C.muted, fontFamily: F.narrowBold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: S.md, gap: S.sm },
  field: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: S.md, gap: 4, marginBottom: S.sm },
  confirm: { color: C.muted, borderColor: C.muted, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, fontSize: 10, fontFamily: F.narrowBold, overflow: 'hidden' },
  more: { paddingVertical: 10, borderTopWidth: 1, borderColor: C.border },
  moreText: { color: C.muted, fontFamily: F.narrowBold, fontSize: 14, letterSpacing: 0.8 },
  btn: { borderRadius: 10, paddingHorizontal: S.lg, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.narrowBold, letterSpacing: 0.6, textAlign: 'center' },
  input: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 16 },
  mock: { color: C.muted, borderColor: C.border, borderWidth: 1, textAlign: 'center', fontSize: 11, padding: 4, marginBottom: S.sm, letterSpacing: 1 },
});
