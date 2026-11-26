// The cut sheet broken down: one tab per item (Cut loop, HV disconnect, 12V, No cut), each showing that part of the
// manufacturer's OWN drawing, boxed, with the sheet's own words. Only sheets a person has checked ever show here.
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, IconName } from './Icon';
import { Pill, st } from './ui';
import { Box, CalloutKind, cropFor, KINDS } from '../lib/callouts-core';
import { calloutsFor, ensureCallouts, subscribeCallouts } from '../lib/callouts';
import { Guide } from '../lib/match-core';
import { SheetPage, sheetPageUris } from '../lib/packs';
import { C, R, S } from '../theme';

const ICON: Record<CalloutKind, IconName> = { cut_loop: 'cut', hv_disconnect: 'bolt', lv_battery: 'batt', do_not_cut: 'x' };
export const KIND_COLOR: Record<CalloutKind, string> = { cut_loop: '#FF3B30', hv_disconnect: '#FF9500', lv_battery: '#0A84FF', do_not_cut: '#BF5AF2' };

export function SheetItems({ guides }: { guides: Guide[] }) {
  const r = useRouter();
  const [, setN] = useState(0);
  useEffect(() => { ensureCallouts(); return subscribeCallouts(() => setN((x) => x + 1)); }, []);
  const hit = guides.map((g) => ({ g, c: calloutsFor(g.key) })).find((x) => x.c);
  const [pages, setPages] = useState<SheetPage[]>([]);
  useEffect(() => { if (hit) sheetPageUris(hit.g).then(setPages).catch(() => setPages([])); }, [hit?.g.key]);
  const kinds = useMemo(() => [...new Set((hit?.c?.boxes ?? []).map((b) => b.kind))], [hit?.c]);
  const [kind, setKind] = useState<CalloutKind | null>(null);
  if (!hit?.c || !kinds.length) return null;
  const k = kind && kinds.includes(kind) ? kind : kinds[0];
  const items = hit.c.boxes.filter((b) => b.kind === k);

  return (
    <View style={{ gap: S.sm }}>
      <View style={st.seg} accessibilityRole="tablist" accessibilityLabel="Cut sheet items">
        {kinds.map((x) => {
          const on = x === k;
          return (
            <Pressable key={x} onPress={() => setKind(x)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[st.segBtn, { flexDirection: 'column', minHeight: 60, gap: 2 }, on && { backgroundColor: '#FFF' }]}>
              <Icon name={ICON[x]} size={20} color={on ? C.hazmatText : KIND_COLOR[x]} />
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[st.segText, { fontSize: 14 }, on && { color: C.hazmatText }]}>{KINDS[x].short}</Text>
            </Pressable>
          );
        })}
      </View>
      {items.map((b, i) => <Crop key={i} b={b} page={pages[b.page]} n={items.length > 1 ? i + 1 : undefined} onOpen={() => r.push(`/sheet?key=${hit.g.key}`)} />)}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill tone="ok" icon="check" label={`Checked by ${hit.c.confirmedBy}${hit.c.confirmedAt ? `, ${hit.c.confirmedAt.slice(0, 10)}` : ''}`} />
      </View>
    </View>
  );
}

function Crop({ b, page, n, onOpen }: { b: Box; page?: SheetPage; n?: number; onOpen: () => void }) {
  const [W, setW] = useState(320);
  if (!page) return <View style={{ height: 200, borderRadius: R.card, backgroundColor: C.surface }} />;
  const c = cropFor(b, page.w, page.h);
  const H = (W * c.h * page.h) / (c.w * page.w);
  const iw = W / c.w, ih = (iw * page.h) / page.w;
  const col = KIND_COLOR[b.kind];
  return (
    <Pressable onPress={onOpen} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="imagebutton"
      accessibilityLabel={`${KINDS[b.kind].label}${b.note ? `: ${b.note}` : ''}. Tap to open the full sheet.`}>
      <View style={{ width: '100%', height: H, backgroundColor: '#fff', borderRadius: R.card, overflow: 'hidden' }}>
        <Image source={{ uri: page.uri }} style={{ position: 'absolute', width: iw, height: ih, left: -c.x * iw, top: -c.y * ih }} />
        <View style={{ position: 'absolute', left: (b.x - c.x) * iw - 4, top: (b.y - c.y) * ih - 4, width: b.w * iw + 8, height: b.h * ih + 8, borderWidth: 4, borderColor: col, borderRadius: 6 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: col }} />
        <Text style={[st.body, { flex: 1, fontWeight: '700' }]}>{n ? `${n}. ` : ''}{KINDS[b.kind].label}{b.note ? ` — ${b.note}` : ''}</Text>
      </View>
    </Pressable>
  );
}
