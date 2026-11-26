import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bullets, Btn, Card, Field, H1, H2, Label, Muted, Notice, PageTabs, Pill, Screen, Steps, TabBar, st } from '../../src/components/ui';
import { getBess, SHARED_CONTACTS, shutdownSteps } from '../../src/data/catalog';
import { BESS_CHEM_MORE, BESS_NO_FIRE, BESS_ON_FIRE, SIZE_UP } from '../../src/data/content';
import { IconName } from '../../src/components/Icon';
import { logView } from '../../src/lib/history';
import { C, S } from '../../src/theme';

const tel = (p: string) => Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`);

type BTab = 'Shutdown' | 'Chemistry' | 'Contacts' | 'Size-up' | 'On fire';
const TABS: { key: BTab; label: string; icon: IconName }[] = [
  { key: 'Shutdown', label: 'Shutdown', icon: 'power' }, { key: 'Chemistry', label: 'Chemistry', icon: 'flask' },
  { key: 'Contacts', label: 'Contacts', icon: 'phone' }, { key: 'Size-up', label: 'Size-up', icon: 'eye' }, { key: 'On fire', label: 'On fire', icon: 'fire' },
];

export default function BessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const b = getBess(id);
  const [tab, setTab] = useState<BTab>('Shutdown');
  const r = useRouter();
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

      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* Shutdown is what crews come here for: first, numbered, then the call button. */}
      {tab === 'Shutdown' && <>
        <H2 sub={sd.verified ? undefined : sd.title}>{sd.verified ? 'Shutdown — verified' : 'Shutdown — generic'}</H2>
        <Card><Steps items={sd.steps} /></Card>
        <Field label="Disconnect" value={b.disconnect} />
        {!!b.contact_phone && <Btn tone="neutral" icon="phone" label={`Call ${b.contact_name}`} sub={b.contact_phone} onPress={() => tel(b.contact_phone!)} />}
        <PageTabs kind="bess" id={b.id} />
      </>}

      {tab === 'Chemistry' && <>
        <Card>
          <Text style={st.label}>Chemistry</Text>
          <Text style={{ color: C.text, fontSize: 30, fontWeight: '900' }}>{b.chemistry}</Text>
          <Muted>{b.kwh_usable} kWh usable · {b.coupling}</Muted>
        </Card>
        <Text style={st.body}>{b.chemistry === 'LFP' ? BESS_CHEM_MORE.lfp : BESS_CHEM_MORE.nmc}</Text>
        <Notice tone="warn" title="Air monitoring">{BESS_CHEM_MORE.both}</Notice>
      </>}

      {tab === 'Contacts' && <View style={{ gap: S.sm }}>
        <Text style={st.label}>Manufacturer</Text>
        {b.contact_phone
          ? <Btn tone="neutral" icon="phone" label={`Call ${b.contact_name}`} sub={b.contact_phone} onPress={() => tel(b.contact_phone!)} />
          : <Muted>No verified phone for {b.contact_name}.</Muted>}
        {!!b.contact_note && <Muted>{b.contact_note}</Muted>}
        <Text style={[st.label, { marginTop: S.sm }]}>24/7 chemical emergency</Text>
        {SHARED_CONTACTS.map((c) => <Btn key={c.name} tone="neutral" icon="phone" label={`Call ${c.name}`} sub={`${c.phone} · ${c.note}`} onPress={() => tel(c.phone)} />)}
      </View>}

      {tab === 'Size-up' && <>
        <Label>No fire — venting / heat</Label>
        <Bullets items={BESS_NO_FIRE} size={17} />
        <Label>Spot</Label><Bullets items={SIZE_UP.spot} size={17} />
        <Label>Ask</Label><Bullets items={SIZE_UP.ask} size={17} />
      </>}

      {tab === 'On fire' && <>
        <Notice tone="danger" icon="fire" title="On fire">Shut down what's safe from outside the hazard area. Never open a burning unit.</Notice>
        <Bullets items={BESS_ON_FIRE} size={17} />
        <Btn tone="red" icon="pin" label="Isolation zones + map" onPress={() => r.push(`/zones?kind=bess&id=${b.id}`)} />
      </>}
    </Screen>
  );
}
