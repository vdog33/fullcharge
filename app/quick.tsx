import React from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card, Confirm, H1, Muted, Screen, st } from '../src/components/ui';
import { getBess, getVehicle, shutdownSteps, ZONES } from '../src/data/catalog';
import { C, S } from '../src/theme';

// Everything here is embedded — works with no signal.
const Row = ({ k, v }: { k: string; v: string }) => (
  <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: C.border }}>
    <Text style={st.label}>{k}</Text>
    <Text style={st.body}>{v}</Text>
  </View>
);

export default function Quick() {
  const { kind = 'vehicle', id } = useLocalSearchParams<{ kind?: string; id: string }>();
  const zones = `Hot ${ZONES.hot_ft} ft · Quarantine ${ZONES.quarantine_ft} ft · Warm ${ZONES.warm_ft} ft · Cold ${ZONES.cold_label}`;

  if (kind === 'bess') {
    const b = getBess(id);
    if (!b) return <Screen><H1>Not found</H1></Screen>;
    const sd = shutdownSteps(b);
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Quick — ' + b.name }} />
        <H1>{b.name}</H1>
        <Muted>Offline quick sheet</Muted>
        <Card style={{ marginTop: S.md }}>
          <Row k={sd.verified ? 'Shutdown (verified)' : 'Shutdown (generic NEC 706.15)'} v={sd.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')} />
          <Row k="Chemistry" v={b.chemistry} />
          <Row k="Usable" v={`${b.kwh_usable} kWh`} />
          <Row k="Disconnect" v={b.disconnect} />
          <Row k="Call" v={`${b.contact_name}: ${b.contact_phone ?? 'no verified phone'} · CHEMTREC 1-800-424-9300`} />
          {b.recalls && <Row k="Recall" v={b.recalls} />}
          <Row k="Zones" v={zones} />
        </Card>
      </Screen>
    );
  }

  const v = getVehicle(id);
  if (!v) return <Screen><H1>Not found</H1></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Quick — ' + v.model }} />
      <H1>{v.make} {v.model}</H1>
      <Muted>Offline quick sheet · {v.years} · {v.type}</Muted>
      <Card style={{ marginTop: S.md }}>
        <Row k="Cut loop" v={v.cut_loop} />
        <Row k="12V" v={v.lv_location} />
        <Row k="No-cut" v={v.no_cut_zones} />
        <Row k="Airbag / HV" v={v.airbag_hv} />
        <Row k="Tow" v={v.tow} />
        <Row k="Release" v={v.release} />
        <Row k="Pack / chem" v={`${v.pack} · ${v.chemistry}`} />
        {v.watch_for && <Row k="Watch for" v={v.watch_for} />}
        <Row k="Zones" v={zones} />
      </Card>
      <View style={{ marginTop: S.md }}><Confirm /></View>
    </Screen>
  );
}
