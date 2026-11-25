import React, { useEffect, useReducer } from 'react';
import { Pressable, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { H1, Muted, Screen, st } from '../../src/components/ui';
import { bessFamilies, ensureBessCatalog, subscribeBess } from '../../src/lib/bess-catalog';
import { C } from '../../src/theme';

const kwh = (a: number | null, b: number | null) => (a === null ? '' : a === b ? `${a} kWh` : `${a}–${b} kWh`);

export default function BessBrand() {
  const { make = '', all } = useLocalSearchParams<{ make?: string; all?: string }>();
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { ensureBessCatalog().then(force); return subscribeBess(force); }, []);
  const fams = bessFamilies().filter((f) => f.brand === make && (all === '1' || f.residential));

  return (
    <Screen>
      <Stack.Screen options={{ title: make }} />
      <H1>{make}</H1>
      <Muted>{fams.length} listed system{fams.length === 1 ? '' : 's'}{all === '1' ? '' : ' (home-sized)'}</Muted>
      {fams.map((f) => (
        <Pressable key={f.id} onPress={() => r.push(`/bess/family?id=${encodeURIComponent(f.id)}`)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
          <Text style={st.body}>{f.family}{f.curatedId ? <Text style={{ color: C.you }}>  · VERIFIED CARD</Text> : null}</Text>
          <Muted>{[f.chemistry, kwh(f.kwhMin, f.kwhMax), `${f.models.length} model${f.models.length === 1 ? '' : 's'}`, f.residential ? '' : 'commercial'].filter(Boolean).join(' · ')}</Muted>
        </Pressable>
      ))}
    </Screen>
  );
}
