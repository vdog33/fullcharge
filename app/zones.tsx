import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, Card, Muted, Screen, st } from '../src/components/ui';
import { ZoneDiagram } from '../src/components/ZoneDiagram';
import { ZoneMap, ZoneMapHandle } from '../src/components/ZoneMap';
import { chemFamily, getBess, getVehicle, ZONES } from '../src/data/catalog';
import { bearingDeg, COMPASS, Compass, distanceM, LatLng, M_TO_FT, offsetM, plumeHeading } from '../src/lib/geo';
import { C, F, S } from '../src/theme';

type Mode = 'Satellite' | 'Map' | 'Diagram';
const VIRTUAL_ORIGIN: LatLng = { lat: 39.5, lng: -98.35 }; // maths only when there is no fix — never shown
const FRAME_H = 460;

export default function Zones() {
  const { kind, id } = useLocalSearchParams<{ kind?: 'vehicle' | 'bess'; id?: string }>();
  const name = kind === 'vehicle' && id ? getVehicle(id)?.model : kind === 'bess' && id ? getBess(id)?.name : null;
  const chem = kind && id ? chemFamily(kind, id) : null;
  const net = useNetInfo();

  // (1) Environmental data
  const [night, setNight] = useState(false);
  const [windFrom, setWindFrom] = useState<Compass>('NW');
  const [windMph, setWindMph] = useState(0);

  // (2) Location
  const [you, setYou] = useState<(LatLng & { acc?: number }) | null>(null);
  const [gpsMsg, setGpsMsg] = useState('');
  const [label, setLabel] = useState('');
  const [fire, setFire] = useState<LatLng>(VIRTUAL_ORIGIN);
  const fireReal = !!you; // fire coords are only real once we have a fix

  // (3) Map
  const [mode, setMode] = useState<Mode>('Satellite');
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
  const moveFire = useCallback((p: LatLng) => setFire(p), []);
  const step = (e: number, n: number) => setFire((f) => offsetM(f, e, n));
  const distFt = you && fireReal ? distanceM(you, fire) * M_TO_FT : null;
  const brg = you && fireReal ? bearingDeg(you, fire) : null;

  return (
    <Screen>
      {name && <Card style={{ marginBottom: S.md }}><Text style={st.label}>{name}</Text><Text style={st.body}>{chem?.label}</Text><Muted>Unsure of chemistry? Use the largest zone.</Muted></Card>}

      {/* (1) ENVIRONMENTAL DATA */}
      <Text style={st.h2}>Environment</Text>
      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {['Day', 'Night'].map((d) => <Chip key={d} on={(d === 'Night') === night} label={d} onPress={() => setNight(d === 'Night')} />)}
      </View>
      <Text style={[st.label, { marginTop: S.md }]}>Wind FROM</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: 6 }}>
        {COMPASS.map((c) => <Chip key={c} on={windFrom === c} label={c} onPress={() => setWindFrom(c)} />)}
      </View>
      <Muted>Plume heads {COMPASS[Math.round(heading / 45) % 8]}.</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.sm }}>
        <Text style={st.label}>Wind mph</Text>
        <Chip label="−5" onPress={() => setWindMph((x) => Math.max(0, x - 5))} />
        <Text style={[st.body, { minWidth: 32, textAlign: 'center' }]}>{windMph}</Text>
        <Chip label="+5" onPress={() => setWindMph((x) => Math.min(80, x + 5))} />
      </View>
      {windMph >= 15 && <Text style={[st.body, { color: C.hazmat, marginTop: 4 }]}>{ZONES.fire_marker.wind.strong_wind_note}</Text>}

      {/* (2) LOCATION */}
      <Text style={st.h2}>Location</Text>
      <Btn label="USE MY LOCATION" onPress={locate} />
      {!!gpsMsg && <Muted>{gpsMsg}</Muted>}
      {you && <Text style={[st.body, { marginTop: 4 }]}>You: {you.lat.toFixed(5)}, {you.lng.toFixed(5)}{you.acc ? ` ±${Math.round(you.acc)} m` : ''}</Text>}
      <TextInput style={[st.input, { marginTop: S.sm }]} placeholder="Address / landmark (label only)" placeholderTextColor={C.muted} value={label} onChangeText={setLabel} />
      <Text style={[st.body, { marginTop: S.sm }]}>
        Fire: {fireReal ? `${fire.lat.toFixed(5)}, ${fire.lng.toFixed(5)}` : 'relative to marker (no fix)'}
        {distFt !== null ? ` · ${Math.round(distFt)} ft · ${Math.round(brg!)}°` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm, flexWrap: 'wrap' }}>
        <Chip label="N 25 m" onPress={() => step(0, 25)} />
        <Chip label="S 25 m" onPress={() => step(0, -25)} />
        <Chip label="E 25 m" onPress={() => step(25, 0)} />
        <Chip label="W 25 m" onPress={() => step(-25, 0)} />
      </View>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        <Btn tone="ghost" label="RESET MARKER TO ME" disabled={!you} onPress={() => { if (you) { setFire({ lat: you.lat, lng: you.lng }); setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 50); } }} />
        {fireReal && <Btn tone="ghost" label="DIRECTIONS IN APPLE MAPS" onPress={() => Linking.openURL(`http://maps.apple.com/?daddr=${fire.lat},${fire.lng}`)} />}
      </View>

      {/* (3) MAP */}
      <Text style={st.h2}>Map</Text>
      <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.sm }}>
        {(['Satellite', 'Map', 'Diagram'] as Mode[]).map((m) => <Chip key={m} on={mode === m} label={m} onPress={() => setMode(m)} />)}
      </View>
      {!!note && <Muted>{note}</Muted>}

      {live ? (
        <>
          <ZoneMap ref={mapRef} fire={fire} you={you} mapType={mode === 'Satellite' ? 'satellite' : 'standard'}
            plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H} onMoveFire={moveFire} />
          <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.sm, alignItems: 'center' }}>
            <Text style={st.label}>Frame</Text>
            <Chip label="HOT" onPress={() => mapRef.current?.frame(ZONES.hot_m * 2)} />
            <Chip label="WARM" onPress={() => mapRef.current?.frame(ZONES.warm_m)} />
            <Chip label="COLD" onPress={() => mapRef.current?.frame(ZONES.cold_m)} />
          </View>
          <Muted>Pinch / drag to move the map. Drag the FIRE marker, or long-press the map, to move the fire.</Muted>
        </>
      ) : (
        <ZoneDiagram fire={fire} you={you} plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H} onMoveFire={moveFire} />
      )}

      <Card style={{ marginTop: S.sm, borderColor: C.hazmat }}>
        <Text style={st.body}>Planning estimate only — Guide 147 lists NO green-page distances. Minimums, not maximums. Confirm: Hazmat + live monitoring + wind. Unsure of chemistry? Use the largest zone.</Text>
        <Muted>Plume = planning value, not ERG Table 1. {ZONES.plume_note}</Muted>
      </Card>

      <Text style={st.h2}>Legend</Text>
      <Legend color={C.red} label={`Hot ${ZONES.hot_ft} ft (${ZONES.hot_m} m) — isolate, all directions`} />
      <Legend color={C.gold} label={`Quarantine ${ZONES.quarantine_ft} ft — structures + combustibles out`} dashed />
      <Legend color={C.hazmat} label={`Warm ${ZONES.warm_ft} ft (${ZONES.warm_m} m) — decon / staging at edge`} />
      <Legend color={C.cold} label={`Cold ${ZONES.cold_label} (${ZONES.cold_m} m) — command, apparatus, public beyond`} />
      <Legend color={C.red} label={`Plume ${night ? 'night 1,000 ft (305 m) ±16°' : 'day 330 ft (100 m) ±32°'} — ${ZONES.plume_gases.join(', ')}`} wedge />
      <Legend color={C.you} label="YOU" dot />
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: on ? C.surface2 : 'transparent' }}>
      <Text style={{ color: C.text, fontFamily: F.narrowBold }}>{label}</Text>
    </Pressable>
  );
}
function Legend({ color, label, dashed, wedge, dot }: { color: string; label: string; dashed?: boolean; wedge?: boolean; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: 6 }}>
      <View style={{ width: 18, height: dot ? 12 : wedge ? 12 : 4, borderRadius: dot ? 6 : 1, backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderWidth: dashed ? 1.5 : 0, borderStyle: dashed ? 'dashed' : 'solid', opacity: wedge ? 0.6 : 1 }} />
      <Text style={[st.body, { flex: 1, fontSize: 14 }]}>{label}</Text>
    </View>
  );
}
