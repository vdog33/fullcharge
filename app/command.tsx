// Command view — the command-zone screen. iPad landscape: live map on the left (fire, zones, wind plume),
// the cut sheet or ERG 147 on the right, scenes along the top. Moving the fire or changing the wind on a shared
// scene updates every phone viewing it. On a phone the same parts stack with a switch.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Bullets, Chips, Input, Label, Muted, Seg, st } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { ZoneMap } from '../src/components/ZoneMap';
import { SheetItems } from '../src/components/SheetItems';
import { SheetZoom } from '../src/components/SheetZoom';
import { getWeather, Weather } from '../src/lib/weather';
import { Checkin, checkIn, CheckStatus, deviceId, listCheckins, watchCheckins } from '../src/lib/checkins';
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
import { ago, getMyUnit, setMyUnit, Incident, liveIncidents, myGroups, OPEN_ZONE, OPEN_ZONE_ID, updateIncident, watchIncidents } from '../src/lib/zone-share';
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
  // Draggable middle: how much of the width the map gets (0.25–0.75). Remembered on this device.
  const [split, setSplit] = useState(0.5);
  const rowW = useRef(1);
  const splitAtStart = useRef(0.5);
  const splitNow = useRef(0.5);
  splitNow.current = split; // the drag handler is made once, so it reads the current split from here
  useEffect(() => { AsyncStorage.getItem('fullcharge.commandSplit').then((v) => { const n = Number(v); if (n >= 0.25 && n <= 0.75) setSplit(n); }).catch(() => {}); }, []);
  const clampSplit = (x: number) => Math.min(0.75, Math.max(0.25, x));
  const dragSplit = (dx: number, start: boolean) => { if (start) splitAtStart.current = splitNow.current; setSplit(clampSplit(splitAtStart.current + dx / Math.max(1, rowW.current))); };
  const saveSplit = (x: number) => { setSplit(x); AsyncStorage.setItem('fullcharge.commandSplit', String(x)).catch(() => {}); };
  const endSplit = () => setSplit((x) => { AsyncStorage.setItem('fullcharge.commandSplit', String(x)).catch(() => {}); return x; });
  const [checks, setChecks] = useState<Checkin[]>([]);
  const [me, setMe] = useState<string>('');
  const [myUnit, setUnitState] = useState('');
  const [showWho, setShowWho] = useState(false);
  useEffect(() => { deviceId().then(setMe); getMyUnit().then(setUnitState); }, []);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const [focus, setFocus] = useState<Focus>({ label: 'Your location', guides: [], at: lastFix(), windFrom: null });
  const live = focus.incident;
  // Open beta zone: anyone can update. Invite-only zones: the unit that shared it.
  const canEdit = !!live && live.status === 'active' && (live.group_id === OPEN_ZONE_ID || (!!user && user.id === live.created_by));

  const [openedAt] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []); // scene clock

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

  // Who's on this scene — live.
  useEffect(() => {
    if (!live?.id) { setChecks([]); return; }
    const load = () => listCheckins(live.id).then(setChecks).catch(() => {});
    load();
    return watchCheckins(live.id, load);
  }, [live?.id]);
  const mine = checks.find((c) => c.device_id === me);
  const responding = checks.filter((c) => c.status === 'responding');
  async function choose(st: CheckStatus) {
    if (!live) return;
    if (st === 'responding' && !myUnit.trim()) return setErr('Type your unit first so the officer on scene knows who you are.');
    if (myUnit.trim()) setMyUnit(myUnit);
    try { await checkIn(live.id, st, myUnit); setChecks(await listCheckins(live.id)); setErr(''); } catch (e) { setErr((e as Error).message); }
  }

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

  // Dashboard tiles (option 5): temp · wind from · speed · gusts · scene clock. Wind tile opens the compass.
  const since = live ? Date.parse(live.created_at) : openedAt;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const clock = `${Math.floor(secs / 3600) ? `${Math.floor(secs / 3600)}:` : ''}${String(Math.floor((secs % 3600) / 60)).padStart(Math.floor(secs / 3600) ? 2 : 1, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const wxAge = wx ? Math.max(0, Math.round((Date.now() - wx.observedAt) / 60000)) : 0;
  const editWind = !live || canEdit;
  const tiles = (
    <View style={{ gap: 6, paddingHorizontal: S.md, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Tile label="Temp" value={wx?.tempF != null ? `${wx.tempF}°F` : '—'} sub={wx ? `${wx.source.replace('Open-Meteo model', 'Model')} · ${wxAge < 1 ? 'now' : `${wxAge} min`}` : 'No weather yet'} />
        <Tile label="Wind from" value={focus.windFrom != null ? toCompass(focus.windFrom) : 'Set'} sub={editWind ? (windOpen ? 'Tap to close' : 'Tap to change') : 'View only'}
          on={windOpen} onPress={editWind ? () => setWindOpen((x) => !x) : undefined} />
        <Tile label="Speed" value={wx?.windMph != null ? `${wx.windMph}` : '—'} unit="mph" />
        <Tile label="Gusts" value={wx?.gustMph != null ? `${wx.gustMph}` : '—'} unit="mph" />
        <Tile label={live ? 'Since shared' : 'Scene clock'} value={clock} mono />
      </View>
      {windOpen && <Chips label="Wind from" square options={COMPASS.map((c) => ({ key: c, label: c }))} value={focus.windFrom != null ? toCompass(focus.windFrom) : undefined}
        onChange={(c) => { setWind(c as Compass); setWindOpen(false); }} />}
    </View>
  );

  const who = live ? (
    <View style={{ paddingHorizontal: S.md, paddingBottom: 8, gap: 6 }}>
      {!mine ? (
        // Opened a shared scene: are you responding or just watching?
        <View style={{ borderWidth: 2, borderColor: C.hazmat, borderRadius: R.card, padding: 10, gap: 8, backgroundColor: C.warnBg }}>
          <Text style={{ color: C.text, fontFamily: F.display, fontSize: 18 }}>Are you responding or watching?</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <View style={{ flexBasis: 180, flexGrow: 1 }}><Input label="Your unit" placeholder="e.g. Vista E151" value={myUnit} onChangeText={setUnitState} /></View>
            <View style={{ flexBasis: 160, flexGrow: 1 }}><Btn tone="red" icon="nav" label="Responding" sub="Listed for the officer on scene" onPress={() => choose('responding')} /></View>
            <View style={{ flexBasis: 160, flexGrow: 1 }}><Btn tone="outline" icon="eye" label="Watching" sub="Just checking — not listed" onPress={() => choose('watching')} /></View>
          </View>
        </View>
      ) : null}
      <Pressable onPress={() => setShowWho((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: showWho }}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: C.green, fontFamily: F.display, fontSize: 15 }}>RESPONDING {responding.length}</Text>
        {responding.slice(0, showWho ? 99 : 8).map((c) => (
          <View key={c.device_id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#0F2A1A', borderWidth: 1, borderColor: '#2F7A4D' }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{c.unit || 'Unit not set'}{showWho ? ` · ${ago(c.updated_at)}` : ''}</Text>
          </View>
        ))}
        {!showWho && responding.length > 8 && <Text style={{ color: C.muted }}>+{responding.length - 8}</Text>}
        {mine && (
          <Pressable onPress={() => choose(mine.status === 'responding' ? 'watching' : 'responding')} accessibilityRole="button"
            style={{ marginLeft: 6, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>You: {mine.status === 'responding' ? 'Responding' : 'Watching'} · switch</Text>
          </Pressable>
        )}
      </Pressable>
      {showWho && <Muted>Self check-in, info only — Tablet Command / your MDC is the tracking system.</Muted>}
    </View>
  ) : null;

  const mapH = wide ? Math.max(300, paneH || height - insets.top - insets.bottom - 260) : Math.min(460, height * 0.55);
  const map = focus.at ? (
    <View style={{ height: mapH }}>
      <ZoneMap key={live?.id ?? 'mine'} fire={focus.at} you={lastFix()} mapType="satellite" height={mapH}
        plumeHeading={((focus.windFrom ?? 0) + 180) % 360} plumeHalfDeg={focus.windFrom != null ? ZONES.plume_day_spread_deg : 0}
        plumeLenM={focus.windFrom != null ? ZONES.plume_day_m : 0} onMoveFire={moveFire} />
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
      {who}
      {tiles}
      {!!err && <Text style={{ color: C.redText, paddingHorizontal: S.md }}>{err}</Text>}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', paddingLeft: Math.max(S.md, insets.left), paddingRight: Math.max(S.md, insets.right), paddingBottom: Math.max(8, insets.bottom) }}
        onLayout={(e) => { rowW.current = e.nativeEvent.layout.width; }}>
        <View style={{ flex: split, minWidth: 0 }} onLayout={(e) => setPaneH(Math.round(e.nativeEvent.layout.height))}>{map}</View>
        <Divider onDrag={dragSplit} onEnd={endSplit} onReset={() => saveSplit(0.5)} />
        <View style={{ flex: 1 - split, minWidth: 0, gap: S.sm }} onLayout={(e) => setRightH(Math.round(e.nativeEvent.layout.height))}>
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
      {who}
      {tiles}
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

function Tile({ label, value, unit, sub, on, mono, onPress }: { label: string; value: string; unit?: string; sub?: string; on?: boolean; mono?: boolean; onPress?: () => void }) {
  const fg = on ? C.hazmatText : C.text;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${label} ${value} ${unit ?? ''}. ${sub ?? ''}`}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: 110, minHeight: 72, paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.card, borderWidth: 2,
        borderColor: on ? '#FFF' : onPress ? C.hazmat : C.line, backgroundColor: on ? '#FFF' : pressed ? C.surface2 : C.warnBg, justifyContent: 'center' })}>
      <Text style={{ color: on ? C.hazmatText : C.hazmat, fontFamily: F.display, fontSize: 13, letterSpacing: 0.8 }} numberOfLines={1}>{label.toUpperCase()}</Text>
      <Text style={{ color: fg, fontFamily: F.black, fontSize: 28, lineHeight: 32, fontVariant: mono ? ['tabular-nums'] : undefined }} numberOfLines={1} adjustsFontSizeToFit>
        {value}{unit && value !== '—' ? <Text style={{ fontSize: 15, fontFamily: F.display }}> {unit}</Text> : null}
      </Text>
      {!!sub && <Text style={{ color: on ? C.hazmatText : C.muted, fontSize: 13 }} numberOfLines={1}>{sub}</Text>}
    </Pressable>
  );
}

/** The middle bar between map and cut sheet: drag left / right to resize; double-tap for 50/50. Wide grab area for gloves. */
function Divider({ onDrag, onEnd, onReset }: { onDrag: (dx: number, start: boolean) => void; onEnd: () => void; onReset: () => void }) {
  const lastTap = useRef(0);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const now = Date.now();
      if (now - lastTap.current < 300) onReset();
      lastTap.current = now;
      onDrag(0, true);
    },
    onPanResponderMove: (_e, g) => onDrag(g.dx, false),
    onPanResponderRelease: onEnd,
    onPanResponderTerminate: onEnd,
  })).current;
  return (
    <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Divider between map and cut sheet. Drag to resize, double-tap for half and half."
      style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 4, flex: 1, maxHeight: '100%', borderRadius: 2, backgroundColor: C.line }} />
      <View style={{ position: 'absolute', width: 28, height: 64, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 2, borderColor: C.text, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {[0, 1, 2].map((i) => <View key={i} style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: C.text }} />)}
      </View>
    </View>
  );
}
