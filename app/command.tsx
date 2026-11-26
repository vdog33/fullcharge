// Command view — the command-zone screen. iPad landscape: live map on the left (fire, zones, wind plume),
// the cut sheet or ERG 147 on the right, scenes along the top. Moving the fire or changing the wind on a shared
// scene updates every phone viewing it. On a phone the same parts stack with a switch.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Bullets, Chips, Label, Muted, Seg, st } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { ZoneMap } from '../src/components/ZoneMap';
import { SheetItems } from '../src/components/SheetItems';
import { SheetZoom } from '../src/components/SheetZoom';
import { WeatherChip } from '../src/components/WeatherChip';
import { getWeather, Weather } from '../src/lib/weather';
import { ShareToZoneBtn } from '../src/components/ShareToZoneBtn';
import { GUIDE_147_SECTIONS } from '../src/data/content';
import { ZONES } from '../src/data/catalog';
import { getRecents } from '../src/lib/history';
import { recentName } from '../src/lib/recent-nav';
import { getGuide, guideIndex, loadPacks } from '../src/lib/packs';
import { Guide } from '../src/lib/match-core';
import { lastFix, quickFix } from '../src/lib/here';
import { getScene } from '../src/lib/scene';
import { COMPASS, Compass, compassDeg, LatLng, toCompass } from '../src/lib/geo';
import { useAuth } from '../src/lib/auth';
import { supabase } from '../src/lib/supabase';
import { ago, Incident, liveIncidents, myGroups, OPEN_ZONE, OPEN_ZONE_ID, updateIncident, watchIncidents } from '../src/lib/zone-share';
import { C, F, R, S } from '../src/theme';

type Focus = { label: string; guides: Guide[]; at: LatLng | null; windFrom: number | null; ref?: string; incident?: Incident };

function guidesForRef(ref: string | null | undefined): Guide[] {
  if (!ref) return [];
  if (ref.startsWith('vehicle:')) return guideIndex().filter((g) => g.vehicleId === ref.slice(8));
  const keys = ref.startsWith('guide:') ? ref.slice(6) : ref;
  return keys.split(',').map(getGuide).filter((g): g is Guide => !!g);
}
const fromIncident = (i: Incident): Focus => ({
  label: [i.unit, i.vehicle].filter(Boolean).join(' · '), guides: guidesForRef(i.vehicle_ref), ref: i.vehicle_ref ?? undefined,
  at: i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null, windFrom: i.wind_from_deg, incident: i,
});

export default function Command() {
  const r = useRouter();
  const { incident: incidentId } = useLocalSearchParams<{ incident?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const wide = width >= 700 && width > height;
  const [pane, setPane] = useState<'Cut sheet' | 'ERG 147' | 'Map'>(wide ? 'Cut sheet' : 'Map');
  const [inc, setInc] = useState<Incident[]>([]);
  const [paneH, setPaneH] = useState(0);
  const [rightH, setRightH] = useState(0);
  const [wx, setWx] = useState<Weather | null>(null);
  const [windOpen, setWindOpen] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const [focus, setFocus] = useState<Focus>({ label: 'Your location', guides: [], at: lastFix(), windFrom: null });
  const live = focus.incident;
  // Open beta zone: anyone can update. Invite-only zones: the unit that shared it.
  const canEdit = !!live && live.status === 'active' && (live.group_id === OPEN_ZONE_ID || (!!user && user.id === live.created_by));

  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []); // keeps "12 min" fresh

  // Opened for a shared scene (from Share to zone, a notification or the zone list).
  useEffect(() => {
    if (!incidentId || !supabase) return;
    loadPacks().then(() => supabase!.from('zone_incidents').select('*').eq('id', incidentId).single())
      .then(({ data, error }: { data: Incident | null; error: { message: string } | null }) => { if (error) setErr(error.message); else if (data) setFocus(fromIncident(data)); });
  }, [incidentId]);

  // Otherwise start on your own scene: your spot + the last vehicle you opened + the wind set on Isolation zones.
  useFocusEffect(useCallback(() => {
    if (incidentId) return;
    loadPacks().then(getRecents).then((l) => {
      const x = l.find((y) => y.kind !== 'bess');
      const sc = getScene();
      setFocus((f) => (f.incident ? f : {
        label: x ? recentName(x) ?? 'Last vehicle' : 'No vehicle yet', at: f.at ?? lastFix(),
        guides: x ? guidesForRef(x.kind === 'vehicle' ? `vehicle:${x.id}` : x.id) : [],
        ref: x ? (x.kind === 'vehicle' ? `vehicle:${x.id}` : `guide:${x.id}`) : undefined,
        windFrom: sc.windSource === 'none' ? null : sc.windDeg ?? compassDeg(sc.windFrom),
      }));
    });
    quickFix().then((p) => { if (p && p !== 'denied') setFocus((f) => (f.incident || f.at ? f : { ...f, at: p })); });
  }, [incidentId]));

  const loadInc = useCallback(() => { if (user || OPEN_ZONE) myGroups().then((g) => liveIncidents(g.map((x) => x.id))).then(setInc).catch(() => {}); }, [user?.id]);
  // Live: someone moved the fire or changed the wind → my map follows.
  useEffect(() => {
    loadInc();
    return user || OPEN_ZONE ? watchIncidents((i) => { loadInc(); setFocus((f) => (f.incident?.id === i.id ? { ...fromIncident(i), guides: f.guides.length ? f.guides : fromIncident(i).guides } : f)); }) : undefined;
  }, [user?.id]);

  // Weather at the fire: shown on the map, and fills the wind when nobody has set it.
  useEffect(() => {
    const at = focus.at;
    if (!at) return;
    getWeather(at).then((w) => {
      if (!w) return;
      setWx(w);
      if (w.windFromDeg == null) return;
      setFocus((f) => {
        if (f.windFrom != null) return f;
        if (f.incident && (f.incident.group_id === OPEN_ZONE_ID || user?.id === f.incident.created_by)) updateIncident(f.incident.id, { wind_from_deg: w.windFromDeg! }).catch(() => {});
        return f.incident && !(f.incident.group_id === OPEN_ZONE_ID || user?.id === f.incident.created_by) ? f : { ...f, windFrom: w.windFromDeg };
      });
    });
  }, [focus.at ? Math.round(focus.at.lat * 100) : null, focus.at ? Math.round(focus.at.lng * 100) : null, live?.id]);

  function moveFire(p: LatLng) {
    setFocus((f) => ({ ...f, at: p }));
    if (canEdit) updateIncident(live!.id, { lat: p.lat, lng: p.lng }).catch((e) => setErr(e.message));
  }
  function setWind(c: Compass) {
    const deg = compassDeg(c);
    setFocus((f) => ({ ...f, windFrom: deg }));
    if (canEdit) updateIncident(live!.id, { wind_from_deg: deg }).catch((e) => setErr(e.message));
  }

  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: S.md, paddingVertical: 8, alignItems: 'center' }}>
      <Chip on={!live} title="My scene" sub={live ? 'Back to mine' : 'Not shared'} onPress={() => (live ? r.replace('/command') : undefined)} />
      {inc.map((i) => <Chip key={i.id} on={live?.id === i.id} title={i.unit || 'Zone scene'} sub={`${i.vehicle} · ${ago(i.created_at)}`} onPress={() => setFocus(fromIncident(i))} />)}
    </ScrollView>
  );

  // Status bar for the scene: what, who, how long, wind, and whether everyone sees my changes.
  const status = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: S.md, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: live ? '#2A0B08' : C.surface }}>
        <Icon name={live ? 'users' : 'pin'} size={18} color={live ? C.redText : C.muted} />
        <Text style={{ color: live ? C.redText : C.muted, fontFamily: F.display, fontSize: 15 }}>{live ? 'SHARED — LIVE' : 'MY SCENE — NOT SHARED'}</Text>
      </View>
      <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }} numberOfLines={1}>{focus.label}</Text>
      {live && <Text style={{ color: C.muted, fontSize: 15 }}>shared {ago(live.created_at)}{live.updated_at !== live.created_at ? ` · updated ${ago(live.updated_at)}` : ''}</Text>}
      {live && !canEdit && <Text style={{ color: C.muted, fontSize: 15 }}>· view only</Text>}
    </View>
  );

  const mapH = wide ? Math.max(300, paneH || height - insets.top - insets.bottom - 160) : Math.min(460, height * 0.55);
  const map = focus.at ? (
    <View style={{ height: mapH }}>
      <ZoneMap key={live?.id ?? 'mine'} fire={focus.at} you={lastFix()} mapType="satellite" height={mapH}
        plumeHeading={((focus.windFrom ?? 0) + 180) % 360} plumeHalfDeg={focus.windFrom != null ? ZONES.plume_day_spread_deg : 0}
        plumeLenM={focus.windFrom != null ? ZONES.plume_day_m : 0} onMoveFire={moveFire} />
      {/* Over the map: weather + wind, so the map keeps the whole height. */}
      <View style={{ position: 'absolute', top: 8, left: 8, right: 60, gap: 6 }} pointerEvents="box-none">
        {wx && <WeatherChip w={wx} using compact />}
        <Pressable onPress={() => (!live || canEdit ? setWindOpen((x) => !x) : undefined)} accessibilityRole="button"
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 8, backgroundColor: windOpen ? '#FFF' : 'rgba(0,0,0,0.75)' }}>
          <Icon name="nav" size={18} color={windOpen ? C.hazmatText : C.text} />
          <Text style={{ color: windOpen ? C.hazmatText : C.text, fontWeight: '700', fontSize: 16 }}>
            Wind from {focus.windFrom != null ? toCompass(focus.windFrom) : '— set'}{!live || canEdit ? (windOpen ? ' · close' : ' · change') : ''}
          </Text>
        </Pressable>
        {windOpen && (
          <View style={{ backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 8, padding: 6 }}>
            <Chips label="Wind from" square options={COMPASS.map((c) => ({ key: c, label: c }))} value={focus.windFrom != null ? toCompass(focus.windFrom) : undefined}
              onChange={(c) => { setWind(c as Compass); setWindOpen(false); }} />
          </View>
        )}
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ color: '#fff', fontSize: 13 }}>{!live || canEdit ? `Drag the fire — zones follow${live ? ' on every phone' : ''}` : 'View only'}</Text>
      </View>
    </View>
  ) : <Muted>Waiting for your location…</Muted>;

  const sheet = (
    <View style={{ gap: S.block }}>
      {!live && focus.ref && <ShareToZoneBtn vehicleRef={focus.ref} title={focus.label} />}
      {focus.guides.length ? <>
        <SheetItems guides={focus.guides} />
        <SheetZoom guides={focus.guides} height={wide ? Math.max(320, rightH - 70) : Math.round(height * 0.7)} />
        <Btn tone="outline" icon="book" label="Full cut sheet page" onPress={() => r.push(`/guide?keys=${focus.guides.map((g) => g.key).join(',')}&title=${encodeURIComponent(focus.label)}`)} />
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
      {status}
      {!!err && <Text style={{ color: C.redText, paddingHorizontal: S.md }}>{err}</Text>}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: S.md, paddingLeft: Math.max(S.md, insets.left), paddingRight: Math.max(S.md, insets.right), paddingBottom: Math.max(8, insets.bottom) }}>
        <View style={{ flex: 1, minWidth: 0 }} onLayout={(e) => setPaneH(Math.round(e.nativeEvent.layout.height))}>{map}</View>
        <View style={{ flex: 1, minWidth: 0, gap: S.sm }} onLayout={(e) => setRightH(Math.round(e.nativeEvent.layout.height))}>
          <Seg label="Right side" options={['Cut sheet', 'ERG 147'] as const} value={pane === 'Map' ? 'Cut sheet' : pane} onChange={setPane} />
          <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: S.block }}>{pane === 'ERG 147' ? erg : sheet}</ScrollView>
        </View>
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {strip}
      {status}
      <View style={{ paddingHorizontal: S.md }}><Seg label="Show" options={['Map', 'Cut sheet', 'ERG 147'] as const} value={pane} onChange={setPane} /></View>
      <ScrollView contentContainerStyle={{ padding: S.md, paddingBottom: insets.bottom + 40, gap: S.block }}>
        {!!err && <Text style={{ color: C.redText }}>{err}</Text>}
        {pane === 'Map' ? map : pane === 'ERG 147' ? erg : sheet}
      </ScrollView>
    </View>
  );
}

function Chip({ on, title, sub, onPress }: { on: boolean; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 60, minWidth: 150, maxWidth: 260, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.card, borderWidth: 2,
        borderColor: on ? '#FFF' : C.line, backgroundColor: on ? '#FFF' : pressed ? C.surface2 : C.surface, justifyContent: 'center' })}>
      <Text numberOfLines={1} style={{ color: on ? C.hazmatText : C.text, fontFamily: F.display, fontSize: 16 }}>{title}</Text>
      <Text numberOfLines={1} style={{ color: on ? C.hazmatText : C.muted, fontSize: 14 }}>{sub}</Text>
    </Pressable>
  );
}
