// Command view — the command-zone screen. iPad landscape: live map on the left (fire, zones, wind plume),
// the cut sheet or ERG 147 on the right, scenes along the top. Moving the fire or changing the wind on a shared
// scene updates every phone viewing it. On a phone the same parts stack with a switch.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, PanResponder, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Bullets, Chips, Input, Label, Muted, Seg, st } from '../src/components/ui';
import { Icon } from '../src/components/Icon';
import { ZoneMap, ZoneMapHandle } from '../src/components/ZoneMap';
import { SheetItems } from '../src/components/SheetItems';
import { SheetZoom } from '../src/components/SheetZoom';
import { getWeather, Weather } from '../src/lib/weather';
import { Checkin, checkIn, CheckStatus, deviceId, listCheckins, watchCheckins } from '../src/lib/checkins';
import { ShareToZoneBtn } from '../src/components/ShareToZoneBtn';
import { useFacing } from '../src/lib/facing';
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
import { ago, endIncident, getMyUnit, isMine, setMyUnit, Incident, liveIncidents, myGroups, OPEN_ZONE, OPEN_ZONE_ID, updateIncident, watchIncidents } from '../src/lib/zone-share';
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

// How many command screens are open per incident (finding the vehicle stacks a second one on top).
// Only leaving the last one ends the incident.
const openCount = new Map<string, number>();

export default function Command() {
  const r = useRouter();
  const { incident: incidentId } = useLocalSearchParams<{ incident?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Side-by-side only when there's real height too (an iPhone Pro Max sideways is wide but short → stacked layout).
  const wide = width >= 700 && width > height && height >= 500;
  const [pane, setPane] = useState<'Cut sheet' | 'ERG 147' | 'Map'>(wide ? 'Cut sheet' : 'Map');
  const [paneH, setPaneH] = useState(0);
  const [rightH, setRightH] = useState(0);
  const [wx, setWx] = useState<Weather | null>(null);
  const [windOpen, setWindOpen] = useState(false);
  // Where the wind came from: weather (default), marked by facing it, picked by hand, or set by the sharing unit.
  const [windSrc, setWindSrc] = useState<'weather' | 'marked' | 'manual' | 'shared' | null>(null);
  const { facing, mark } = useFacing(windOpen); // compass runs only while the wind panel is open
  const [markMsg, setMarkMsg] = useState('');
  const [bodyH, setBodyH] = useState(0); // phone: room left for the map / sheet under the tabs
  const [resetN, setResetN] = useState(0); // bumps on divider double-tap → cut sheet fits again
  // Draggable middle: how much of the width the map gets (0.25–0.75). Remembered on this device.
  const [split, setSplit] = useState(0.5);
  const rowW = useRef(1);
  const splitNow = useRef(0.5);
  splitNow.current = split; // the drag handler is made once, so it reads the current split from here
  useEffect(() => { AsyncStorage.getItem('fullcharge.commandSplit').then((v) => { const n = Number(v); if (n >= 0.25 && n <= 0.75) setSplit(n); }).catch(() => {}); }, []);
  const clampSplit = (x: number) => Math.min(0.75, Math.max(0.25, x));
  const saveSplit = (x: number) => { setSplit(x); AsyncStorage.setItem('fullcharge.commandSplit', String(x)).catch(() => {}); };
  // Panes resize live as you drag. The cut sheet holds its size while dragging (so a zoomed sheet doesn't jump)
  // and fits the new width when you let go.
  const [dragging, setDragging] = useState(false);
  const splitAtStart = useRef(0.5);
  const dragSplit = (dx: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') { splitAtStart.current = splitNow.current; setDragging(true); return; }
    const x = clampSplit(splitAtStart.current + dx / Math.max(1, rowW.current));
    if (phase === 'move') setSplit(x); else { setDragging(false); saveSplit(x); }
  };
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
  const [mineInc, setMineInc] = useState(false); // this unit started it
  useEffect(() => { if (live?.id) isMine(live.id).then(setMineInc); }, [live?.id]);
  const runningMine = mineInc && live?.status === 'active';
  const [sureEnd, setSureEnd] = useState(false);
  const [placing, setPlacing] = useState(false);
  const mapRef = useRef<ZoneMapHandle>(null);
  const nav = useNavigation();
  const ending = useRef(false);
  async function doEnd() {
    if (!live) return;
    try { ending.current = true; await endIncident(live.id); r.replace('/'); } catch (e) { ending.current = false; setErr((e as Error).message); }
  }
  useEffect(() => {
    if (!live?.id) return;
    const id = live.id;
    openCount.set(id, (openCount.get(id) ?? 0) + 1);
    return () => { openCount.set(id, Math.max(0, (openCount.get(id) ?? 1) - 1)); };
  }, [live?.id]);
  // Only ever ONE Command screen. Share to zone (from inside Command), a notification or the incident list used to
  // push a second copy on top; Back then landed on the old copy and looked like it did nothing.
  useEffect(() => {
    type St = { routes: { key: string; name: string }[]; index: number };
    const st = nav.getState() as St | undefined;
    const me = st?.routes?.[st.index];
    if (!st || !me || !st.routes.some((rt) => rt.name === me.name && rt.key !== me.key)) return;
    nav.dispatch(((state: St) => {
      const routes = state.routes.filter((rt) => rt.name !== me.name || rt.key === me.key);
      return { type: 'RESET', payload: { ...state, routes, index: routes.length - 1 } };
    }) as never);
  }, []);
  // Backing out of your own running incident ends it — say so first.
  useEffect(() => {
    if (!runningMine) return;
    return nav.addListener('beforeRemove', (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (ending.current || (openCount.get(live!.id) ?? 0) > 1) return;
      e.preventDefault();
      Alert.alert('End this incident?', 'Leaving ends your incident for everyone in the zone.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'End incident', style: 'destructive', onPress: async () => {
          try { ending.current = true; await endIncident(live!.id); nav.dispatch(e.data.action as never); } catch (x) { ending.current = false; setErr((x as Error).message); }
        } },
      ]);
    });
  }, [runningMine, live?.id]);
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

  // Live: someone moved the fire, changed the wind, added the vehicle or ended it → my screen follows.
  useEffect(() => (user || OPEN_ZONE ? watchIncidents((i) => setFocus((f) => {
    if (f.incident?.id !== i.id) return f;
    const n = fromIncident(i);
    return { ...n, guides: n.guides.length ? n.guides : f.guides };
  })) : undefined), [user?.id]);

  // Weather at the fire: shown on the tiles, and fills the wind by standard when nobody has set it.
  useEffect(() => {
    const at = focus.at;
    if (!at) return;
    getWeather(at).then((w) => {
      if (!w) return;
      setWx(w);
      if (w.windFromDeg == null) return;
      setFocus((f) => {
        if (f.windFrom != null) return f;
        const inc = f.incident;
        if (inc && !(inc.group_id === OPEN_ZONE_ID || user?.id === inc.created_by)) return f; // view only: shown from wx below
        if (inc) updateIncident(inc.id, { wind_from_deg: w.windFromDeg! }).catch(() => {});
        setWindSrc('weather');
        return { ...f, windFrom: w.windFromDeg };
      });
    });
  }, [focus.at ? Math.round(focus.at.lat * 100) : null, focus.at ? Math.round(focus.at.lng * 100) : null, live?.id]);
  // What the tiles and plume use: the scene's wind, else the weather's (view-only screens too).
  const windDeg = focus.windFrom ?? wx?.windFromDeg ?? null;
  const windFromWx = focus.windFrom == null && windDeg != null;

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
  function setWind(deg: number, src: 'weather' | 'marked' | 'manual') {
    setWindSrc(src);
    setMarkMsg('');
    setFocus((f) => ({ ...f, windFrom: deg }));
    if (canEdit) updateIncident(live!.id, { wind_from_deg: deg }).catch((e) => setErr(e.message));
  }

  // Top bar (replaces the nav header to give the map and sheet the room): back, what, who, end.
  const goBack = () => (r.canGoBack() ? r.back() : r.replace('/'));
  const whoChips = live && mine ? (
    <>
      <Pressable onPress={() => setShowWho((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: showWho }}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: C.green, fontFamily: F.display, fontSize: 15 }}>APP CHECK-IN {responding.length}</Text>
        {responding.slice(0, showWho ? 99 : wide ? 6 : 3).map((c) => (
          <View key={c.device_id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#0F2A1A', borderWidth: 1, borderColor: '#2F7A4D' }}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{c.unit || 'Unit not set'}{showWho ? ` · ${ago(c.updated_at)}` : ''}</Text>
          </View>
        ))}
        {!showWho && responding.length > (wide ? 6 : 3) && <Text style={{ color: C.muted }}>+{responding.length - (wide ? 6 : 3)}</Text>}
        <Text style={{ color: C.muted, fontSize: 13 }}>(not dispatch)</Text>
      </Pressable>
      <Pressable onPress={() => choose(mine.status === 'responding' ? 'watching' : 'responding')} accessibilityRole="button"
        style={{ paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>You: {mine.status === 'responding' ? 'Coming' : 'Just looking'} · change</Text>
      </Pressable>
    </>
  ) : null;
  const status = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: S.md, paddingTop: insets.top + 4, paddingBottom: 6 }}>
      <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: pressed ? C.surface2 : C.surface })}>
        <Icon name="back" size={20} />
        {wide && <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>Back</Text>}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: live ? '#2A0B08' : C.surface }}>
        <Icon name={live ? 'users' : 'pin'} size={16} color={live ? C.redText : C.muted} />
        <Text style={{ color: live ? C.redText : C.muted, fontFamily: F.display, fontSize: 14 }}>{!live ? (wide ? 'MY SCENE — NOT SHARED' : 'NOT SHARED') : live.status === 'active' ? (wide ? 'SHARED — LIVE' : 'LIVE') : 'ENDED'}</Text>
      </View>
      <Text style={{ color: C.text, fontWeight: '700', fontSize: 16, flexShrink: 1 }} numberOfLines={1}>{focus.label}</Text>
      {live && wide && <Text style={{ color: C.muted, fontSize: 14 }}>shared {ago(live.created_at)}{live && !canEdit ? ` · ${live.status === 'active' ? 'view only' : 'ended'}` : ''}</Text>}
      {wide && whoChips}
      {live && canEdit && (
        <Pressable onPress={() => (sureEnd ? doEnd() : (setSureEnd(true), setTimeout(() => setSureEnd(false), 4000)))} accessibilityRole="button"
          style={({ pressed }) => ({ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 8,
            borderWidth: 2, borderColor: C.redText, backgroundColor: sureEnd ? C.red : pressed ? C.surface2 : 'transparent' })}>
          <Icon name="x" size={16} color={sureEnd ? '#FFF' : C.redText} />
          <Text style={{ color: sureEnd ? '#FFF' : C.redText, fontFamily: F.display, fontSize: 15 }}>{sureEnd ? 'TAP AGAIN TO END' : wide ? 'END INCIDENT' : 'END'}</Text>
        </Pressable>
      )}
    </View>
  );

  // Dashboard tiles (option 5): temp · wind from · speed · gusts · scene clock. Wind tile opens the wind panel.
  const since = live ? Date.parse(live.created_at) : openedAt;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const clock = `${Math.floor(secs / 3600) ? `${Math.floor(secs / 3600)}:` : ''}${String(Math.floor((secs % 3600) / 60)).padStart(Math.floor(secs / 3600) ? 2 : 1, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const editWind = !live || canEdit;
  const srcTag = windDeg == null ? undefined : windFromWx || windSrc === 'weather' ? 'wx' : windSrc === 'marked' ? 'marked' : windSrc === 'manual' ? 'set' : undefined;
  const windTile = <Tile compact={!wide} label={editWind ? 'Wind from ▾' : 'Wind from'} value={windDeg != null ? toCompass(windDeg) : wx?.windMph === 0 ? 'Calm' : 'Set'} unit={srcTag}
    on={windOpen} onPress={editWind ? () => { setMarkMsg(''); setWindOpen((x) => !x); } : undefined} />;
  const gust = wx?.gustMph != null && wx.gustMph > (wx.windMph ?? 0) ? wx.gustMph : null;
  function doMark() {
    const m = mark();
    if ('err' in m) return setMarkMsg(m.err);
    setWind(m.deg, 'marked');
    setWindOpen(false);
  }
  const windPanel = windOpen ? (
    <View style={{ borderWidth: 2, borderColor: C.hazmat, borderRadius: R.card, padding: 8, gap: 8, backgroundColor: C.warnBg }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexBasis: 260, flexGrow: 2 }}>
          <Btn tone="red" icon="nav" disabled={!facing} reason="No compass reading — tap a direction below."
            label={facing ? `Mark wind from ${toCompass(facing.deg)} · ${Math.round(facing.deg)}°` : 'Mark wind direction'}
            sub="Face into the wind, hold it flat, tap" onPress={doMark} />
        </View>
        {wx?.windFromDeg != null && (
          <View style={{ flexBasis: 160, flexGrow: 1 }}>
            <Btn tone="outline" label={`Use weather · ${toCompass(wx.windFromDeg)}`} sub={wx.source} onPress={() => { setWind(wx.windFromDeg!, 'weather'); setWindOpen(false); }} />
          </View>
        )}
      </View>
      {!!markMsg && <Text style={{ color: C.hazmat, fontWeight: '700', fontSize: 16 }}>{markMsg}</Text>}
      <Chips label="Wind from" square options={COMPASS.map((c) => ({ key: c, label: c }))} value={windDeg != null ? toCompass(windDeg) : undefined}
        onChange={(c) => { setWind(compassDeg(c as Compass), 'manual'); setWindOpen(false); }} />
    </View>
  ) : null;
  const tiles = wide ? (
    <View style={{ gap: 6, paddingHorizontal: S.md, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Tile label="Temp" value={wx?.tempF != null ? `${wx.tempF}°F` : '—'} />
        {windTile}
        <Tile label="Speed" value={wx?.windMph != null ? `${wx.windMph}` : '—'} unit="mph" />
        <Tile label="Gusts" value={gust != null ? `${gust}` : '—'} unit="mph" />
        <Tile label={live ? 'Since shared' : 'Scene clock'} value={clock} mono />
      </View>
      {windPanel}
    </View>
  ) : (
    <View style={{ gap: 6, paddingHorizontal: S.md, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {windTile}
        <Tile compact label="Wind" value={wx?.windMph != null ? `${wx.windMph}${gust != null ? `-${gust}` : ''}` : '—'} unit="mph" />
        <Tile compact label="Temp" value={wx?.tempF != null ? `${wx.tempF}°` : '—'} />
        <Tile compact label={live ? 'Shared' : 'Clock'} value={clock} mono />
      </View>
      {windPanel}
    </View>
  );

  // Opened a shared scene: coming, or just looking? (Shown until you pick.) Worded so nobody mistakes it for
  // dispatch / Tablet Command data — it's only who tapped in on this app.
  const ask = live && !mine ? (
    <View style={{ marginHorizontal: S.md, marginBottom: 6, borderWidth: 2, borderColor: C.hazmat, borderRadius: R.card, padding: 10, gap: 8, backgroundColor: C.warnBg }}>
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 18 }}>Coming to this scene, or just looking?</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <View style={{ flexBasis: 180, flexGrow: 1 }}><Input label="Your unit" placeholder="e.g. Vista E151" value={myUnit} onChangeText={setUnitState} /></View>
        <View style={{ flexBasis: 140, flexGrow: 1 }}><Btn tone="red" icon="nav" label="I'm coming" sub="Shows your unit here · app only" onPress={() => choose('responding')} /></View>
        <View style={{ flexBasis: 140, flexGrow: 1 }}><Btn tone="outline" icon="eye" label="Just looking" sub="Not shown" onPress={() => choose('watching')} /></View>
      </View>
    </View>
  ) : null;
  const whoRow = !wide && whoChips ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: S.md, paddingBottom: 6 }}>{whoChips}</View>
  ) : null;

  const mapH = wide ? Math.max(300, paneH || height - insets.top - insets.bottom - 180) : Math.max(240, bodyH || height * 0.5);
  const map = focus.at ? (
    <View style={{ height: mapH }}>
      <ZoneMap ref={mapRef} key={live?.id ?? 'mine'} fire={focus.at} you={lastFix()} mapType="satellite" height={mapH}
        plumeHeading={((windDeg ?? 0) + 180) % 360} plumeHalfDeg={windDeg != null ? ZONES.plume_day_spread_deg : 0}
        plumeLenM={windDeg != null ? ZONES.plume_day_m : 0} onMoveFire={moveFire} tapToPlace={placing} />
      {/* Map buttons: move the fire (tap where it is) and jump back to the scene. */}
      <View style={{ position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 8 }} pointerEvents="box-none">
        {(!live || canEdit) && (
          <Pressable onPress={() => setPlacing((x) => !x)} accessibilityRole="button" accessibilityState={{ selected: placing }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 12, borderRadius: 8, backgroundColor: placing ? '#FFF' : 'rgba(0,0,0,0.8)', borderWidth: 2, borderColor: placing ? '#FFF' : C.hazmat }}>
            <Icon name={placing ? 'check' : 'fire'} size={18} color={placing ? C.hazmatText : C.hazmat} />
            <Text style={{ color: placing ? C.hazmatText : C.text, fontWeight: '700', fontSize: 16 }}>{placing ? 'Done' : 'Move fire'}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => mapRef.current?.frame(ZONES.warm_m)} accessibilityRole="button" accessibilityLabel="Back to the scene"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.8)', borderWidth: 2, borderColor: C.line }}>
          <Icon name="target" size={18} />
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>Back to scene</Text>
        </Pressable>
      </View>
      {placing && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 8, alignItems: 'center' }}>
          <Text style={{ color: C.hazmatText, backgroundColor: C.hazmat, fontWeight: '700', fontSize: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' }}>
            Tap the map where the fire is{live ? ' — everyone sees it' : ''}
          </Text>
        </View>
      )}
    </View>
  ) : <Muted>Waiting for your location…</Muted>;

  const openFull = () => r.push(`/guide?keys=${focus.guides.map((g) => g.key).join(',')}&title=${encodeURIComponent(focus.label)}`);
  // Full cut sheet page: a small button beside the tabs (was a big button under the sheet that got cut off).
  const fullBtn = focus.guides.length ? (
    <Pressable onPress={openFull} accessibilityRole="button" accessibilityLabel="Open the full cut sheet page"
      style={({ pressed }) => ({ minHeight: 56, minWidth: 56, paddingHorizontal: wide ? 14 : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: pressed ? C.surface2 : C.surface })}>
      <Icon name="book" size={20} />
      {wide && <Text style={{ color: C.text, fontFamily: F.display, fontSize: 15 }}>Full page</Text>}
    </Pressable>
  ) : null;
  const sheetH = wide ? Math.max(320, rightH) : Math.max(280, bodyH);
  const sheet = (
    <View style={{ gap: S.block }}>
      {!live && focus.ref && <ShareToZoneBtn vehicleRef={focus.ref} title={focus.label} />}
      {focus.guides.length ? <>
        <SheetZoom key={`z${resetN}`} guides={focus.guides} height={sheetH} freeze={dragging} />
        <SheetItems guides={focus.guides} />
      </> : <Btn icon="search" label="Find the vehicle" onPress={() => r.push('/search')} />}
    </View>
  );
  const erg = (
    <View style={{ gap: S.block }}>
      <Btn tone="hazmat" icon="book" label="Guide 147 PDF" sub="Official ERG page" onPress={() => r.push('/pdf?guide=147')} />
      <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>ERG Guide 147 — lithium-ion</Text>
      {GUIDE_147_SECTIONS.slice(0, 4).map((g) => <View key={g.h} style={{ gap: 4 }}><Label>{g.h}</Label><Bullets items={g.lines} size={17} /></View>)}
      <Btn tone="outline" icon="book" label="All of Guide 147 (text)" onPress={() => r.push('/guide147')} />
    </View>
  );
  // Double-tap the middle handle: half and half, map back on the fire, cut sheet fitted again.
  function recenter() {
    saveSplit(0.5);
    setResetN((n) => n + 1);
    setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 350); // after the panes have resized
  }

  if (wide) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {status}
      {ask}
      {tiles}
      {!!err && <Text style={{ color: C.redText, paddingHorizontal: S.md }}>{err}</Text>}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', paddingLeft: Math.max(S.md, insets.left), paddingRight: Math.max(S.md, insets.right), paddingBottom: Math.max(8, insets.bottom) }}
        onLayout={(e) => { rowW.current = e.nativeEvent.layout.width; }}>
        <View style={{ flex: split, minWidth: 0 }} onLayout={(e) => setPaneH(Math.round(e.nativeEvent.layout.height))}>{map}</View>
        <Divider onDrag={dragSplit} onReset={recenter} active={dragging} />
        <View style={{ flex: 1 - split, minWidth: 0, gap: S.sm }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Seg label="Right side" options={['Cut sheet', 'ERG 147'] as const} value={pane === 'Map' ? 'Cut sheet' : pane} onChange={setPane} /></View>
            {pane !== 'ERG 147' && fullBtn}
          </View>
          <View style={{ flex: 1 }} onLayout={(e) => setRightH(Math.round(e.nativeEvent.layout.height))}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: S.block }}>{pane === 'ERG 147' ? erg : sheet}</ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
  // iPhone: compact bar, one row of tiles, tabs, then the map / sheet fills the rest of the screen.
  // The map is NOT inside a scroll view, so panning the map never scrolls the page.
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {status}
      {whoRow}
      {ask}
      {tiles}
      {!!err && <Text style={{ color: C.redText, paddingHorizontal: S.md }}>{err}</Text>}
      <View style={{ paddingHorizontal: S.md, paddingBottom: 6, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Seg label="Show" options={['Map', 'Cut sheet', 'ERG 147'] as const} value={pane} onChange={setPane} /></View>
        {pane === 'Cut sheet' && fullBtn}
      </View>
      <View style={{ flex: 1, paddingHorizontal: S.md, paddingBottom: Math.max(8, insets.bottom) }} onLayout={(e) => setBodyH(Math.round(e.nativeEvent.layout.height) - Math.max(8, insets.bottom))}>
        {pane === 'Map' ? map : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24, gap: S.block }}>{pane === 'ERG 147' ? erg : sheet}</ScrollView>
        )}
      </View>
    </View>
  );
}

/** Small weather tile: label and value on one line, so the map keeps the room. */
function Tile({ label, value, unit, on, mono, onPress, compact }: { label: string; value: string; unit?: string; on?: boolean; mono?: boolean; onPress?: () => void; compact?: boolean }) {
  const fg = on ? C.hazmatText : C.text;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${label} ${value} ${unit ?? ''}`}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: compact ? 60 : 100, minWidth: 0, minHeight: compact ? 52 : 48, flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'center', justifyContent: 'center',
        gap: compact ? 0 : 8, paddingHorizontal: compact ? 8 : 10, borderRadius: 8, borderWidth: 1.5,
        borderColor: on ? '#FFF' : onPress ? C.hazmat : C.border, backgroundColor: on ? '#FFF' : pressed ? C.surface2 : C.warnBg })}>
      <Text style={{ color: on ? C.hazmatText : C.hazmat, fontFamily: F.display, fontSize: compact ? 11 : 12, letterSpacing: 0.6 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label.toUpperCase()}</Text>
      <Text style={{ color: fg, fontFamily: F.black, fontSize: compact ? 18 : 20, fontVariant: mono ? ['tabular-nums'] : undefined }} numberOfLines={1} adjustsFontSizeToFit>
        {value}{unit && value !== '—' ? <Text style={{ fontSize: 13, fontFamily: F.display }}> {unit}</Text> : null}
      </Text>
    </Pressable>
  );
}

/** The middle bar between map and cut sheet: drag left / right (panes follow live); double-tap = 50/50 + recenter both. */
function Divider({ onDrag, onReset, active }: { onDrag: (dx: number, phase: 'start' | 'move' | 'end') => void; onReset: () => void; active: boolean }) {
  const lastTap = useRef(0);
  const cb = useRef(onDrag);
  cb.current = onDrag; // the responder is made once; always call the latest handler
  const reset = useRef(onReset);
  reset.current = onReset;
  // The second tap of a double-tap is NOT a drag: before, it started a drag from the old split and saved that back
  // on release, which undid the 50/50 reset.
  const skip = useRef(false);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // keep the drag even if the finger crosses the map
    onPanResponderGrant: () => {
      const now = Date.now();
      if (now - lastTap.current < 400) { lastTap.current = 0; skip.current = true; reset.current(); return; }
      lastTap.current = now;
      skip.current = false;
      cb.current(0, 'start');
    },
    onPanResponderMove: (_e, g) => { if (!skip.current) cb.current(g.dx, 'move'); },
    onPanResponderRelease: (_e, g) => { if (skip.current) { skip.current = false; return; } cb.current(g.dx, 'end'); },
    onPanResponderTerminate: (_e, g) => { if (skip.current) { skip.current = false; return; } cb.current(g.dx, 'end'); },
  })).current;
  return (
    <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Divider between map and cut sheet. Drag to resize, double-tap for half and half and recenter."
      style={{ width: 32, alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      <View style={{ width: active ? 6 : 4, flex: 1, borderRadius: 3, backgroundColor: active ? C.hazmat : C.line }} />
      <View style={{ position: 'absolute', width: 28, height: 64, borderRadius: 14, backgroundColor: active ? C.hazmat : C.surface2, borderWidth: 2, borderColor: C.text, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {[0, 1, 2].map((i) => <View key={i} style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: active ? C.hazmatText : C.text }} />)}
      </View>
    </View>
  );
}
