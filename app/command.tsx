// Command view (chiefs by default, captains by choice). iPad landscape: map on the left, the cut sheet or
// ERG Guide 147 on the right, live zone scenes along the top. On a phone the same three stack with a switch.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Bullets, Label, Muted, Seg, st } from '../src/components/ui';
import { ZoneMap } from '../src/components/ZoneMap';
import { SheetItems } from '../src/components/SheetItems';
import { VerifyPicture } from '../src/components/VerifyPicture';
import { GUIDE_147_SECTIONS } from '../src/data/content';
import { ZONES } from '../src/data/catalog';
import { getRecents } from '../src/lib/history';
import { recentName } from '../src/lib/recent-nav';
import { getGuide, guideIndex, loadPacks } from '../src/lib/packs';
import { Guide } from '../src/lib/match-core';
import { lastFix, quickFix } from '../src/lib/here';
import { getScene } from '../src/lib/scene';
import { compassDeg, LatLng } from '../src/lib/geo';
import { useAuth } from '../src/lib/auth';
import { ago, Incident, liveIncidents, myGroups, OPEN_ZONE, watchIncidents } from '../src/lib/zone-share';
import { C, F, R, S } from '../src/theme';

type Focus = { label: string; guides: Guide[]; at: LatLng | null; windFrom: number | null; incident?: string };

function guidesForRef(ref: string | null | undefined): Guide[] {
  if (!ref) return [];
  if (ref.startsWith('vehicle:')) return guideIndex().filter((g) => g.vehicleId === ref.slice(8));
  const keys = ref.startsWith('guide:') ? ref.slice(6) : ref;
  return keys.split(',').map(getGuide).filter((g): g is Guide => !!g);
}

export default function Command() {
  const r = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const wide = width >= 900;
  const [pane, setPane] = useState<'Cut sheet' | 'ERG 147' | 'Map'>(wide ? 'Cut sheet' : 'Map');
  const [inc, setInc] = useState<Incident[]>([]);
  const [focus, setFocus] = useState<Focus>({ label: 'Your location', guides: [], at: lastFix(), windFrom: null });

  // Start on your own scene: your spot + the last vehicle you opened + the wind set on Isolation zones.
  useFocusEffect(useCallback(() => {
    loadPacks().then(getRecents).then((l) => {
      const x = l.find((y) => y.kind !== 'bess');
      const sc = getScene();
      setFocus((f) => (f.incident ? f : {
        label: x ? recentName(x) ?? 'Last vehicle' : 'No vehicle yet', at: lastFix(),
        guides: x ? guidesForRef(x.kind === 'vehicle' ? `vehicle:${x.id}` : x.id) : [],
        windFrom: sc.windDeg ?? compassDeg(sc.windFrom),
      }));
    });
    quickFix().then((p) => { if (p && p !== 'denied') setFocus((f) => (f.incident || f.at ? f : { ...f, at: p })); });
  }, []));
  const loadInc = useCallback(() => { if (user || OPEN_ZONE) myGroups().then((g) => liveIncidents(g.map((x) => x.id))).then(setInc).catch(() => {}); }, [user?.id]);
  useEffect(() => { loadInc(); return user || OPEN_ZONE ? watchIncidents((i) => { loadInc(); setFocus((f) => (f.incident === i.id ? { ...f, windFrom: i.wind_from_deg } : f)); }) : undefined; }, [user?.id]);

  const pick = (i: Incident) => setFocus({ label: `${i.unit} · ${i.vehicle}`, guides: guidesForRef(i.vehicle_ref), at: i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null, windFrom: i.wind_from_deg, incident: i.id });

  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: S.lg, paddingVertical: 8 }}>
      <Chip on={!focus.incident} title="My scene" sub={focus.incident ? 'Back to mine' : focus.label} onPress={() => setFocus({ label: 'Your location', guides: [], at: lastFix(), windFrom: null })} />
      {inc.map((i) => <Chip key={i.id} on={focus.incident === i.id} title={i.unit || 'Zone scene'} sub={`${i.vehicle} · ${ago(i.created_at)}`} onPress={() => pick(i)} />)}
      {!user && !OPEN_ZONE && <Chip on={false} title="Zone scenes" sub="Sign in to see them" onPress={() => r.push('/zone')} />}
    </ScrollView>
  );

  const map = focus.at
    ? <ZoneMap fire={focus.at} you={lastFix()} mapType="satellite" height={wide ? height - insets.bottom - 150 : Math.min(460, height * 0.55)}
        plumeHeading={((focus.windFrom ?? 0) + 180) % 360} plumeHalfDeg={focus.windFrom != null ? ZONES.plume_day_spread_deg : 0}
        plumeLenM={focus.windFrom != null ? ZONES.plume_day_m : 0} onMoveFire={(p) => setFocus((f) => ({ ...f, at: p }))} />
    : <Muted>Waiting for your location…</Muted>;

  const sheet = (
    <View style={{ gap: S.block }}>
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>{focus.guides.length ? focus.label : 'No vehicle yet'}</Text>
      {focus.guides.length ? <>
        <SheetItems guides={focus.guides} />
        <VerifyPicture guides={focus.guides} hero />
      </> : <Btn icon="search" label="Find the vehicle" onPress={() => r.push('/search')} />}
    </View>
  );
  const erg = (
    <View style={{ gap: S.block }}>
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>ERG Guide 147 — lithium-ion</Text>
      {GUIDE_147_SECTIONS.slice(0, 4).map((g) => <View key={g.h} style={{ gap: 4 }}><Label>{g.h}</Label><Bullets items={g.lines} size={17} /></View>)}
      <Btn tone="hazmat" icon="book" label="Full Guide 147" onPress={() => r.push('/hazmat')} />
    </View>
  );

  if (wide) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {strip}
      <View style={{ flex: 1, flexDirection: 'row', gap: S.lg, paddingHorizontal: S.lg, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flex: 1.15 }}>{map}</View>
        <View style={{ flex: 1, gap: S.sm }}>
          <Seg label="Right side" options={['Cut sheet', 'ERG 147'] as const} value={pane === 'Map' ? 'Cut sheet' : pane} onChange={setPane} />
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>{pane === 'ERG 147' ? erg : sheet}</ScrollView>
        </View>
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {strip}
      <View style={{ paddingHorizontal: S.lg }}><Seg label="Show" options={['Map', 'Cut sheet', 'ERG 147'] as const} value={pane} onChange={setPane} /></View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 40, gap: S.block }}>
        {pane === 'Map' ? map : pane === 'ERG 147' ? erg : sheet}
      </ScrollView>
    </View>
  );
}

function Chip({ on, title, sub, onPress }: { on: boolean; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ minHeight: 56, minWidth: 150, maxWidth: 260, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.card, borderWidth: 2,
        borderColor: on ? '#FFF' : C.line, backgroundColor: on ? '#FFF' : pressed ? C.surface2 : C.surface, justifyContent: 'center' })}>
      <Text numberOfLines={1} style={{ color: on ? C.hazmatText : C.text, fontFamily: F.display, fontSize: 16 }}>{title}</Text>
      <Text numberOfLines={1} style={{ color: on ? C.hazmatText : C.muted, fontSize: 14 }}>{sub}</Text>
    </Pressable>
  );
}
