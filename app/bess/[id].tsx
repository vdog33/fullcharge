import React, { useEffect } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Btn, Card, Field, H1, H2, More, Muted, PageTabs, Screen, st } from '../../src/components/ui';
import { getBess, SHARED_CONTACTS, shutdownSteps } from '../../src/data/catalog';
import { BESS_CHEM_MORE } from '../../src/data/content';
import { logView } from '../../src/lib/history';
import { C, S } from '../../src/theme';

const tel = (p: string) => Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`);

export default function BessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = getBess(id);
  useEffect(() => { if (b) logView('bess', b.id); }, [b?.id]);
  if (!b) return <Screen><H1>Not found</H1></Screen>;
  const sd = shutdownSteps(b);

  return (
    <Screen>
      <Stack.Screen options={{ title: b.name }} />
      <H1>{b.name}</H1>
      <PageTabs kind="bess" id={b.id} />

      {!!b.recalls && <Card style={{ borderColor: C.red, marginBottom: S.sm }}><Text style={[st.label, { color: C.redText }]}>⚠ Recall</Text><Text style={st.body}>{b.recalls}</Text></Card>}

      <H2>{sd.verified ? 'Shutdown — verified' : 'Shutdown — generic'}</H2>
      {!sd.verified && <Muted>{sd.title}</Muted>}
      <Card>
        {sd.steps.map((s, i) => <Text key={i} style={st.body}>{i + 1}. {s}</Text>)}
      </Card>

      <H2>System</H2>
      <Field label="Chemistry" value={b.chemistry} />
      <Field label="Usable" value={`${b.kwh_usable} kWh`} />
      <Field label="Coupling" value={b.coupling} />
      <Field label="Disconnect" value={b.disconnect} />

      <H2>Contacts</H2>
      <Card>
        <Text style={st.body}>{b.contact_name}</Text>
        {b.contact_phone ? <Btn label={`CALL ${b.contact_phone}`} onPress={() => tel(b.contact_phone!)} /> : <Muted>No verified phone.</Muted>}
        <Muted>{b.contact_note}</Muted>
      </Card>
      <View style={{ gap: S.sm, marginTop: S.sm }}>
        {SHARED_CONTACTS.map((c) => <Btn key={c.name} tone="ghost" label={`${c.name} ${c.phone}`} sub={c.note} onPress={() => tel(c.phone)} />)}
      </View>

      <More title="More — chemistry" count="LFP / NMC notes">
        <Text style={st.body}>{b.chemistry === 'LFP' ? BESS_CHEM_MORE.lfp : BESS_CHEM_MORE.nmc}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.both}</Text>
      </More>
    </Screen>
  );
}
