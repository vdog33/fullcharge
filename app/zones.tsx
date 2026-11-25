import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, Card, Chip, H2, LabeledInput, Muted, RadioGroup, Screen, Warning, WarningText, st } from '../src/components/ui';
import { ZoneDiagram } from '../src/components/ZoneDiagram';
import { ZoneMap, ZoneMapHandle } from '../src/components/ZoneMap';
import { chemFamily, getBess, getVehicle, ZONES } from '../src/data/catalog';
import { bearingDeg, COMPASS, Compass, distanceM, LatLng, M_TO_FT, offsetM, plumeHeading } from '../src/lib/geo';
import { C, S, T, TAP } from '../src/theme';

type Mode = 'Satellite' | 'Map' | 'Diagram';
const VIRTUAL_ORIGIN: LatLng = { lat: 39.5, lng: -98.35 }; // maths only when there is no fix — never shown
const FRAME_H = 460;
const COMPASS_NAME: Record<Compass, string> = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest' };
// Wind buttons laid out as a compass so position matches direction (Gestalt continuity, H2 real-world match).
const COMPASS_GRID: (Compass | null)[][] = [['NW', 'N', 'NE'], ['W', null, 'E'], ['SW', 'S', 'SE']];
const CELL = 72;

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
  const plumeTo = COMPASS[Math.round(heading / 45) % 8];
  const moveFire = useCallback((p: LatLng) => setFire(p), []);
  const step = (e: number, n: number) => setFire((f) => offsetM(f, e, n));
  const distFt = you && fireReal ? distanceM(you, fire) * M_TO_FT : null;
  const brg = you && fireReal ? bearingDeg(you, fire) : null;

  return (
    <Screen>
      {/* Safety caveat FIRST — above everything it qualifies (H5 error prevention, H1 visibility). */}
      <Warning title="Planning estimate only">
        <WarningText>Guide 147 lists NO green-page distances. Minimums, not maximums. Confirm: Hazmat + live monitoring + wind. Unsure of chemistry? Use the largest zone.</WarningText>
      </Warning>

      {name && (
        chem?.family === 'UNKNOWN'
          ? <Warning title={name}>{chem.label}</Warning>
          : <Card style={{ marginBottom: S.md }}><Text style={st.label}>{name}</Text><Text style={st.body}>{chem?.label}</Text><Muted>Unsure of chemistry? Use the largest zone.</Muted></Card>
      )}

      {/* (1) ENVIRONMENTAL DATA */}
      <H2>Environment</H2>
      <RadioGroup label="Time of day">
        {['Day', 'Night'].map((d) => <Chip key={d} on={(d === 'Night') === night} label={d} onPress={() => setNight(d === 'Night')} style={{ flex: 1 }} />)}
      </RadioGroup>

      <Text style={[st.label, { marginTop: S.lg, marginBottom: S.sm }]}>Wind blowing FROM</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Wind blowing from" style={{ alignSelf: 'center', gap: S.sm }}>
        {COMPASS_GRID.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: S.sm }}>
            {row.map((c, ci) => c
              ? <Chip key={c} on={windFrom === c} label={c} a11yLabel={`From ${COMPASS_NAME[c]}`} onPress={() => setWindFrom(c)} style={{ width: CELL, height: CELL }} />
              : (
                <View key={`mid${ci}`} style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text style={{ color: C.redText, fontSize: 30 }}>●</Text>
                </View>
              ))}
          </View>
        ))}
      </View>
      <Text style={[st.body, { marginTop: S.sm, textAlign: 'center' }]} accessibilityLiveRegion="polite">
        Wind from {windFrom} — plume heads {plumeTo}.
      </Text>

      <Text style={[st.label, { marginTop: S.lg, marginBottom: S.sm }]}>Wind speed</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <Chip label="−5" a11yLabel="Wind speed down 5" onPress={() => setWindMph((x) => Math.max(0, x - 5))} style={{ width: TAP.primary, height: TAP.primary }} />
        <Text style={[st.body, { minWidth: 88, textAlign: 'center', fontSize: T.btn }]} accessibilityLabel={`${windMph} miles per hour`} accessibilityLiveRegion="polite">{windMph} mph</Text>
        <Chip label="+5" a11yLabel="Wind speed up 5" onPress={() => setWindMph((x) => Math.min(80, x + 5))} style={{ width: TAP.primary, height: TAP.primary }} />
      </View>
      {windMph >= 15 && <View style={{ marginTop: S.sm }}><Warning>{ZONES.fire_marker.wind.strong_wind_note}</Warning></View>}

      {/* (2) LOCATION */}
      <H2>Location</H2>
      <Btn label="USE MY LOCATION" onPress={locate} />
      {!!gpsMsg && <Muted live>{gpsMsg}</Muted>}
      {you && <Text style={[st.body, { marginTop: 4 }]}>You: {you.lat.toFixed(5)}, {you.lng.toFixed(5)}{you.acc ? ` ±${Math.round(you.acc)} m` : ''}</Text>}
      <LabeledInput label="Address or landmark (label only)" style={{ marginTop: S.md }} value={label} onChangeText={setLabel} />
      <Text style={[st.body, { marginTop: S.md }]}>
        Fire: {fireReal ? `${fire.lat.toFixed(5)}, ${fire.lng.toFixed(5)}` : 'relative to marker (no fix)'}
        {distFt !== null ? ` · ${Math.round(distFt)} ft · ${Math.round(brg!)}°` : ''}
      </Text>

      {/* Nudges as a D-pad: north is up. */}
      <Text style={[st.label, { marginTop: S.md, marginBottom: S.sm }]}>Move fire 25 m</Text>
      <View style={{ alignSelf: 'center', gap: S.sm }}>
        <View style={{ flexDirection: 'row', gap: S.sm, justifyContent: 'center' }}>
          <Chip label="N ↑" a11yLabel="Move fire 25 metres north" onPress={() => step(0, 25)} style={{ width: CELL, height: CELL }} />
        </View>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Chip label="← W" a11yLabel="Move fire 25 metres west" onPress={() => step(-25, 0)} style={{ width: CELL, height: CELL }} />
          <View style={{ width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={{ color: C.redText, fontSize: 30 }}>●</Text>
          </View>
          <Chip label="E →" a11yLabel="Move fire 25 metres east" onPress={() => step(25, 0)} style={{ width: CELL, height: CELL }} />
        </View>
        <View style={{ flexDirection: 'row', gap: S.sm, justifyContent: 'center' }}>
          <Chip label="S ↓" a11yLabel="Move fire 25 metres south" onPress={() => step(0, -25)} style={{ width: CELL, height: CELL }} />
        </View>
      </View>
      <View style={{ gap: S.sm, marginTop: S.md }}>
        <Btn tone="ghost" label="RESET MARKER TO ME" disabled={!you} onPress={() => { if (you) { setFire({ lat: you.lat, lng: you.lng }); setTimeout(() => mapRef.current?.frame(ZONES.warm_m), 50); } }} />
        {fireReal && <Btn tone="ghost" label="DIRECTIONS IN APPLE MAPS" onPress={() => Linking.openURL(`http://maps.apple.com/?daddr=${fire.lat},${fire.lng}`)} />}
      </View>

      {/* (3) MAP */}
      <H2>Map</H2>
      <RadioGroup label="Map view" style={{ marginBottom: S.sm }}>
        {(['Satellite', 'Map', 'Diagram'] as Mode[]).map((m) => <Chip key={m} on={mode === m} label={m} onPress={() => setMode(m)} style={{ flex: 1 }} />)}
      </RadioGroup>
      {!!note && <Muted live>{note}</Muted>}

      {live ? (
        <>
          <ZoneMap ref={mapRef} fire={fire} you={you} mapType={mode === 'Satellite' ? 'satellite' : 'standard'}
            plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H} onMoveFire={moveFire} />
          <Text style={[st.label, { marginTop: S.md, marginBottom: S.sm }]}>Zoom map to</Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Chip label="Hot zone" onPress={() => mapRef.current?.frame(ZONES.hot_m * 2)} style={{ flex: 1 }} />
            <Chip label="Warm zone" onPress={() => mapRef.current?.frame(ZONES.warm_m)} style={{ flex: 1 }} />
            <Chip label="Cold zone" onPress={() => mapRef.current?.frame(ZONES.cold_m)} style={{ flex: 1 }} />
          </View>
          <Muted>Pinch / drag to move the map. Drag the FIRE marker, or long-press the map, to move the fire.</Muted>
        </>
      ) : (
        <ZoneDiagram fire={fire} you={you} plumeHeading={heading} plumeHalfDeg={spread} plumeLenM={plumeM} height={FRAME_H} onMoveFire={moveFire} />
      )}

      {/* Legend sits right under the map, so every ring and the wedge is explained where it is seen (H6, H10). */}
      <Card style={{ marginTop: S.md }}>
        <Text style={st.label} accessibilityRole="header">Legend — what the map shows</Text>
        <Legend color={C.red} label={`Hot ${ZONES.hot_ft} ft (${ZONES.hot_m} m) — isolate, all directions`} />
        <Legend color={C.gold} label={`Quarantine ${ZONES.quarantine_ft} ft — structures + combustibles out`} dashed />
        <Legend color={C.hazmat} label={`Warm ${ZONES.warm_ft} ft (${ZONES.warm_m} m) — decon / staging at edge`} />
        <Legend color={C.cold} label={`Cold ${ZONES.cold_label} (${ZONES.cold_m} m) — command, apparatus, public beyond`} />
        <Legend color={C.red} label={`Plume (red wedge) ${night ? 'night 1,000 ft (305 m) ±16°' : 'day 330 ft (100 m) ±32°'} — ${ZONES.plume_gases.join(', ')}`} wedge />
        <Legend color={C.red} label="FIRE marker — the incident (drag or tap to move)" dot />
        <Legend color={C.you} label="YOU — your GPS position" dot />
        <Muted>Plume = planning value, not ERG Table 1. {ZONES.plume_note}</Muted>
      </Card>
    </Screen>
  );
}

function Legend({ color, label, dashed, wedge, dot }: { color: string; label: string; dashed?: boolean; wedge?: boolean; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }} accessible accessibilityLabel={label}>
      <View style={{ width: 24, height: dot ? 16 : wedge ? 14 : 5, borderRadius: dot ? 8 : 1, backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderWidth: dashed ? 2 : 0, borderStyle: dashed ? 'dashed' : 'solid', opacity: wedge ? 0.7 : 1 }} />
      <Text style={[st.body, { flex: 1, fontSize: 16, lineHeight: 22 }]}>{label}</Text>
    </View>
  );
}
