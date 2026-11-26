import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getWeather, Weather, weatherLine } from '../src/lib/weather';
import { WindSource } from '../src/lib/scene';
import { WeatherChip } from '../src/components/WeatherChip';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, H2, Icon, Input, Label, Muted, Notice, Screen, Seg, st, useJump } from '../src/components/ui';
import { ZoneDiagram } from '../src/components/ZoneDiagram';
import { ZoneMap, ZoneMapHandle } from '../src/components/ZoneMap';
import { chemFamily, getBess, getVehicle, ZONES } from '../src/data/catalog';
import { angleDiff, bearingDeg, circularMean, Compass, distanceM, LatLng, M_TO_FT, offsetM, plumeHeading, toCompass } from '../src/lib/geo';
import { getScene, setScene } from '../src/lib/scene';
import { Fix, lastFix, onFix, quickFix, sharpen } from '../src/lib/here';
import { C, F, R, S, TARGET } from '../src/theme';

type Mode = 'Satellite' | 'Map' | 'Diagram';
type Zoom = 'Hot' | 'Warm' | 'Cold';
const VIRTUAL_ORIGIN: LatLng = { lat: 39.5, lng: -98.35 }; // maths only when there is no fix — never shown
const FRAME_H = 420;
// Diagram view half-widths (m) and map frame radii (m) for the zoom-to buttons.
const DIAGRAM_M: Record<Zoom, number> = { Hot: 60, Warm: 140, Cold: 560 };
const FRAME_M: Record<Zoom, number> = { Hot: ZONES.hot_m * 2, Warm: ZONES.warm_m, Cold: ZONES.cold_m };
// Compass laid out like a compass (F9). null = centre arrow.
const GRID: (Compass | null)[] = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];

export default function Zones() {
  const { kind, id } = useLocalSearchParams<{ kind?: 'vehicle' | 'bess'; id?: string }>();
  const name = kind === 'vehicle' && id ? getVehicle(id)?.model : kind === 'bess' && id ? getBess(id)?.name : null;
  const chem = kind && id ? chemFamily(kind, id) : null;
  const net = useNetInfo();
  const { ref, mark, go } = useJump();
  // Map fits the screen sideways too (landscape): never taller than ~70% of the window.
  const { height: winH } = useWindowDimensions();
  const mapH = Math.max(260, Math.min(FRAME_H, Math.round(winH * 0.7)));

  // Environment — shared with the Hazmat ERG 147 map snapshot.
  const sc0 = getScene();
  const [night, setNight] = useState(sc0.night);
  const [windFrom, setWindFrom] = useState<Compass>(sc0.windFrom);
  const [windMph, setWindMph] = useState(sc0.windMph);
  const [windDeg, setWindDeg] = useState<number | null>(sc0.windDeg); // set by "Face the wind" → Mark
  // Face the wind is the standard way to set wind; Manual is the backup (no compass, or hands full).
  const [windMode, setWindMode] = useState<'Manual' | 'Face the wind'>('Face the wind');
  const [markedAt, setMarkedAt] = useState<number | null>(null);
  const [markMsg, setMarkMsg] = useState('');
  const [windSource, setWindSource] = useState<WindSource>(sc0.windSource);
  const [wx, setWx] = useState<Weather | null>(null);
  useEffect(() => { setScene({ night, windFrom, windDeg, windMph, windSource }); }, [night, windFrom, windDeg, windMph, windSource]);

  // Location
  const fix0 = lastFix();
  const [you, setYou] = useState<(LatLng & { acc?: number }) | null>(fix0 ? { lat: fix0.lat, lng: fix0.lng, acc: fix0.acc } : null);
  const [gpsMsg, setGpsMsg] = useState('');
  // Fire point: your location by default; an address when responding to a call.
  const [addr, setAddr] = useState('');
  const [addrMsg, setAddrMsg] = useState('');
  const [atAddr, setAtAddr] = useState<string | null>(null); // the address the fire marker is on, if any
  const [fire, setFire] = useState<LatLng>(fix0 ? { lat: fix0.lat, lng: fix0.lng } : VIRTUAL_ORIGIN);
  const [placed, setPlaced] = useState(!!fix0); // fire is on a real point (GPS or address)
  const fireReal = placed;
  const [nudge, setNudge] = useState(false);
  const atAddrRef = useRef<string | null>(null);
  atAddrRef.current = atAddr;

  // Map
  const [mode, setMode] = useState<Mode>('Satellite');
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const mapRef = useRef<ZoneMapHandle>(null);

  // Fire follows your position until someone moves it or types an address.
  const auto = useRef(true);
  const applyFix = (f: Fix) => {
    setYou({ lat: f.lat, lng: f.lng, acc: f.acc });
    if (auto.current && !atAddrRef.current) { setFire({ lat: f.lat, lng: f.lng }); setPlaced(true); }
  };
  async function locate() {
    auto.current = true;
    const cached = lastFix();
    if (cached) applyFix(cached); // map shows at once — no blank wait for GPS
    setGpsMsg(cached ? '' : 'Getting fix…');
    const q = await quickFix();
    if (q === 'denied') return setGpsMsg('Location denied. Type an address, or zones still work around the fire marker.');
    if (q) { applyFix(q); setGpsMsg(''); }
    const f = await sharpen();
    if (f) { applyFix(f); setGpsMsg(''); } else if (!q) setGpsMsg('No fix yet. Type an address, or zones still work around the fire marker.');
  }
  useEffect(() => onFix(applyFix), []);
  useEffect(() => { locate(); }, []);

  /** Responding to a call: put the fire on an address (Apple's geocoder — needs signal). */
  async function findAddress() {
    const q = addr.trim();
    if (!q) return;
    setAddrMsg('Finding…');
    try {
      const hits = await Location.geocodeAsync(q);
      if (!hits.length) return setAddrMsg('Address not found — check it, or drag the fire on the map.');
      const p = { lat: hits[0].latitude, lng: hits[0].longitude };
      auto.current = false; setFire(p); setPlaced(true); setAtAddr(q); setAddrMsg('');
      setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 80);
    } catch { setAddrMsg('Address lookup needs signal. Zones still work around your location.'); }
  }
  function backToMe() {
    setAtAddr(null); setAddr(''); setAddrMsg(''); auto.current = true; atAddrRef.current = null;
    if (you) { setFire({ lat: you.lat, lng: you.lng }); setPlaced(true); setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 50); }
    else locate();
  }

  const offline = net.isConnected === false || net.isInternetReachable === false;
  const live = mode !== 'Diagram' && fireReal && !offline;
  const note = mode !== 'Diagram' && !live
    ? (!fireReal ? 'No GPS fix yet — showing the zone diagram. Enter an address or wait for a fix.' : 'No signal — showing the zone diagram. The map needs signal.')
    : '';

  const plumeM = night ? ZONES.plume_night_m : ZONES.plume_day_m;
  const spread = night ? ZONES.plume_night_spread_deg : ZONES.plume_day_spread_deg;
  const heading = windDeg !== null ? (windDeg + 180) % 360 : plumeHeading(windFrom);
  const heads = toCompass(heading);
  const windLabel = windDeg !== null ? `${toCompass(windDeg)} ${Math.round(windDeg)}°` : windFrom;
  const moveFire = useCallback((p: LatLng) => { auto.current = false; setFire(p); }, []);
  const step = (e: number, n: number) => { auto.current = false; setFire((f) => offsetM(f, e, n)); };
  const distFt = you && fireReal ? distanceM(you, fire) * M_TO_FT : null;
  const brg = you && fireReal ? bearingDeg(you, fire) : null;
  const far = distFt !== null && distFt > 150; // fire isn't where you're standing (address or moved)
  // Phone compass: which way the responder is facing. Face into the wind, tap once, and "Wind from" is set.
  const [facing, setFacing] = useState<{ deg: number; acc: number } | null>(null);
  const lastDeg = useRef(-999);
  const recent = useRef<{ t: number; d: number }[]>([]); // last ~1.5 s of raw readings, for Mark
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || !alive) return;
        sub = await Location.watchHeadingAsync((h) => {
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (deg < 0) return;
          const now = Date.now();
          recent.current.push({ t: now, d: deg });
          while (recent.current.length && now - recent.current[0].t > 1500) recent.current.shift();
          // Only re-render on a real turn (≥3°) — keeps the map smooth.
          if (Math.abs(((deg - lastDeg.current + 540) % 360) - 180) < 3) return;
          lastDeg.current = deg;
          setFacing({ deg, acc: h.accuracy }); // accuracy = calibration level 0–3 (3 = best)
        });
        if (!alive) sub?.remove();
      } catch { /* no compass on this device */ }
    })();
    return () => { alive = false; sub?.remove(); };
  }, [!!you]); // retry once location permission is granted
  const facingDir = facing ? toCompass(facing.deg) : null;

  /** Lock the wind direction to where the phone points — only if it was held steady for the last second. */
  function markWind() {
    setMarkMsg('');
    const now = Date.now();
    const pts = recent.current.filter((x) => now - x.t <= 1000).map((x) => x.d);
    if (pts.length < 2 && facing) pts.push(facing.deg);
    if (!pts.length) return setMarkMsg('No compass reading yet — hold the phone flat and try again.');
    const mean = circularMean(pts);
    const wobble = Math.max(...pts.map((d) => angleDiff(d, mean)));
    if (wobble > 25) return setMarkMsg('Phone moving — hold still and tap Mark again.');
    setWindDeg(mean);
    setWindFrom(toCompass(mean));
    setMarkedAt(now);
    setWindSource('marked');
  }

  // Weather at the scene fills the wind automatically (temp, speed, direction). Facing the wind or picking by hand overrides it.
  useEffect(() => {
    if (!you) return;
    getWeather(you).then((w) => {
      if (!w) return;
      setWx(w);
      setScene({ tempF: w.tempF, weatherNote: `${weatherLine(w)} · ${w.source}` });
      if (getScene().windSource === 'none' || getScene().windSource === 'weather') {
        if (w.windFromDeg != null) { setWindDeg(w.windFromDeg); setWindFrom(toCompass(w.windFromDeg)); }
        if (w.windMph != null) setWindMph(Math.round(w.windMph));
        setWindSource('weather');
      }
    });
  }, [you ? Math.round(you.lat * 100) : null, you ? Math.round(you.lng * 100) : null]);

  const pickZoom = (z: Zoom) => { setZoom(z); if (live) mapRef.current?.frame(FRAME_M[z]); };

  return (
    <Screen ref={ref}>
      {name && <Notice tone="info" icon="batt" title={name}>{`${chem?.label ?? ''}\nUnsure of chemistry? Use the largest zone.`}</Notice>}

      {/* One card: map type, map, zoom, wind, speed, light, legend, caveat — change wind, watch the plume move (F33). */}
      <View style={s.card}>
        {/* Where: your location by default. Responding to a call? Type the address. */}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="loc" size={20} color={atAddr ? C.hazmat : C.green} />
            <Text style={[st.body, { flex: 1, fontSize: 17, fontWeight: '700' }]} numberOfLines={2}>
              {atAddr ? `Fire at ${atAddr}` : you ? `Fire at your location${you.acc ? ` (±${Math.round(you.acc)} m)` : ''}` : gpsMsg || 'Finding your location…'}
            </Text>
            {(atAddr || (you && far)) && <Btn size="sm" icon="pin" label="Back to me" onPress={backToMe} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Input label="Responding to a call? Address" placeholder="e.g. 400 Main St" value={addr} onChangeText={setAddr}
                returnKeyType="search" onSubmitEditing={findAddress} autoCorrect={false} />
            </View>
            <Btn size="sm" tone="hazmat" icon="search" label="Go" disabled={!addr.trim()} onPress={findAddress} />
          </View>
          {!!addrMsg && <Muted>{addrMsg}</Muted>}
          {fireReal && far && distFt !== null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.coord, { flex: 1 }]}>{distFt >= 5280 ? `${(distFt / 5280).toFixed(1)} mi` : `${Math.round(distFt)} ft`} from you · {toCompass(brg!)}</Text>
              <Btn size="sm" icon="nav" label="Directions" onPress={() => Linking.openURL(`http://maps.apple.com/?daddr=${fire.lat},${fire.lng}`)} />
            </View>
          )}
        </View>

        <Seg label="Map type" options={['Satellite', 'Map', 'Diagram'] as const} value={mode} onChange={setMode} />
        {!!note && <Muted>{note}</Muted>}

        <View style={{ borderRadius: R.inner, overflow: 'hidden' }}>
          {live ? (
            <ZoneMap ref={mapRef} fire={fire} you={you} mapType={mode === 'Satellite' ? 'satellite' : 'standard'}
              plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={mapH} onMoveFire={moveFire} />
          ) : (
            <ZoneDiagram fire={fire} you={you} plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={mapH}
              onMoveFire={moveFire} viewM={DIAGRAM_M[zoom ?? 'Cold']} />
          )}
          <View style={s.badges} pointerEvents="box-none">
            <View style={{ gap: 6 }} pointerEvents="none">
              <View style={s.badge}><Icon name="nav" size={16} /><Text style={s.badgeText}>{windLabel} wind · plume {heads}</Text></View>
              {facingDir && <View style={s.badge}><Icon name="loc" size={16} /><Text style={s.badgeText}>You face {facingDir}</Text></View>}
            </View>
            <Pressable onPress={() => go('caveat')} accessibilityRole="button" accessibilityLabel="Planning estimate — read the caveat" style={s.pe}>
              <Icon name="warn" size={16} color={C.hazmatText} /><Text style={[s.badgeText, { color: C.hazmatText }]}>Planning estimate</Text>
            </Pressable>
          </View>
          {/* Nudge lives on the map: tap Move, then the arrows (25 m a tap). */}
          <View style={s.moveWrap} pointerEvents="box-none">
            {nudge && (
              <View style={s.pad}>
                <View style={s.padRow}><View style={s.padGap} /><Nudge l="N" onPress={() => step(0, 25)} /><View style={s.padGap} /></View>
                <View style={s.padRow}><Nudge l="W" onPress={() => step(-25, 0)} /><View style={[s.padGap, { alignItems: 'center', justifyContent: 'center' }]}><Text style={s.padHint}>25 m</Text></View><Nudge l="E" onPress={() => step(25, 0)} /></View>
                <View style={s.padRow}><View style={s.padGap} /><Nudge l="S" onPress={() => step(0, -25)} /><View style={s.padGap} /></View>
              </View>
            )}
            <Pressable onPress={() => setNudge((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: nudge }}
              accessibilityLabel={nudge ? 'Done moving the fire' : 'Move the fire marker'} style={[s.moveBtn, nudge && { backgroundColor: '#FFF' }]}>
              <Icon name={nudge ? 'check' : 'pin'} size={16} color={nudge ? C.hazmatText : '#FFF'} />
              <Text style={[s.zoomText, nudge && { color: C.hazmatText }]}>{nudge ? 'Done' : 'Move fire'}</Text>
            </Pressable>
          </View>
          <View style={s.zoom} accessibilityRole="radiogroup" accessibilityLabel="Zoom map to">
            {(['Hot', 'Warm', 'Cold'] as Zoom[]).map((z) => {
              const on = zoom === z;
              return (
                <Pressable key={z} onPress={() => pickZoom(z)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[s.zoomBtn, on && { backgroundColor: '#FFF' }]}>
                  {on && <Icon name="check" size={14} color={C.hazmatText} />}
                  <Text style={[s.zoomText, on && { color: C.hazmatText }]}>{z}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Muted style={{ paddingHorizontal: 4 }}>{live ? 'Drag FIRE, long-press, or tap Move fire.' : 'Drag or tap to move the fire, or tap Move fire.'}</Muted>

        {wx && <WeatherChip w={wx} using={windSource === 'weather'} />}
        <Seg label="Set wind by" options={['Manual', 'Face the wind'] as const} value={windMode} onChange={setWindMode} />

        {windMode === 'Manual' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <View style={s.compass} accessibilityRole="radiogroup" accessibilityLabel="Wind from">
              {GRID.map((d, i) => d ? (
                <Pressable key={d} onPress={() => { setWindFrom(d); setWindDeg(null); setMarkedAt(null); setWindSource('manual'); }} accessibilityRole="radio"
                  accessibilityState={{ checked: windDeg === null && windFrom === d }} accessibilityLabel={`Wind from ${d}`}
                  style={[s.cell, windDeg === null && windFrom === d && { backgroundColor: '#FFF', borderColor: '#FFF' }]}>
                  <Text style={[s.cellText, windDeg === null && windFrom === d && { color: C.hazmatText }]}>{d}</Text>
                </Pressable>
              ) : (
                <View key={i} style={[s.cell, s.mid]} importantForAccessibility="no">
                  <View style={{ transform: [{ rotate: `${heading}deg` }] }}><Icon name="arrow" size={26} /></View>
                </View>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label>Wind from</Label>
              <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>{windLabel}</Text>
              <Text style={[st.body, { fontSize: 16 }]}>Plume heads {heads}.</Text>
              {windDeg !== null && <Text style={st.muted}>Marked by facing the wind. Tap a direction to set it by hand.</Text>}
            </View>
          </View>
        )}

        {windMode === 'Face the wind' && (
          <View style={{ gap: S.md }}>
            <Text style={[st.body, { fontSize: 17 }]}>Face into the wind, phone flat, top edge forward. Tap Mark.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <View style={s.facingDial} importantForAccessibility="no">
                <Text style={s.facingN}>N</Text>
                <View style={{ transform: [{ rotate: `${facing?.deg ?? 0}deg` }], opacity: facing ? 1 : 0.35 }}><Icon name="arrow" size={40} /></View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }} accessibilityLiveRegion="polite">
                <Label>You're facing</Label>
                <Text style={{ color: C.text, fontFamily: F.black, fontSize: 30 }}>{facing ? `${facingDir} · ${Math.round(facing.deg)}°` : '—'}</Text>
                {!facing && <Text style={st.muted}>No compass — use Manual.</Text>}
                {!!facing && facing.acc <= 1 && <Text style={[st.muted, { color: C.hazmat }]}>Compass weak — away from the rig, figure-8 the phone.</Text>}
              </View>
            </View>
            <Btn big tone="red" icon="nav" disabled={!facing} reason="No compass reading — use Manual."
              label={facing ? `Mark wind from ${facingDir} · ${Math.round(facing.deg)}°` : 'Mark wind direction'} onPress={markWind} />
            {!!markMsg && <Notice tone="warn">{markMsg}</Notice>}
            {windDeg !== null && markedAt !== null && (
              <Notice tone="ok" icon="check" title={`Wind from ${windLabel}`}>
                {`Plume heads ${heads}. Marked ${new Date(markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
              </Notice>
            )}
            {windDeg !== null && markedAt === null && <Muted>Wind from {windLabel} (marked earlier).</Muted>}
          </View>
        )}

        <View style={s.stepper}>
          <Pressable onPress={() => { setWindMph((x) => Math.max(0, x - 5)); if (windSource === 'weather') setWindSource('manual'); }} accessibilityRole="button" accessibilityLabel="Decrease wind speed by 5" style={s.stepBtn}>
            <Text style={s.stepText}>−5</Text>
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: C.text, fontFamily: F.black, fontSize: 28 }} accessibilityLiveRegion="polite">
            {windMph} <Text style={{ fontSize: 16, color: C.muted, fontFamily: F.displayBold }}>mph</Text>
          </Text>
          <Pressable onPress={() => { setWindMph((x) => Math.min(80, x + 5)); if (windSource === 'weather') setWindSource('manual'); }} accessibilityRole="button" accessibilityLabel="Increase wind speed by 5" style={s.stepBtn}>
            <Text style={s.stepText}>+5</Text>
          </Pressable>
        </View>
        {windMph >= 15 && <Notice tone="warn">{ZONES.fire_marker.wind.strong_wind_note}</Notice>}

        <Seg label="Light" options={['Day', 'Night'] as const} value={night ? 'Night' : 'Day'} onChange={(v) => setNight(v === 'Night')} />

        <View style={{ gap: 9, paddingHorizontal: 4 }} accessibilityLabel="Legend">
          <Legend kind="line" color={C.hot} b={`Hot ${ZONES.hot_ft} ft (${ZONES.hot_m} m)`} d="isolate, all directions" />
          <Legend kind="dash" color={C.gold} b={`Quarantine ${ZONES.quarantine_ft} ft`} d="structures + combustibles out" />
          <Legend kind="line" color={C.warm} b={`Warm ${ZONES.warm_ft} ft (${ZONES.warm_m} m)`} d="decon / staging at edge" />
          <Legend kind="line" color={C.cold} b={`Cold ${ZONES.cold_label} (${ZONES.cold_m} m)`} d="command, apparatus, public beyond" />
          <Legend kind="fill" color={C.plume} b={`Plume ${night ? 'night 1,000 ft (305 m) ±16°' : 'day 330 ft (100 m) ±32°'}`} d={ZONES.plume_gases.join(', ')} />
          <Legend kind="dot" color={C.you} b="YOU" />
        </View>

        <View onLayout={mark('caveat')}>
          <Notice tone="warn">
            <Text style={[st.body, { fontSize: 17 }]}>Planning estimate only — Guide 147 lists NO green-page distances. Minimums, not maximums. Confirm: Hazmat + live monitoring + wind. Unsure of chemistry? Use the largest zone.</Text>
            <Text style={st.muted}>Plume = planning value, not ERG Table 1. {ZONES.plume_note}</Text>
          </Notice>
        </View>
      </View>

    </Screen>
  );
}

const Nudge = ({ l, onPress }: { l: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Move fire 25 metres ${l}`}
    style={({ pressed }) => [s.padBtn, pressed && { backgroundColor: '#FFF' }]}>
    {({ pressed }) => <Text style={{ color: pressed ? C.hazmatText : '#FFF', fontFamily: F.display, fontSize: 18 }}>{l}</Text>}
  </Pressable>
);

function Legend({ kind, color, b, d }: { kind: 'line' | 'dash' | 'fill' | 'dot'; color: string; b: string; d?: string }) {
  const key = kind === 'dot'
    ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, marginLeft: 5, marginTop: 3 }} />
    : kind === 'fill'
      ? <View style={{ width: 26, height: 16, borderRadius: 3, backgroundColor: color, marginTop: 3 }} />
      : kind === 'dash'
        ? <View style={{ width: 26, height: 0, borderTopWidth: 4, borderStyle: 'dashed', borderColor: color, marginTop: 10 }} />
        : <View style={{ width: 26, height: 8, borderRadius: 4, backgroundColor: color, marginTop: 7 }} />;
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 26 }}>{key}</View>
      <Text style={[st.body, { flex: 1, fontSize: 16, lineHeight: 21 }]}>
        <Text style={{ fontFamily: F.display }}>{b}</Text>{d ? <Text style={{ color: C.muted }}> — {d}</Text> : null}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 2, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, padding: 8, gap: 12 },
  badges: { position: 'absolute', left: 8, right: 8, top: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.84)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  pe: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.hazmat, borderRadius: 9, paddingHorizontal: 12, minHeight: TARGET.min },
  zoom: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  moveWrap: { position: 'absolute', right: 8, bottom: 8 + TARGET.min + 8, alignItems: 'flex-end', gap: 6 },
  moveBtn: { minHeight: TARGET.min, paddingHorizontal: 12, borderRadius: R.inner, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(0,0,0,0.8)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  pad: { gap: 4, padding: 4, borderRadius: R.inner, backgroundColor: 'rgba(0,0,0,0.55)' },
  padRow: { flexDirection: 'row', gap: 4 },
  padGap: { width: 52, height: 52 },
  padBtn: { width: 52, height: 52, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
  padHint: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  zoomBtn: { flex: 1, minHeight: TARGET.min, borderRadius: R.inner, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(0,0,0,0.8)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  zoomText: { color: '#FFF', fontFamily: F.display, fontSize: 16 },
  compass: { width: 3 * 48 + 2 * 5, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  cell: { width: 48, height: 48, borderRadius: R.inner, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  cellText: { color: C.text, fontFamily: F.display, fontSize: 16 },
  mid: { borderRadius: 24, borderStyle: 'dashed', backgroundColor: C.surface2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  facing: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderTopWidth: 1, borderColor: C.border, paddingTop: S.md },
  facingDial: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  facingN: { position: 'absolute', top: 4, color: C.redText, fontFamily: F.display, fontSize: 15 },
  stepBtn: { width: 60, minHeight: TARGET.sm, borderRadius: 12, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: C.text, fontFamily: F.display, fontSize: 21 },
  coord: { color: C.text, fontSize: 17, fontVariant: ['tabular-nums'] },
  dpad: { alignSelf: 'center', width: '100%', maxWidth: 270, gap: 6 },
  dpadRow: { flexDirection: 'row', gap: 6 },
  dpadCell: { flex: 1, height: 52 },
  dpadBtn: { borderRadius: 12, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
