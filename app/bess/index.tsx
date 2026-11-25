import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Bullets, Card, H1, More, Muted, Screen, st } from '../../src/components/ui';
import { BrandGrid } from '../../src/components/BrandGrid';
import { bessCatalogInfo, bessFamilies, ensureBessCatalog, subscribeBess } from '../../src/lib/bess-catalog';
import { LastVehicleBar } from '../../src/components/LastVehicleBar';
import { BESS, shutdownSteps } from '../../src/data/catalog';
import { BESS_CHEM_MORE, BESS_FAIL_POINTS, BESS_NO_FIRE, BESS_ON_FIRE, SIZE_UP } from '../../src/data/content';
import { C, S } from '../../src/theme';

export default function BessList() {
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  const [commercial, setCommercial] = useState(false);
  useEffect(() => { ensureBessCatalog().then(force); return subscribeBess(force); }, []);
  const fams = bessFamilies();
  const brands = useMemo(() => {
    const m = new Map<string, number>();
    fams.filter((f) => commercial || f.residential).forEach((f) => m.set(f.brand, (m.get(f.brand) ?? 0) + 1));
    return [...m.entries()].map(([make, models]) => ({ make, models })).sort((a, b) => a.make.localeCompare(b.make));
  }, [fams.length, commercial]);
  const info = bessCatalogInfo();
  return (
    <Screen>
      <LastVehicleBar />
      <H1>Home batteries</H1>
      <View style={{ marginTop: S.md }}>
        <Btn big tone="red" label="IDENTIFY BY CAMERA" sub="Photo the unit or its label" onPress={() => r.push('/bess/camera')} />
      </View>

      <Text style={st.h2}>Verified shutdown cards</Text>
      <View style={{ gap: S.sm }}>
        {BESS.map((b) => (
          <Pressable key={b.id} onPress={() => r.push(`/bess/${b.id}`)}>
            <Card>
              <Text style={st.body}>{b.name}</Text>
              <Muted>{b.chemistry} · {b.kwh_usable} kWh · shutdown {shutdownSteps(b).verified ? 'VERIFIED' : 'generic NEC 706.15'}{b.recalls ? ' · RECALL' : ''}</Muted>
            </Card>
          </Pressable>
        ))}
      </View>

      <Text style={st.h2}>All US-listed systems</Text>
      {info ? (
        <>
          <Muted>{brands.length} brands · every UL 9540 system on the California Energy Commission list ({info.version}).</Muted>
          <Pressable onPress={() => setCommercial(!commercial)} style={{ marginVertical: S.sm }}>
            <Text style={{ color: C.text }}>{commercial ? '☑' : '☐'} Include commercial systems (over 20 kWh per unit)</Text>
          </Pressable>
          <BrandGrid brands={brands} onPick={(mk) => r.push(`/bess/brand?make=${encodeURIComponent(mk)}${commercial ? '&all=1' : ''}`)} />
        </>
      ) : (
        <Card><Text style={st.body}>The full list loads the first time the app has signal.</Text></Card>
      )}

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
