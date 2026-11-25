import React, { useEffect, useReducer } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bullets, H2, Icon, LinkRow, Notice, Screen, st } from '../src/components/ui';
import { ZoneDiagram } from '../src/components/ZoneDiagram';
import { chemFamily, ERG147, getBess, getVehicle, ZONES } from '../src/data/catalog';
import { GUIDE_147_SECTIONS } from '../src/data/content';
import { COMPASS, plumeHeading } from '../src/lib/geo';
import { getScene, subscribeScene } from '../src/lib/scene';
import { C, F, R, S } from '../src/theme';

const SNAP_ORIGIN = { lat: 39.5, lng: -98.35 }; // diagram maths only — no coordinates are shown

export default function Hazmat() {
  const { kind, id } = useLocalSearchParams<{ kind?: 'vehicle' | 'bess'; id?: string }>();
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribeScene(force), []);
  const d = ERG147.distances;
  const name = kind === 'vehicle' && id ? (() => { const v = getVehicle(id); return v && `${v.make} ${v.model}`; })() : kind === 'bess' && id ? getBess(id)?.name : null;
  const chem = kind && id ? chemFamily(kind, id) : null;
  const vent = ERG147.vent_notes;
  const showNmc = !chem || chem.family !== 'LFP';
  const showLfp = !chem || chem.family !== 'NMC';
  const zonesHref = kind && id ? `/zones?kind=${kind}&id=${id}` : '/zones';

  const sc = getScene();
  const heading = plumeHeading(sc.windFrom);
  const heads = COMPASS[Math.round(heading / 45) % 8];

  return (
    <Screen>
      <View style={{ backgroundColor: C.hazmat, borderRadius: R.card, padding: S.lg }}>
        <Text style={{ color: C.hazmatText, fontFamily: F.black, fontSize: 34, lineHeight: 36 }}>GUIDE {ERG147.guide}</Text>
        <Text style={{ color: C.hazmatText, fontWeight: '700', fontSize: 17, marginTop: 6 }}>{ERG147.title}</Text>
        <Text style={{ color: C.hazmatText, fontSize: 16, marginTop: 2 }}>{ERG147.un_numbers.join(' / ')} · Class {ERG147.hazard_class} · {ERG147.source}</Text>
      </View>

      {name && <Notice tone="info" icon="batt" title={name}>{chem!.label}</Notice>}

      <H2>Distances</H2>
      {/* Number first, large; rule underneath (F17). Values exactly as in the data. */}
      <View style={s.dist}>
        <Dist big={`${d.isolate_ft} ft`} small={`(${d.isolate_m} m)`} rule="Isolate — all directions" first />
        <Dist big={`≥${d.large_spill_downwind_ft} ft`} small={`(${d.large_spill_downwind_m} m)`} rule="Large spill: downwind" />
        <Dist big={d.rail_trailer_fire_label} small={`(${d.rail_trailer_fire_m} m)`} rule="Rail / trailer fire — all directions" />
      </View>
      <Notice tone="warn">{ERG147.honest_limit}</Notice>

      {/* Map snapshot: the picture in place; tap opens the full map (F32). */}
      <Pressable onPress={() => r.push(zonesHref)} accessibilityRole="button" accessibilityLabel="Open isolation zones and map"
        style={({ pressed }) => [s.snap, pressed && { opacity: 0.9 }]}>
        <View>
          <ZoneDiagram fire={SNAP_ORIGIN} you={null} plumeHeading={heading} interactive={false} viewM={ZONES.cold_m * 1.1}
            plumeHalfDeg={sc.night ? ZONES.plume_night_spread_deg : ZONES.plume_day_spread_deg}
            plumeLenM={sc.night ? ZONES.plume_night_m : ZONES.plume_day_m} height={220} />
          <View style={s.badges} pointerEvents="none">
            <View style={s.badge}><Icon name="nav" size={16} /><Text style={s.badgeText}>{sc.windFrom} wind · plume {heads}</Text></View>
            <View style={s.badge}><Icon name="expand" size={16} /><Text style={s.badgeText}>Open</Text></View>
          </View>
        </View>
        <View style={s.sum}>
          <Sum color={C.hot} k="Hot" v={`${ZONES.hot_ft} ft (${ZONES.hot_m} m)`} />
          <Sum color={C.warm} k="Warm" v={`${ZONES.warm_ft} ft (${ZONES.warm_m} m)`} />
          <Sum color={C.cold} k="Cold" v={`${ZONES.cold_label} (${ZONES.cold_m} m)`} />
          <Sum color={C.plume} k={sc.night ? 'Plume night' : 'Plume day'} v={sc.night ? `${ZONES.plume_night_ft.toLocaleString()} ft ±${ZONES.plume_night_spread_deg}°` : `${ZONES.plume_day_ft} ft ±${ZONES.plume_day_spread_deg}°`} />
        </View>
        <View style={s.go}><Icon name="pin" size={22} /><Text style={s.goText}>Isolation zones + map</Text></View>
      </Pressable>

      <H2>Fire</H2>
      <Bullets items={ERG147.fire_notes} />

      <H2>Vent gas</H2>
      {showNmc && <Chem k="NMC / NCA" v={vent.nmc_nca} />}
      {showLfp && <Chem k="LFP" v={vent.lfp} />}

      <LinkRow icon="book" title="More — full Guide 147 text" sub={`${GUIDE_147_SECTIONS.length} sections · works offline`} onPress={() => r.push('/guide147')} />
      <LinkRow icon="ext" title="Official PDFs" sub="3 links · need signal" onPress={() => r.push('/guide147?to=pdfs')} />
    </Screen>
  );
}

function Dist({ big, small, rule, first }: { big: string; small: string; rule: string; first?: boolean }) {
  return (
    <View style={[{ paddingHorizontal: 16, paddingVertical: 12 }, !first && { borderTopWidth: 1, borderColor: C.border }]}>
      <Text style={{ color: C.text, fontFamily: F.black, fontSize: 30, lineHeight: 33 }}>{big} <Text style={{ fontSize: 20, color: C.muted, fontFamily: F.displayBold }}>{small}</Text></Text>
      <Text style={{ color: C.muted, fontSize: 17 }}>{rule}</Text>
    </View>
  );
}
const Sum = ({ color, k, v }: { color: string; k: string; v: string }) => (
  <View style={{ width: '50%', paddingVertical: 4, paddingRight: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={st.muted}>{k}</Text>
    </View>
    <Text style={{ color: C.text, fontFamily: F.display, fontSize: 18 }}>{v}</Text>
  </View>
);
const Chem = ({ k, v }: { k: string; v: string }) => (
  <View style={{ borderLeftWidth: 4, borderColor: C.line, paddingLeft: 12, paddingVertical: 2 }}>
    <Text style={{ color: C.text, fontFamily: F.display, fontSize: 19 }}>{k}</Text>
    <Text style={[st.body, { fontSize: 17, marginTop: 2 }]}>{v}</Text>
  </View>
);

const s = StyleSheet.create({
  dist: { borderWidth: 2, borderColor: C.line, borderRadius: R.card, backgroundColor: C.surface, overflow: 'hidden' },
  snap: { borderWidth: 2, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' },
  badges: { position: 'absolute', left: 8, right: 8, top: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.84)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  sum: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: 10 },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 58, backgroundColor: C.red },
  goText: { color: '#FFF', fontFamily: F.display, fontSize: 19 },
});
