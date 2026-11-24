import React from 'react';
import { Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Card, More, Muted, Screen, st } from '../src/components/ui';
import { chemFamily, ERG147, getBess, getVehicle } from '../src/data/catalog';
import { GUIDE_147_SECTIONS } from '../src/data/content';
import { C, F, S } from '../src/theme';

export default function Hazmat() {
  const { kind, id } = useLocalSearchParams<{ kind?: 'vehicle' | 'bess'; id?: string }>();
  const r = useRouter();
  const d = ERG147.distances;
  const name = kind === 'vehicle' && id ? (() => { const v = getVehicle(id); return v && `${v.make} ${v.model}`; })() : kind === 'bess' && id ? getBess(id)?.name : null;
  const chem = kind && id ? chemFamily(kind, id) : null;
  const vent = ERG147.vent_notes;
  const showNmc = !chem || chem.family !== 'LFP';
  const showLfp = !chem || chem.family !== 'NMC';

  return (
    <Screen>
      <View style={{ backgroundColor: C.hazmat, borderRadius: 10, padding: S.md }}>
        <Text style={{ color: C.hazmatText, fontFamily: F.display, fontSize: 26 }}>GUIDE {ERG147.guide}</Text>
        <Text style={{ color: C.hazmatText, fontFamily: F.narrowBold, fontSize: 16 }}>{ERG147.title}</Text>
        <Text style={{ color: C.hazmatText }}>{ERG147.un_numbers.join(' / ')} · Class {ERG147.hazard_class} · {ERG147.source}</Text>
      </View>

      {name && (
        <Card style={{ marginTop: S.md }}>
          <Text style={st.label}>{name}</Text>
          <Text style={st.body}>{chem!.label}</Text>
        </Card>
      )}

      <Text style={st.h2}>Distances</Text>
      <Card>
        <Text style={st.body}>Isolate {d.isolate_ft} ft ({d.isolate_m} m) — all directions</Text>
        <Text style={st.body}>Large spill: downwind ≥{d.large_spill_downwind_ft} ft ({d.large_spill_downwind_m} m)</Text>
        <Text style={st.body}>Rail / trailer fire: {d.rail_trailer_fire_label} ({d.rail_trailer_fire_m} m) — all directions</Text>
      </Card>
      <Card style={{ marginTop: S.sm, borderColor: C.hazmat }}>
        <Text style={st.body}>{ERG147.honest_limit}</Text>
      </Card>

      <Text style={st.h2}>Fire</Text>
      <Bullets items={ERG147.fire_notes} />

      <Text style={st.h2}>Vent gas</Text>
      {showNmc && <Text style={st.body}>NMC / NCA: {vent.nmc_nca}</Text>}
      {showLfp && <Text style={[st.body, { marginTop: 6 }]}>LFP: {vent.lfp}</Text>}

      <View style={{ marginTop: S.md }}>
        <Btn tone="red" label="ISOLATION ZONES + MAP" onPress={() => r.push(kind && id ? `/zones?kind=${kind}&id=${id}` : '/zones')} />
      </View>

      <More title="More — full Guide 147 text">
        {GUIDE_147_SECTIONS.map((s) => (
          <View key={s.h} style={{ marginBottom: S.sm }}>
            <Text style={st.label}>{s.h}</Text>
            <Bullets items={s.lines} />
          </View>
        ))}
      </More>

      <More title="Official PDFs (need signal)">
        <Btn tone="hazmat" label="GUIDE 147 PDF (NOAA CAMEO)" onPress={() => Linking.openURL(ERG147.guide_147_pdf_url)} />
        <Btn tone="hazmat" label="FULL ERG 2024 (PHMSA)" onPress={() => Linking.openURL(ERG147.full_erg_2024_pdf_url)} />
        <Btn tone="hazmat" label="CAMEO UN3480" onPress={() => Linking.openURL(ERG147.cameo_un3480_url)} />
        <Muted>Guide 147 text above is embedded and works offline.</Muted>
      </More>
    </Screen>
  );
}
