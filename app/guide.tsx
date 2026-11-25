import React, { useEffect, useReducer } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Card, H1, More, Muted, Screen, st } from '../src/components/ui';
import { VerifyPicture } from '../src/components/VerifyPicture';
import { EV_FIRST_MOVES } from '../src/data/content';
import { getVehicle } from '../src/data/catalog';
import { guideLabel } from '../src/lib/match-core';
import { getGuide, guideOnPhone, loadPacks, subscribe } from '../src/lib/packs';
import { logView } from '../src/lib/history';
import { C, S } from '../src/theme';

/** Page for any NHTSA vehicle — the cut sheets themselves, plus the shared on-scene tools. */
export default function GuidePage() {
  const { keys = '', title } = useLocalSearchParams<{ keys?: string; title?: string }>();
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  const guides = keys.split(',').filter(Boolean).map(getGuide).filter((g): g is NonNullable<typeof g> => !!g)
    .sort((a, b) => Number(b.docType === 'rescue_sheet') - Number(a.docType === 'rescue_sheet') || (b.yearFrom ?? 0) - (a.yearFrom ?? 0));
  const g0 = guides[0];
  const name = title || (g0 ? `${g0.make} ${g0.model}` : 'Cut sheet');
  const linked = guides.find((g) => g.vehicleId)?.vehicleId;
  useEffect(() => { if (keys) logView('guide', keys, name); }, [keys]);

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <H1>{name}</H1>
      {g0 && <Muted>{g0.years}{g0.powertrain ? ` · ${g0.powertrain}` : ''}</Muted>}
      {guides.length > 0 && <VerifyPicture guides={guides} />}

      {new Set(guides.map((x) => `${x.make}|${x.model}`)).size > 1 && (
        <Card style={{ borderColor: C.muted, marginTop: S.md }}>
          <Text style={st.body}>More than one model matches — check the badge and pick the sheet for that exact model.</Text>
        </Card>
      )}
      <View style={{ gap: S.sm, marginVertical: S.md }}>
        {guides.map((g) => (
          <Pressable key={g.key} onPress={() => r.push(g.images ? `/sheet?key=${g.key}` : `/erg-pdf?kind=guide&id=${g.key}`)}>
            <Card style={{ borderColor: C.red }}>
              <Text style={[st.label, { color: C.red }]}>{g.docType === 'rescue_sheet' ? 'Rescue sheet (PDF)' : 'Emergency response guide (PDF)'}</Text>
              <Text style={st.body}>{guideLabel(g)}</Text>
              <Muted>{guideOnPhone(g) ? 'On this device — works offline' : 'Not downloaded — needs signal'}{g.pages ? ` · ${g.pages} page${g.pages > 1 ? 's' : ''}` : ''}{g.date ? ` · ${g.date}` : ''}</Muted>
            </Card>
          </Pressable>
        ))}
        {!guides.length && <Card><Text style={st.body}>Cut sheet not found on this phone. Update the rescue-sheet pack in Downloads.</Text></Card>}
        {linked && getVehicle(linked) && <Btn label="FULLCHARGE PAGE — CUT LOOP, 12V, TOW" onPress={() => r.push(`/vehicle/${linked}`)} />}
        <Btn tone="hazmat" label="HAZMAT ERG 147" onPress={() => r.push('/hazmat')} />
        <Btn tone="red" label="ISOLATION ZONES + MAP" onPress={() => r.push('/zones')} />
      </View>

      <Muted>Chemistry not verified for this vehicle — treat as lithium-ion, Guide 147. Cut-loop location: see the sheet.</Muted>
      <More title="EV first moves">
        <Bullets items={EV_FIRST_MOVES} />
      </More>
    </Screen>
  );
}
