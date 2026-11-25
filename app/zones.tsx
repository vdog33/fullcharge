import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, H2, Icon, Input, Label, Muted, Notice, Screen, Seg, st, useJump } from '../src/components/ui';
import { ZoneDiagram } from '../src/components/ZoneDiagram';
import { ZoneMap, ZoneMapHandle } from '../src/components/ZoneMap';
import { chemFamily, getBess, getVehicle, ZONES } from '../src/data/catalog';
import { bearingDeg, COMPASS, Compass, distanceM, LatLng, M_TO_FT, offsetM, plumeHeading } from '../src/lib/geo';
import { getScene, setScene } from '../src/lib/scene';
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

  // Environment — shared with the Hazmat ERG 147 map snapshot.
  const sc0 = getScene();
  const [night, setNight] = useState(sc0.night);
  const [windFrom, setWindFrom] = useState<Compass>(sc0.windFrom);
  const [windMph, setWindMph] = useState(sc0.windMph);
  useEffect(() => { setScene({ night, windFrom, windMph }); }, [night, windFrom, windMph]);

  // Location
  const [you, setYou] = useState<(LatLng & { acc?: number }) | null>(null);
  const [gpsMsg, setGpsMsg] = useState('');
  const [label, setLabel] = useState('');
  const [fire, setFire] = useState<LatLng>(VIRTUAL_ORIGIN);
  const fireReal = !!you;

  // Map
  const [mode, setMode] = useState<Mode>('Satellite');
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const mapRef = useRef<ZoneMapHandle>(null);

  async function locate() {
    setGpsMsg('Getting fix…');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return setGpsMsg('Location denied. Zones still correct around the fire marker.');
      let pos = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: 50 });
      if (!pos) {
        pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
          new Promise<null>((r) => setTimeout(() => r(null), 15000)),
        ]);
      }
      if (!pos) return setGpsMsg('No fix in 15 s. Zones still correct around the fire marker.');
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy ?? undefined };
      if (!you) setFire({ lat: p.lat, lng: p.lng }); // marker starts on the user
      setYou(p); setGpsMsg('');
    } catch { setGpsMsg('No fix. Zones still correct around the fire marker.'); }
  }
  useEffect(() => { locate(); }, []);

  const offline = net.isConnected === false || net.isInternetReachable === false;
  const live = mode !== 'Diagram' && fireReal && !offline;
  const note = mode !== 'Diagram' && !live
    ? (!fireReal ? 'No GPS fix — showing the zone diagram. The map needs a fix.' : 'No signal — showing the zone diagram. The map needs signal.')
    : '';

  const plumeM = night ? ZONES.plume_night_m : ZONES.plume_day_m;
  const spread = night ? ZONES.plume_night_spread_deg : ZONES.plume_day_spread_deg;
  const heading = plumeHeading(windFrom);
  const heads = COMPASS[Math.round(heading / 45) % 8];
  const moveFire = useCallback((p: LatLng) => setFire(p), []);
  const step = (e: number, n: number) => setFire((f) => offsetM(f, e, n));
  const distFt = you && fireReal ? distanceM(you, fire) * M_TO_FT : null;
  const brg = you && fireReal ? bearingDeg(you, fire) : null;
  // Phone compass: which way the responder is facing. Face into the wind, tap once, and "Wind from" is set.
  const [facing, setFacing] = useState<{ deg: number; acc: number } | null>(null);
  const lastDeg = useRef(-999);
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
  const facingDir = facing ? COMPASS[Math.round(facing.deg / 45) % 8] : null;

  const pickZoom = (z: Zoom) => { setZoom(z); if (live) mapRef.current?.frame(FRAME_M[z]); };

  return (
    <Screen ref={ref}>
      {name && <Notice tone="info" icon="batt" title={name}>{`${chem?.label ?? ''}\nUnsure of chemistry? Use the largest zone.`}</Notice>}

      {/* One card: map type, map, zoom, wind, speed, light, legend, caveat — change wind, watch the plume move (F33). */}
      <View style={s.card}>
        <Seg label="Map type" options={['Satellite', 'Map', 'Diagram'] as const} value={mode} onChange={setMode} />
        {!!note && <Muted>{note}</Muted>}

        <View style={{ borderRadius: R.inner, overflow: 'hidden' }}>
          {live ? (
            <ZoneMap ref={mapRef} fire={fire} you={you} mapType={mode === 'Satellite' ? 'satellite' : 'standard'}
              plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H} onMoveFire={moveFire} />
          ) : (
            <ZoneDiagram fire={fire} you={you} plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H}
              onMoveFire={moveFire} viewM={DIAGRAM_M[zoom ?? 'Cold']} />
          )}
          <View style={s.badges} pointerEvents="box-none">
            <View style={{ gap: 6 }} pointerEvents="none">
              <View style={s.badge}><Icon name="nav" size={16} /><Text style={s.badgeText}>{windFrom} wind · plume {heads}</Text></View>
              {facingDir && <View style={s.badge}><Icon name="loc" size={16} /><Text style={s.badgeText}>You face {facingDir}</Text></View>}
            </View>
            <Pressable onPress={() => go('caveat')} accessibilityRole="button" accessibilityLabel="Planning estimate — read the caveat" style={s.pe}>
              <Icon name="warn" size={16} color={C.hazmatText} /><Text style={[s.badgeText, { color: C.hazmatText }]}>Planning estimate</Text>
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
        <Muted style={{ paddingHorizontal: 4 }}>
          {live ? 'Pinch / drag to move the map. Drag the FIRE marker, or long-press the map, to move the fire.' : 'Drag the fire marker, or tap the diagram, to move the fire.'}
        </Muted>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
          <View style={s.compass} accessibilityRole="radiogroup" accessibilityLabel="Wind from">
            {GRID.map((d, i) => d ? (
              <Pressable key={d} onPress={() => setWindFrom(d)} accessibilityRole="radio" accessibilityState={{ checked: windFrom === d }}
                accessibilityLabel={`Wind from ${d}`} style={[s.cell, windFrom === d && { backgroundColor: '#FFF', borderColor: '#FFF' }]}>
                <Text style={[s.cellText, windFrom === d && { color: C.hazmatText }]}>{d}</Text>
              </Pressable>
            ) : (
              <View key={i} style={[s.cell, s.mid]} importantForAccessibility="no">
                <View style={{ transform: [{ rotate: `${heading}deg` }] }}><Icon name="arrow" size={26} /></View>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Label>Wind from</Label>
            <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>{windFrom}</Text>
            <Text style={[st.body, { fontSize: 16 }]}>Plume heads {heads}.</Text>
          </View>
        </View>

        {/* Compass heading: which way you're facing (F9 follow-up). */}
        <View style={s.facing}>
          <View style={s.facingDial} importantForAccessibility="no">
            <Text style={s.facingN}>N</Text>
            <View style={{ transform: [{ rotate: `${facing?.deg ?? 0}deg` }], opacity: facing ? 1 : 0.35 }}><Icon name="arrow" size={30} /></View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }} accessibilityLiveRegion="polite">
            <Label>You're facing</Label>
            <Text style={{ color: C.text, fontFamily: F.display, fontSize: 24 }}>
              {facing ? `${facingDir} · ${Math.round(facing.deg)}°` : '—'}
            </Text>
            <Text style={st.muted}>
              {!facing ? 'Compass needs location permission — tap Use my location.'
                : facing.acc <= 1 ? 'Compass weak — hold flat, away from the rig, move phone in a figure 8.' : 'Hold flat, away from the rig and metal.'}
            </Text>
          </View>
        </View>
        <Btn icon="nav" disabled={!facingDir} reason="No compass reading yet — set the wind by hand above."
          label={facingDir ? `Wind in my face — set wind from ${facingDir}` : 'Wind in my face'}
          onPress={() => facingDir && setWindFrom(facingDir as Compass)} />

        <View style={s.stepper}>
          <Pressable onPress={() => setWindMph((x) => Math.max(0, x - 5))} accessibilityRole="button" accessibilityLabel="Decrease wind speed by 5" style={s.stepBtn}>
            <Text style={s.stepText}>−5</Text>
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: C.text, fontFamily: F.black, fontSize: 28 }} accessibilityLiveRegion="polite">
            {windMph} <Text style={{ fontSize: 16, color: C.muted, fontFamily: F.displayBold }}>mph</Text>
          </Text>
          <Pressable onPress={() => setWindMph((x) => Math.min(80, x + 5))} accessibilityRole="button" accessibilityLabel="Increase wind speed by 5" style={s.stepBtn}>
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

      <H2>Location</H2>
      <Btn icon="loc" label="Use my location" onPress={locate} />
      {!!gpsMsg && <Muted>{gpsMsg}</Muted>}
      {you && <Text style={s.coord}><Text style={{ fontFamily: F.display }}>You</Text> {you.lat.toFixed(5)}, {you.lng.toFixed(5)}{you.acc ? ` ±${Math.round(you.acc)} m` : ''}</Text>}
      <Input label="Address / landmark (label only)" placeholder="e.g. 400 Main St" value={label} onChangeText={setLabel} />
      <Text style={s.coord}>
        <Text style={{ fontFamily: F.display }}>Fire</Text> {fireReal ? `${fire.lat.toFixed(5)}, ${fire.lng.toFixed(5)}` : 'relative to marker (no fix)'}
        {distFt !== null ? ` · ${Math.round(distFt)} ft · ${Math.round(brg!)}°` : ''}
      </Text>
      <Label>Nudge fire marker</Label>
      <View style={s.dpad}>
        <View style={s.dpadRow}><View style={s.dpadCell} /><Nudge l="N" onPress={() => step(0, 25)} /><View style={s.dpadCell} /></View>
        <View style={s.dpadRow}>
          <Nudge l="W" onPress={() => step(-25, 0)} />
          <View style={[s.dpadCell, { alignItems: 'center', justifyContent: 'center' }]}><Text style={[st.muted, { textAlign: 'center', lineHeight: 18 }]}>25 m{'\n'}per tap</Text></View>
          <Nudge l="E" onPress={() => step(25, 0)} />
        </View>
        <View style={s.dpadRow}><View style={s.dpadCell} /><Nudge l="S" onPress={() => step(0, -25)} /><View style={s.dpadCell} /></View>
      </View>
      <Btn icon="pin" label="Reset marker to me" disabled={!you} reason="Needs a GPS fix — tap Use my location."
        onPress={() => { if (you) { setFire({ lat: you.lat, lng: you.lng }); setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 50); } }} />
      {fireReal && <Btn icon="nav" label="Directions in Apple Maps" onPress={() => Linking.openURL(`http://maps.apple.com/?daddr=${fire.lat},${fire.lng}`)} />}
    </Screen>
  );
}

const Nudge = ({ l, onPress }: { l: string; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Move fire 25 metres ${l}`}
    style={({ pressed }) => [s.dpadCell, s.dpadBtn, pressed && { backgroundColor: C.surface2 }]}>
    <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }}>{l}</Text>
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
  zoomBtn: { flex: 1, minHeight: TARGET.min, borderRadius: R.inner, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', backgroundColor: 'rgba(0,0,0,0.8)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  zoomText: { color: '#FFF', fontFamily: F.display, fontSize: 16 },
  compass: { width: 3 * 48 + 2 * 5, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  cell: { width: 48, height: 48, borderRadius: R.inner, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  cellText: { color: C.text, fontFamily: F.display, fontSize: 16 },
  mid: { borderRadius: 24, borderStyle: 'dashed', backgroundColor: C.surface2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  facing: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderTopWidth: 1, borderColor: C.border, paddingTop: S.md },
  facingDial: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  facingN: { position: 'absolute', top: 2, color: C.redText, fontFamily: F.display, fontSize: 13 },
  stepBtn: { width: 60, minHeight: TARGET.sm, borderRadius: 12, borderWidth: 2, borderColor: C.line, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: C.text, fontFamily: F.display, fontSize: 21 },
  coord: { color: C.text, fontSize: 17, fontVariant: ['tabular-nums'] },
  dpad: { alignSelf: 'center', width: '100%', maxWidth: 270, gap: 6 },
  dpadRow: { flexDirection: 'row', gap: 6 },
  dpadCell: { flex: 1, height: 52 },
  dpadBtn: { borderRadius: 12, borderWidth: 2, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
