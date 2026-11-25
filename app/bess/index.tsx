import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BigNav, Bullets, Card, CardBtn, Chips, Disclose, H1, H2, Label, Muted, Pill, Screen, Toggle, st, useJump } from '../../src/components/ui';
import { BrandGrid } from '../../src/components/BrandGrid';
import { bessCatalogInfo, bessFamilies, ensureBessCatalog, subscribeBess } from '../../src/lib/bess-catalog';
import { LastVehicleBar } from '../../src/components/LastVehicleBar';
import { BESS, shutdownSteps } from '../../src/data/catalog';
import { BESS_CHEM_MORE, BESS_FAIL_POINTS, BESS_NO_FIRE, BESS_ON_FIRE, SIZE_UP } from '../../src/data/content';
import { C, S } from '../../src/theme';

const JUMPS = [{ key: 'list', label: 'Batteries' }, { key: 'all', label: 'All systems' }, { key: 'size', label: 'Size-up' }, { key: 'nofire', label: 'No fire' }, { key: 'onfire', label: 'On fire' }];

export default function BessList() {
  const r = useRouter();
  const { ref, mark, go } = useJump();
  const [sel, setSel] = useState('list');
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
    <Screen ref={ref}>
      {/* "On fire" is one tap away (F30). */}
      <Chips square label="Jump to" options={JUMPS} value={sel} onChange={(k) => { setSel(k); go(k); }} />
      <LastVehicleBar />

      <View onLayout={mark('list')} style={{ gap: 10 }}>
        <H1>Home batteries</H1>
        <BigNav tone="red" icon="cam" title="Identify by camera" sub="Photo the unit or its label" onPress={() => r.push('/bess/camera')} />
        <H2>Verified shutdown cards</H2>
        {BESS.map((b) => {
          const verified = shutdownSteps(b).verified;
          return (
            <CardBtn key={b.id} onPress={() => r.push(`/bess/${b.id}`)}>
              <Text style={[st.body, { fontWeight: '700', lineHeight: 23 }]}>{b.name}</Text>
              <Text style={st.muted}>{b.chemistry} · {b.kwh_usable} kWh</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {!!b.recalls && <Pill tone="recall" icon="warn" label="RECALL" />}
                {verified ? <Pill tone="ok" icon="check" label="Shutdown VERIFIED" /> : <Pill label="Shutdown: generic NEC 706.15" />}
              </View>
            </CardBtn>
          );
        })}
      </View>

      <View onLayout={mark('all')} style={{ gap: 10 }}>
        <H2>All US-listed systems</H2>
        {info ? (
          <>
            <Muted>{brands.length} brands · every UL 9540 system on the California Energy Commission list ({info.version}).</Muted>
            <Toggle label="Include commercial systems" sub="Over 20 kWh per unit." value={commercial} onChange={setCommercial} />
            <BrandGrid brands={brands} onPick={(mk) => r.push(`/bess/brand?make=${encodeURIComponent(mk)}${commercial ? '&all=1' : ''}`)} />
          </>
        ) : (
          <Card><Text style={st.body}>The full list loads the first time the app has signal.</Text></Card>
        )}
      </View>

      <View onLayout={mark('size')} style={{ gap: 10 }}>
        <H2>Size-up</H2>
        <Card>
          {SIZE_UP.intro.map((l, i) => <Text key={l} style={[st.body, { fontSize: 17 }, i === 0 && { fontWeight: '700' }]}>{l}</Text>)}
          <Label>Spot</Label><Bullets items={SIZE_UP.spot} size={17} />
          <Label>Ask</Label><Bullets items={SIZE_UP.ask} size={17} />
        </Card>
      </View>

      <View onLayout={mark('nofire')} style={{ gap: 10 }}>
        <H2 icon="warn" color={C.hazmat}>No fire</H2>
        <Bullets items={BESS_NO_FIRE} />
      </View>
      <View onLayout={mark('onfire')} style={{ gap: 10 }}>
        <H2 icon="bolt" color={C.redText}>On fire</H2>
        <Bullets items={BESS_ON_FIRE} />
      </View>

      <Disclose title="More — LFP vs NMC chemistry">
        <Text style={st.body}>{BESS_CHEM_MORE.lfp}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.nmc}</Text>
        <Text style={st.body}>{BESS_CHEM_MORE.both}</Text>
      </Disclose>
      <Disclose title="More — fail points">
        <Text style={st.body}>{BESS_FAIL_POINTS}</Text>
      </Disclose>
      <View style={{ height: S.xs }} />
    </Screen>
  );
}
