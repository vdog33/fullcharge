import React, { useEffect } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Btn, Card, Disclose, Field, H1, H2, Muted, Notice, PageTabs, Pill, Screen, Steps, st } from '../../src/components/ui';
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
      <View style={{ gap: S.sm }}>
        <H1>{b.name}</H1>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {!!b.recalls && <Pill tone="recall" icon="warn" label="RECALL" />}
          {sd.verified ? <Pill tone="ok" icon="check" label="Shutdown VERIFIED" /> : <Pill label="Shutdown: generic NEC 706.15" />}
        </View>
      </View>
      {!!b.recalls && <Notice tone="danger" title="Recall">{b.recalls}</Notice>}

      {/* Shutdown is what crews come here for: first, numbered, then the call button. */}
      <H2 sub={sd.verified ? undefined : sd.title}>{sd.verified ? 'Shutdown — verified' : 'Shutdown — generic'}</H2>
      <Card><Steps items={sd.steps} /></Card>
      {!!b.contact_phone && <Btn tone="neutral" label={`Call ${b.contact_name}`} sub={b.contact_phone} onPress={() => tel(b.contact_phone!)} />}

      <PageTabs kind="bess" id={b.id} />

      <H2>System</H2>
      <Field label="Chemistry" value={b.chemistry} />
      <Field label="Usable" value={`${b.kwh_usable} kWh`} />
      <Field label="Coupling" value={b.coupling} />
      <Field label="Disconnect" value={b.disconnect} />

      <H2>Contacts</H2>
      <Card>
        <Text style={st.body}>{b.contact_name}</Text>
        {b.contact_phone ? <Muted>{b.contact_phone}</Muted> : <Muted>No verified phone.</Muted>}
        <Muted>{b.contact_note}</Muted>
      </Card>
      <View style={{ gap: S.sm }}>
        {SHARED_CONTACTS.map((c) => <Btn key={c.name} tone="outline" label={`${c.name} ${c.phone}`} sub={c.note} onPress={() => tel(c.phone)} />)}
      </View>

      <Disclose title="More — chemistry">
        <Text style={st.body}>{b.chemistry === 'LFP' ? BESS_CHEM_MORE.lfp : BESS_CHEM_MORE.nmc}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.both}</Text>
      </Disclose>
    </Screen>
  );
}
