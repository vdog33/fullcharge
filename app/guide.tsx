import React, { useEffect, useReducer } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Card, H1, More, Muted, Screen, Warning, st } from '../src/components/ui';
import { EV_FIRST_MOVES } from '../src/data/content';
import { getVehicle } from '../src/data/catalog';
import { guideLabel } from '../src/lib/match-core';
import { getGuide, guideOnPhone, loadPacks, subscribe } from '../src/lib/packs';
import { logView } from '../src/lib/history';
import { C, S, TAP } from '../src/theme';

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
  const missing = guides.filter((g) => !guideOnPhone(g)).length;

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <H1>{name}</H1>
      {g0 && <Muted>{g0.years}{g0.powertrain ? ` · ${g0.powertrain}` : ''}</Muted>}

      {/* Safety caveat first, not buried between buttons (H5 error prevention, G1 proximity). */}
      <View style={{ marginTop: S.md }}>
        <Warning title="Chemistry not verified">Treat as lithium-ion, Guide 147. Cut-loop location: see the sheet.</Warning>
      </View>

      {new Set(guides.map((x) => `${x.make}|${x.model}`)).size > 1 && (
        <Card style={{ borderColor: C.muted, marginTop: S.md }}>
          <Text style={st.body}>More than one model matches — check the badge and pick the sheet for that exact model.</Text>
        </Card>
      )}
      <View style={{ gap: S.sm, marginVertical: S.md }}>
        {guides.map((g) => {
          const onPhone = guideOnPhone(g);
          const kindLabel = g.docType === 'rescue_sheet' ? 'Rescue sheet' : 'Emergency response guide';
          const meta = `${g.pages ? `${g.pages} page${g.pages > 1 ? 's' : ''}` : ''}${g.pages && g.date ? ' · ' : ''}${g.date ?? ''}`;
          return (
            // Neutral card: red means fire / danger in this app, not "document" (G2 similarity, H2).
            <Pressable key={g.key} onPress={() => r.push(g.images ? `/sheet?key=${g.key}` : `/erg-pdf?kind=guide&id=${g.key}`)}
              accessibilityRole="button"
              accessibilityLabel={`${kindLabel}, ${guideLabel(g)}. ${onPhone ? 'On this device, works offline' : 'Not downloaded, needs signal'}${meta ? `. ${meta}` : ''}`}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
              <Card style={{ borderColor: C.control, minHeight: TAP.primary + 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={st.label}>{kindLabel} (PDF)</Text>
                    <Text style={st.body}>{guideLabel(g)}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 28 }}>›</Text>
                </View>
                <Text style={[st.muted, { color: onPhone ? C.you : C.muted }]}>
                  {onPhone ? '✓ On this device — works offline' : '☁︎ Not downloaded — needs signal'}{meta ? ` · ${meta}` : ''}
                </Text>
              </Card>
            </Pressable>
          );
        })}
        {missing > 0 && <Btn label={`DOWNLOAD ALL (${missing} NOT ON PHONE)`} onPress={() => r.push('/settings/downloads')} />}
        {!guides.length && <Card><Text style={st.body}>Cut sheet not found on this phone. Update the rescue-sheet pack in Downloads.</Text></Card>}
        {linked && getVehicle(linked) && <Btn label="FULLCHARGE PAGE — CUT LOOP, 12V, TOW" onPress={() => r.push(`/vehicle/${linked}`)} />}
        <Btn tone="hazmat" label="HAZMAT ERG 147" onPress={() => r.push('/hazmat')} />
        <Btn tone="red" label="ISOLATION ZONES + MAP" onPress={() => r.push('/zones')} />
      </View>

      <More title="EV first moves" count={`${EV_FIRST_MOVES.length}-step checklist`}>
        <Bullets items={EV_FIRST_MOVES} />
      </More>
    </Screen>
  );
}
