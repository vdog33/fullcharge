// FULLCHARGE design system v2 components. Readable in smoke, sun and gloves:
// 18px body / 15px floor, 48px minimum targets (56 standard), selection = solid white + check, never colour alone.
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, S, T, TARGET } from '../theme';
import { CONFIRM, DISCLAIMER, USE_MOCKS } from '../config';
import { Icon, IconName } from './Icon';

export { Icon } from './Icon';

/** Bolt-in-a-shield — real branding (assets/bolt-shield.png). */
export function BoltShield({ size = 28 }: { size?: number }) {
  return <Image source={require('../../assets/bolt-shield.png')} style={{ width: size, height: size }} resizeMode="contain" />;
}
/** Stencil bolt-A wordmark (assets/wordmark.png). */
export function Wordmark({ size = 22 }: { size?: number }) {
  return <Image source={require('../../assets/wordmark.png')} style={{ width: size * 3, height: size }} resizeMode="contain" />;
}

// ---------- page ----------
export const Screen = forwardRef<ScrollView, { children: React.ReactNode; pad?: boolean; footer?: boolean }>(function Screen(
  { children, pad = true, footer = true }, ref,
) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView ref={ref} style={{ flex: 1, backgroundColor: C.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: pad ? S.lg : 0, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: 760, alignSelf: 'center', gap: S.block }}>
      {USE_MOCKS && <Text style={st.mock}>MOCK DATA MODE</Text>}
      {children}
      {footer && <Footer />}
    </ScrollView>
  );
});

/** Shown once per screen, at the bottom. */
export function Footer() {
  return (
    <View style={st.disclaimer}>
      <Icon name="bolt" size={18} color={C.redText} />
      <Text style={[st.muted, { flex: 1 }]}>{DISCLAIMER}</Text>
    </View>
  );
}

/** Jump links: mark direct children of <Screen> with onLayout={mark('key')}, then go('key'). */
export function useJump() {
  const ref = useRef<ScrollView>(null);
  const ys = useRef<Record<string, number>>({});
  const mark = (k: string) => (e: LayoutChangeEvent) => { ys.current[k] = e.nativeEvent.layout.y; };
  const go = (k: string) => { const y = ys.current[k]; if (y !== undefined) ref.current?.scrollTo({ y: Math.max(0, y - S.sm), animated: true }); };
  return { ref, mark, go };
}

// ---------- type ----------
export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={st.h1} accessibilityRole="header">{children}</Text>;
export function H2({ children, sub, icon, color }: { children: React.ReactNode; sub?: string; icon?: IconName; color?: string }) {
  return (
    <View style={{ marginTop: S.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        {icon && <Icon name={icon} size={22} color={color ?? C.text} />}
        <Text style={[st.h2, color ? { color } : null]} accessibilityRole="header">{children}</Text>
      </View>
      {!!sub && <Text style={[st.muted, { marginTop: 3 }]}>{sub}</Text>}
    </View>
  );
}
export const Muted = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[st.muted, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[st.body, style]}>{children}</Text>;
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={st.label}>{children}</Text>;

export function Bullets({ items, size = T.body }: { items: string[]; size?: number }) {
  return (
    <View style={{ gap: S.sm }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingLeft: 4 }}>
          <Text style={[st.body, { fontSize: size, color: C.muted }]}>•</Text>
          <Text style={[st.body, { flex: 1, fontSize: size }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Numbered steps, so a crew can call out "step 4". */
export function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: S.md }}>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, paddingTop: S.md, borderTopWidth: 1, borderColor: C.surface2 }}>
          <View style={st.stepNum}><Text style={st.stepNumText}>{i + 1}</Text></View>
          <Text style={[st.body, { flex: 1, fontSize: T.bodySm }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------- surfaces ----------
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[st.card, style]}>{children}</View>;
}
export const Divider = () => <View style={{ height: 1, backgroundColor: C.surface2 }} />;

type NoticeTone = 'warn' | 'info' | 'ok' | 'danger';
/** Safety caveats go at the top of their screen or block, in 'warn'. Never grey caption text. */
export function Notice({ tone = 'warn', title, icon, children, action }: {
  tone?: NoticeTone; title?: string; icon?: IconName; children?: React.ReactNode; action?: React.ReactNode;
}) {
  const border = tone === 'warn' ? C.hazmat : tone === 'danger' ? C.redText : C.line;
  const bg = tone === 'warn' ? C.warnBg : C.surface;
  const ic = tone === 'warn' ? C.hazmat : tone === 'danger' ? C.redText : tone === 'ok' ? C.green : C.muted;
  const name: IconName = icon ?? (tone === 'ok' ? 'check' : tone === 'info' ? 'cloud' : 'warn');
  return (
    <View style={{ flexDirection: 'row', gap: S.md, backgroundColor: bg, borderColor: border, borderWidth: 2, borderRadius: R.card, padding: 14 }}
      accessibilityRole={tone === 'warn' || tone === 'danger' ? 'alert' : undefined}>
      <View style={{ marginTop: 2 }}><Icon name={name} size={24} color={ic} /></View>
      <View style={{ flex: 1, gap: S.sm }}>
        {!!title && <Text style={st.noticeTitle}>{title}</Text>}
        {typeof children === 'string' ? <Text style={[st.body, { fontSize: T.bodySm }]}>{children}</Text> : children}
        {action}
      </View>
    </View>
  );
}

/** A labelled fact. Unverified text ("Confirm…", "Check ERG") gets the CONFIRM badge. */
export function Field({ label, value }: { label: string; value: string }) {
  const unverified = /confirm in the erg|check erg/i.test(value);
  return (
    <View style={st.field}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={st.label}>{label}</Text>
        {unverified && <Pill label="Confirm" />}
      </View>
      <Text style={st.body}>{value}</Text>
    </View>
  );
}

/** Hidden content: a 64px card with a count and a chevron — not a grey caps divider. */
export function Disclose({ title, count, defaultOpen = false, children }: {
  title: string; count?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={st.disclose}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => [st.discloseHead, pressed && { backgroundColor: C.surface2 }]}>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chev" size={24} /></View>
        <Text style={[st.discloseTitle, { flex: 1 }]}>{title}</Text>
        {!!count && <Text style={st.muted}>{count}</Text>}
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 16, gap: S.sm }}>{children}</View>}
    </View>
  );
}
/** v1 name, kept so older screens still compile. */
export const More = ({ title = 'More', children }: { title?: string; children: React.ReactNode }) => <Disclose title={title}>{children}</Disclose>;

// ---------- buttons ----------
type Tone = 'red' | 'hazmat' | 'neutral' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'xl';
/** Sentence case, bold Archivo, icon on the left. Disabled = dashed edge + reason underneath. */
export function Btn({ label, onPress, tone = 'neutral', size = 'md', big, sub, icon, disabled, reason, style }: {
  label: string; onPress?: () => void; tone?: Tone; size?: Size; big?: boolean; sub?: string; icon?: IconName;
  disabled?: boolean; reason?: string; style?: ViewStyle;
}) {
  const sz: Size = big ? 'xl' : size;
  const t = tone === 'ghost' ? 'outline' : tone;
  const bg = disabled ? C.surface : t === 'red' ? C.red : t === 'hazmat' ? C.hazmat : t === 'neutral' ? C.surface2 : 'transparent';
  const edge = disabled ? '#5A5A5A' : t === 'neutral' || t === 'outline' ? C.line : t === 'danger' ? C.redText : 'transparent';
  const fg = disabled ? '#A8A8A8' : t === 'hazmat' ? C.hazmatText : t === 'danger' ? C.redText : C.text;
  const h = sz === 'xl' ? TARGET.xl : sz === 'sm' ? TARGET.sm : TARGET.btn;
  const fs = sz === 'xl' ? T.btnXl : sz === 'sm' ? T.btnSm : T.btn;
  return (
    <View style={[{ gap: 6 }, style]}>
      <Pressable
        onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
        accessibilityHint={disabled ? reason : undefined}
        style={({ pressed }) => [st.btn, {
          minHeight: h, backgroundColor: bg, borderColor: edge, borderStyle: disabled ? 'dashed' : 'solid',
          opacity: pressed ? 0.85 : 1, transform: [{ translateY: pressed ? 1 : 0 }],
        }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {icon && <Icon name={icon} size={sz === 'xl' ? 30 : 22} color={fg} />}
          <Text style={[st.btnText, { color: fg, fontSize: fs }]}>{label}</Text>
        </View>
        {sub ? <Text style={[st.muted, { color: t === 'hazmat' ? '#222' : t === 'red' ? '#FFF' : C.muted, marginTop: 2, textAlign: 'center' }]}>{sub}</Text> : null}
      </Pressable>
      {disabled && !!reason && <Text style={st.muted}>{reason}</Text>}
    </View>
  );
}

/** Home-screen entries: icon, title, one-line subtitle, chevron. 76px. */
export function BigNav({ title, sub, icon, tone = 'neutral', onPress }: { title: string; sub?: string; icon: IconName; tone?: 'red' | 'neutral'; onPress: () => void }) {
  const red = tone === 'red';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => [st.big, red && { backgroundColor: C.red, borderColor: C.red }, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={st.bigTitle}>{title}</Text>
        {!!sub && <Text style={[st.bigSub, red && { color: '#FFF' }]}>{sub}</Text>}
      </View>
      <Icon name="chev" size={24} />
    </Pressable>
  );
}

/** Goes to another screen (chevron) or outside the app (arrow). Never a filled button. */
export function LinkRow({ title, sub, icon, external, onPress }: { title: string; sub?: string; icon?: IconName; external?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={external ? 'link' : 'button'}
      style={({ pressed }) => [st.more, pressed && { backgroundColor: C.surface }]}>
      {icon && <Icon name={icon} size={22} />}
      <View style={{ flex: 1 }}>
        <Text style={st.moreTitle}>{title}</Text>
        {!!sub && <Text style={st.muted}>{sub}</Text>}
      </View>
      <Icon name={external ? 'ext' : 'chev'} size={22} />
    </Pressable>
  );
}

// ---------- controls ----------
/** Two or three options, one always selected. Selected = white fill + check. */
export function Seg<T extends string>({ options, value, onChange, label, render }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; label: string; render?: (v: T) => string;
}) {
  return (
    <View style={st.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[st.segBtn, on && { backgroundColor: '#FFF' }]}>
            {on && <Icon name="check" size={14} color={C.hazmatText} />}
            <Text numberOfLines={1} style={[st.segText, on && { color: C.hazmatText }]}>{render ? render(o) : o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filters / jump links that scroll sideways. */
export function Chips({ options, value, onChange, label, square }: {
  options: { key: string; label: string }[]; value?: string; onChange: (k: string) => void; label: string; square?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label}
      contentContainerStyle={{ gap: S.sm, paddingRight: 40 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[st.chip, square && { borderRadius: 12 }, on && { backgroundColor: '#FFF', borderColor: '#FFF' }]}>
            {on && <Icon name="check" size={14} color={C.hazmatText} />}
            <Text style={[st.chipText, on && { color: C.hazmatText }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Says On or Off inside the track, plus one line on what it does. */
export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={[st.body, { fontWeight: '700' }]}>{label}</Text>
        {!!sub && <Text style={[st.muted, { marginTop: 2 }]}>{sub}</Text>}
      </View>
      <View style={[st.track, value && { backgroundColor: '#FFF', borderColor: '#FFF', flexDirection: 'row-reverse' }]}>
        <View style={[st.knob, value && { backgroundColor: C.hazmatText }]} />
        <Text style={[st.trackText, value && { color: C.hazmatText }]}>{value ? 'On' : 'Off'}</Text>
      </View>
    </Pressable>
  );
}

/** Visible label above, never placeholder-only. Clear button once filled. */
export function Input({ label, icon, value, onChangeText, onClear, ...rest }: TextInputProps & { label: string; icon?: IconName; onClear?: () => void }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.body, { fontSize: 16, fontWeight: '700' }]}>{label}</Text>
      <View style={[st.inp, focus && { borderColor: C.focus }]}>
        {icon && <Icon name={icon} size={22} color={C.muted} />}
        <TextInput {...rest} value={value} onChangeText={onChangeText} accessibilityLabel={label}
          placeholderTextColor="#A0A0A0" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 19, height: 54 }} />
        {!!value && (onClear || onChangeText) && (
          <Pressable onPress={() => (onClear ? onClear() : onChangeText?.(''))} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} style={st.clear}>
            <Icon name="x" size={18} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------- lists ----------
type PillTone = 'neutral' | 'recall' | 'ok' | 'sig';
/** Icon plus word. Recall = red text, verified = green, signal = neutral. */
export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: PillTone; icon?: IconName }) {
  const col = tone === 'recall' ? C.redText : tone === 'ok' ? C.green : tone === 'sig' ? C.muted : C.text;
  const edge = tone === 'recall' ? C.redText : tone === 'ok' ? '#2F7A4D' : C.line;
  return (
    <View style={[st.pill, { borderColor: edge }]}>
      {icon && <Icon name={icon} size={14} color={col} />}
      <Text style={[st.pillText, { color: col }]}>{label}</Text>
    </View>
  );
}

/** Search results: 64px, chevron, optional pill. */
export function Row({ title, meta, pill, onPress }: { title: string; meta?: string; pill?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st.row, pressed && { backgroundColor: C.surface }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowTitle}>{title}</Text>
        {!!meta && <Text style={[st.muted, { marginTop: 2 }]}>{meta}</Text>}
      </View>
      {!!pill && <Pill label={pill} />}
      <Icon name="chev" size={24} color={C.muted} />
    </Pressable>
  );
}

/** Tappable card (documents, batteries, recents): 72–76px. */
export function CardBtn({ children, icon, onPress, disabled, style }: { children: React.ReactNode; icon?: IconName; onPress?: () => void; disabled?: boolean; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [st.cardBtn, pressed && { backgroundColor: C.surface2 }, style]}>
      {icon && <Icon name={icon} size={26} />}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>{children}</View>
      {!disabled && <Icon name="chev" size={24} color={C.muted} />}
    </Pressable>
  );
}

/** Says what will appear and gives the next action. */
export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View style={st.empty}>
      <Icon name={icon} size={40} color={C.muted} />
      <Text style={st.noticeTitle}>{title}</Text>
      {!!body && <Text style={[st.body, { fontSize: T.bodySm, color: C.muted, textAlign: 'center' }]}>{body}</Text>}
      {children && <View style={{ alignSelf: 'stretch' }}>{children}</View>}
    </View>
  );
}

/** White toast with an action (e.g. Undo). Hides itself after `ms`. */
export function Toast({ text, action, onAction, onHide, ms = 6000 }: { text: string; action: string; onAction: () => void; onHide: () => void; ms?: number }) {
  useEffect(() => { const t = setTimeout(onHide, ms); return () => clearTimeout(t); }, []);
  return (
    <View style={st.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={{ flex: 1, color: C.hazmatText, fontWeight: '700', fontSize: 16 }}>{text}</Text>
      <Pressable onPress={onAction} accessibilityRole="button" style={st.toastBtn}>
        <Text style={{ color: C.hazmatText, fontFamily: F.display, fontSize: 16 }}>{action}</Text>
      </Pressable>
    </View>
  );
}

/** The four page tabs on a FULLCHARGE vehicle / BESS page. Not sticky. */
export function PageTabs({ kind, id }: { kind: 'vehicle' | 'bess'; id: string }) {
  const r = useRouter();
  return (
    <View style={{ gap: S.sm }}>
      <Btn icon="book" label="Manufacturer cut sheet (PDF)" onPress={() => r.push(`/erg-pdf?kind=${kind}&id=${id}`)} />
      <Btn tone="hazmat" icon="book" label="Hazmat ERG 147" onPress={() => r.push(`/hazmat?kind=${kind}&id=${id}`)} />
      <Btn tone="red" icon="pin" label="Isolation zones + map" onPress={() => r.push(`/zones?kind=${kind}&id=${id}`)} />
      <Btn tone="outline" size="sm" label="Quick sheet — offline" onPress={() => r.push(`/quick?kind=${kind}&id=${id}`)} />
    </View>
  );
}

/** 48px Back with the word Back (header left). */
export function BackBtn() {
  const r = useRouter();
  if (!r.canGoBack()) return null;
  return (
    <Pressable onPress={() => r.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}
      style={({ pressed }) => [st.back, pressed && { backgroundColor: C.surface2 }]}>
      <Icon name="back" size={22} />
      <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }}>Back</Text>
    </Pressable>
  );
}

export const Confirm = () => <Pill label={CONFIRM} />;

export const st = StyleSheet.create({
  h1: { color: C.text, fontFamily: F.black, fontSize: T.title, lineHeight: 34 },
  h2: { color: C.text, fontFamily: F.display, fontSize: T.section, lineHeight: 26 },
  body: { color: C.text, fontSize: T.body, lineHeight: 26 },
  muted: { color: C.muted, fontSize: T.meta, lineHeight: 21 },
  label: { color: C.muted, fontFamily: F.display, fontSize: T.label, textTransform: 'uppercase', letterSpacing: 0.9 },
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 2, borderRadius: R.card, padding: 14, gap: S.sm },
  field: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 2, borderRadius: R.card, padding: S.md, gap: 4 },
  disclaimer: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, borderColor: C.surface2, paddingTop: 14, marginTop: S.sm },
  noticeTitle: { color: C.text, fontFamily: F.display, fontSize: 19, lineHeight: 23 },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.text, fontFamily: F.display, fontSize: 17 },
  disclose: { borderWidth: 2, borderColor: C.line, borderRadius: R.card, backgroundColor: C.surface, overflow: 'hidden' },
  discloseHead: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  discloseTitle: { color: C.text, fontFamily: F.display, fontSize: 20, lineHeight: 24 },
  btn: { borderRadius: R.card, borderWidth: 2, paddingHorizontal: S.md, paddingVertical: S.sm, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.display, textAlign: 'center', lineHeight: 24, flexShrink: 1 },
  big: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: TARGET.xl, paddingHorizontal: 16, paddingVertical: 12, borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface },
  bigTitle: { color: C.text, fontFamily: F.display, fontSize: T.action, lineHeight: 26 },
  bigSub: { color: C.muted, fontSize: 16, marginTop: 3 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TARGET.btn, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 2, borderColor: C.line, borderRadius: R.card },
  moreTitle: { color: C.text, fontWeight: '700', fontSize: 18 },
  seg: { flexDirection: 'row', gap: 4, backgroundColor: C.surface, borderWidth: 2, borderColor: C.line, borderRadius: R.card, padding: 4 },
  segBtn: { flex: 1, minHeight: TARGET.min, borderRadius: R.inner, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  segText: { color: C.text, fontFamily: F.display, fontSize: 16 },
  chip: { minHeight: TARGET.min, paddingHorizontal: 16, borderRadius: R.chip, borderWidth: 2, borderColor: C.line, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { color: C.text, fontWeight: '700', fontSize: 17 },
  track: { width: 78, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  knob: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF' },
  trackText: { color: C.muted, fontFamily: F.display, fontSize: 15, paddingHorizontal: 6 },
  inp: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, paddingLeft: 14, paddingRight: 6 },
  input: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 2, borderRadius: R.card, color: C.text, paddingHorizontal: 14, minHeight: 58, fontSize: 19 },
  clear: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: C.border },
  rowTitle: { color: C.text, fontWeight: '700', fontSize: 19, lineHeight: 24 },
  cardBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: C.line, borderRadius: 16 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 6, paddingLeft: 14, paddingRight: 6 },
  toastBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, borderWidth: 2, borderColor: C.hazmatText, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, paddingLeft: 6, paddingRight: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.line },
  mock: { color: C.muted, borderColor: C.line, borderWidth: 1, textAlign: 'center', fontSize: 13, padding: 4, letterSpacing: 1 },
});
