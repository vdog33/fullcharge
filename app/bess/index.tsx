import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bullets, Card, H1, More, Muted, Screen, st } from '../../src/components/ui';
import { LastVehicleBar } from '../../src/components/LastVehicleBar';
import { BESS, shutdownSteps } from '../../src/data/catalog';
import { BESS_CHEM_MORE, BESS_FAIL_POINTS, BESS_NO_FIRE, BESS_ON_FIRE, SIZE_UP } from '../../src/data/content';
import { C, S } from '../../src/theme';

export default function BessList() {
  const r = useRouter();
  return (
    <Screen>
      <LastVehicleBar />
      <H1>Home batteries</H1>
      <View style={{ gap: S.sm, marginTop: S.md }}>
        {BESS.map((b) => (
          <Pressable key={b.id} onPress={() => r.push(`/bess/${b.id}`)}>
            <Card>
              <Text style={st.body}>{b.name}</Text>
              <Muted>{b.chemistry} · {b.kwh_usable} kWh · shutdown {shutdownSteps(b).verified ? 'VERIFIED' : 'generic NEC 706.15'}{b.recalls ? ' · RECALL' : ''}</Muted>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text style={st.h2}>Size-up</Text>
      <Card>
        {SIZE_UP.intro.map((l) => <Text key={l} style={st.body}>{l}</Text>)}
        <Text style={st.label}>Spot</Text><Bullets items={SIZE_UP.spot} />
        <Text style={st.label}>Ask</Text><Bullets items={SIZE_UP.ask} />
      </Card>

      <Text style={st.h2}>No fire</Text>
      <Bullets items={BESS_NO_FIRE} />
      <Text style={st.h2}>On fire</Text>
      <Bullets items={BESS_ON_FIRE} />

      <More title="More — LFP vs NMC chemistry">
        <Text style={st.body}>{BESS_CHEM_MORE.lfp}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.nmc}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.both}</Text>
      </More>
      <More title="More — fail points">
        <Text style={st.body}>{BESS_FAIL_POINTS}</Text>
      </More>
      <View style={{ height: 1, backgroundColor: C.border, marginTop: S.md }} />
    </Screen>
  );
}
