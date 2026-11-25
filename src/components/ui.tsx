import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, T, TAP } from '../theme';
import { CONFIRM, DISCLAIMER, USE_MOCKS } from '../config';

/** Bolt-in-a-shield — real branding (assets/bolt-shield.png, backdrop keyed transparent). Decorative. */
export function BoltShield({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/bolt-shield.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
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
      accessible
      accessibilityRole="header"
      accessibilityLabel="FULLCHARGE"
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

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={st.h1} accessibilityRole="header">{children}</Text>;
export const H2 = ({ children }: { children: React.ReactNode }) => <Text style={st.h2} accessibilityRole="header">{children}</Text>;
export const Muted = ({ children, live }: { children: React.ReactNode; live?: boolean }) => (
  <Text style={st.muted} accessibilityLiveRegion={live ? 'polite' : undefined}>{children}</Text>
);
export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[st.body, style]}>{children}</Text>;

export function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }} accessible accessibilityLabel={t}>
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

/**
 * Safety caveat. Yellow fill, black text, warning icon — always placed FIRST on the screen it guards,
 * never buried between buttons (Nielsen H5 error prevention).
 */
export function Warning({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={st.warning} accessible accessibilityRole="alert">
      <Text style={st.warningIcon} accessibilityElementsHidden importantForAccessibility="no">⚠</Text>
      <View style={{ flex: 1, gap: 4 }}>
        {!!title && <Text style={st.warningTitle}>{title}</Text>}
        {typeof children === 'string' ? <Text style={st.warningText}>{children}</Text> : children}
      </View>
    </View>
  );
}
export const WarningText = ({ children }: { children: React.ReactNode }) => <Text style={st.warningText}>{children}</Text>;

/** A labelled fact. Unverified text ("Confirm…", "Check ERG") gets the CONFIRM badge. */
export function Field({ label, value }: { label: string; value: string }) {
  const unverified = /confirm in the erg|check erg/i.test(value);
  return (
    <View style={st.field} accessible accessibilityLabel={`${label}${unverified ? ', confirm' : ''}: ${value}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={st.label}>{label}</Text>
        {unverified && <Text style={st.confirm}>CONFIRM</Text>}
      </View>
      <Text style={st.body}>{value}</Text>
    </View>
  );
}

/**
 * Disclosure. A full-width card (64 px) with a count and a chevron, so a hidden checklist
 * never reads as a divider (Nielsen H6, Gestalt figure-ground). Exposes expanded state.
 */
export function More({ title = 'More', count, children }: { title?: string; count?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: S.md }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`${title}${count ? `, ${count}` : ''}`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Collapses the section' : 'Expands the section'}
        style={({ pressed }) => [st.more, pressed && { opacity: 0.75 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={st.moreText}>{title}</Text>
          {!!count && <Text style={st.muted}>{count}</Text>}
        </View>
        <Text style={st.chevron} accessibilityElementsHidden importantForAccessibility="no">{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open && <View style={{ paddingTop: S.sm, gap: S.sm }}>{children}</View>}
    </View>
  );
}

type Tone = 'red' | 'hazmat' | 'neutral' | 'ghost';
export function Btn({ label, onPress, tone = 'neutral', big, sub, disabled, hint }: {
  label: string; onPress?: () => void; tone?: Tone; big?: boolean; sub?: string; disabled?: boolean; hint?: string;
}) {
  const bg = tone === 'red' ? C.red : tone === 'hazmat' ? C.hazmat : tone === 'ghost' ? 'transparent' : C.surface2;
  const fg = tone === 'hazmat' ? C.hazmatText : C.text;
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        st.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, minHeight: big ? 88 : TAP.primary, paddingVertical: big ? 18 : 12 },
        (tone === 'ghost' || tone === 'neutral') && { borderWidth: 1, borderColor: C.control },
      ]}
    >
      <Text style={[st.btnText, { color: fg, fontSize: big ? T.btnBig : T.btn }]}>{label}</Text>
      {sub ? <Text style={[st.muted, { color: fg, marginTop: 2, textAlign: 'center' }]}>{sub}</Text> : null}
    </Pressable>
  );
}

/**
 * Selectable chip / segment. Selected = solid white fill, black text and a check, so state never
 * relies on a 1 px border (Nielsen H1, WCAG 1.4.11). Use role="radio" inside a radiogroup for
 * one-of-many choices; omit `on` for a plain action chip (steppers, nudges).
 */
export function Chip({ label, on, onPress, a11yLabel, style, role }: {
  label: string; on?: boolean; onPress: () => void; a11yLabel?: string; style?: ViewStyle; role?: 'radio' | 'button';
}) {
  const selectable = on !== undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role ?? (selectable ? 'radio' : 'button')}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={selectable ? { checked: on, selected: on } : undefined}
      style={({ pressed }) => [st.chip, on && st.chipOn, pressed && { opacity: 0.75 }, style]}
    >
      <Text style={[st.chipText, on && { color: C.onLight }]}>{on ? `✓ ${label}` : label}</Text>
    </Pressable>
  );
}

/** One-of-many group (Day/Night, map mode…). */
export function RadioGroup({ label, children, style }: { label: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }, style]}>
      {children}
    </View>
  );
}

/**
 * Text field with a persistent visible label (never placeholder-only) and a 48 px clear button
 * (WCAG 3.3.2, Nielsen H3).
 */
export function LabeledInput({ label, value, onChangeText, style, ...rest }: Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  label: string; value: string; onChangeText: (t: string) => void; style?: ViewStyle;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={st.label} nativeID={`lbl-${label}`}>{label}</Text>
      <View style={st.inputRow}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={label}
          accessibilityLabelledBy={`lbl-${label}`}
          placeholderTextColor={C.muted}
          style={st.inputField}
        />
        {!!value && (
          <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} style={st.clear} hitSlop={4}>
            <Text style={{ color: C.text, fontSize: 22 }} accessibilityElementsHidden importantForAccessibility="no">×</Text>
          </Pressable>
        )}
      </View>
    </View>
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
  h1: { color: C.text, fontFamily: F.display, fontSize: T.h1, lineHeight: T.h1 + 6 },
  h2: { color: C.text, fontFamily: F.narrowBold, fontSize: T.h2, marginTop: S.lg, marginBottom: S.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { color: C.text, fontSize: T.body, lineHeight: T.body + 7 },
  muted: { color: C.muted, fontSize: T.floor, lineHeight: T.floor + 6 },
  label: { color: C.muted, fontFamily: F.narrowBold, fontSize: T.label, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: S.md, gap: S.sm },
  field: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: S.md, gap: 4, marginBottom: S.sm },
  confirm: { color: C.muted, borderColor: C.muted, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, fontSize: T.floor, fontFamily: F.narrowBold, overflow: 'hidden' },
  warning: { flexDirection: 'row', gap: S.md, backgroundColor: C.hazmat, borderRadius: 10, padding: S.md, marginBottom: S.md, alignItems: 'flex-start' },
  warningIcon: { color: C.hazmatText, fontSize: 26, lineHeight: 30 },
  warningTitle: { color: C.hazmatText, fontFamily: F.narrowBold, fontSize: T.label + 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  warningText: { color: C.hazmatText, fontSize: T.body, lineHeight: T.body + 7 },
  more: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderColor: C.control, borderWidth: 1, borderRadius: 10, paddingHorizontal: S.lg, paddingVertical: S.sm },
  moreText: { color: C.text, fontFamily: F.narrowBold, fontSize: T.btn, letterSpacing: 0.4 },
  chevron: { color: C.text, fontSize: 26 },
  btn: { borderRadius: 10, paddingHorizontal: S.lg, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.narrowBold, letterSpacing: 0.6, textAlign: 'center' },
  chip: { minHeight: TAP.min, minWidth: TAP.min, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.control, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.text, borderColor: C.text },
  chipText: { color: C.text, fontFamily: F.narrowBold, fontSize: T.body, textAlign: 'center' },
  input: { backgroundColor: C.surface, borderColor: C.control, borderWidth: 1, borderRadius: 10, color: C.text, paddingHorizontal: S.md, minHeight: TAP.primary, fontSize: T.body },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderColor: C.control, borderWidth: 1, borderRadius: 10, minHeight: TAP.primary },
  inputField: { flex: 1, color: C.text, paddingHorizontal: S.md, paddingVertical: 12, fontSize: T.body },
  clear: { width: TAP.min, height: TAP.min, alignItems: 'center', justifyContent: 'center' },
  mock: { color: C.muted, borderColor: C.border, borderWidth: 1, textAlign: 'center', fontSize: T.floor, padding: 4, marginBottom: S.sm, letterSpacing: 1 },
});
