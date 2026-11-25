import React, { useEffect, useReducer } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, H1, More, Muted, Screen, st } from '../../src/components/ui';
import { ensureBessCatalog, familyChem, getFamily, subscribeBess } from '../../src/lib/bess-catalog';
import { BESS, GENERIC_SHUTDOWN, SHARED_CONTACTS } from '../../src/data/catalog';
import { BESS_CHEM_MORE } from '../../src/data/content';
import { logView } from '../../src/lib/history';
import { C, S } from '../../src/theme';

const tel = (p: string) => Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`);

export default function BessFamilyScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { ensureBessCatalog().then(force); return subscribeBess(force); }, []);
  const f = getFamily(id);
  useEffect(() => { if (f) logView('bess', f.curatedId ?? f.id, `${f.brand} ${f.family}`); }, [f?.id]);
  if (!f) return <Screen><H1>Not found</H1><Muted>The home-battery list may still be loading.</Muted></Screen>;

  const card = f.curatedId ? BESS.find((b) => b.id === f.curatedId) : undefined;
  const { chem, verified } = familyChem(f);
  const chemNote = chem === 'LFP' ? BESS_CHEM_MORE.lfp : chem === 'NMC' || chem === 'NCA' ? BESS_CHEM_MORE.nmc
    : 'Chemistry not stated in the listing — treat as the worse case (NMC: earlier, faster, self-oxidising) until the label says otherwise.';
  const cap = f.kwhMin === null ? 'not listed' : f.kwhMin === f.kwhMax ? `${f.kwhMin} kWh` : `${f.kwhMin}–${f.kwhMax} kWh`;

  return (
    <Screen>
      <Stack.Screen options={{ title: `${f.brand} ${f.family}` }} />
      <Muted>{f.brand}{f.residential ? '' : ' · commercial'}</Muted>
      <H1>{f.family}</H1>

      <View style={{ gap: S.sm, marginVertical: S.md }}>
        {card
          ? <Btn tone="red" label="Verified shutdown card" sub={card.name} onPress={() => r.push(`/bess/${card.id}`)} />
          : <Card style={{ borderColor: C.redText }}>
              <Text style={[st.label, { color: C.redText }]}>Shutdown — generic, not verified for this model</Text>
              {GENERIC_SHUTDOWN.steps.map((s, i) => <Text key={i} style={st.body}>{i + 1}. {s}</Text>)}
              <Muted>Confirm with the manufacturer's emergency / installation guide on scene.</Muted>
            </Card>}
        <Btn tone="hazmat" label="Hazmat ERG 147" icon="book" onPress={() => r.push('/hazmat')} />
        <Btn tone="red" label="Isolation zones + map" icon="pin" onPress={() => r.push('/zones')} />
      </View>

      <Card>
        <Text style={st.label}>Chemistry{verified ? ' (verified)' : ' (from the listing)'}</Text>
        <Text style={st.body}>{chem}</Text>
        <Muted>{chemNote}</Muted>
        <Muted>{BESS_CHEM_MORE.both}</Muted>
      </Card>
      <Card style={{ marginTop: S.sm }}>
        <Text style={st.label}>Capacity per unit</Text>
        <Text style={st.body}>{cap}{f.residential ? '' : ' — over the 20 kWh home limit'}</Text>
        <Muted>Units are often stacked — count them.</Muted>
      </Card>

      <Text style={st.h2}>Contacts</Text>
      <Card>
        {card?.contact_phone ? <Btn label={`CALL ${card.contact_name}`} sub={card.contact_phone} onPress={() => tel(card.contact_phone!)} /> : <Muted>No verified manufacturer line on file for this model.</Muted>}
        {SHARED_CONTACTS.map((c) => <Btn key={c.name} tone="outline" label={`${c.name} ${c.phone}`} sub={c.note} onPress={() => tel(c.phone)} />)}
      </Card>

      <More title={`Listed models (${f.models.length})`}>
        {f.models.map((m) => (
          <View key={m.model} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: C.border }}>
            <Text style={st.body}>{m.model}</Text>
            <Muted>{[m.kwh !== null && `${m.kwh} kWh`, m.kw !== null && `${m.kw} kW`, m.vac !== null && `${m.vac} V`].filter(Boolean).join(' · ')}</Muted>
            <Muted>{m.description}</Muted>
          </View>
        ))}
        <Muted>Model numbers: XX = digits, Y = a letter. Match them to the unit's label.</Muted>
      </More>
      <Muted>Source: California Energy Commission Energy Storage System List (UL 9540). Being listed doesn't prove how it was installed.</Muted>
    </Screen>
  );
}
