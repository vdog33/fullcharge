import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoltShield, Btn, Bullets, Card, More, Screen, Wordmark, st } from '../src/components/ui';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { EV_FIRST_MOVES } from '../src/data/content';
import { allReady, coreReady, loadPacks } from '../src/lib/packs';
import { C, F, S, T } from '../src/theme';

export default function Home() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const [core, setCore] = useState(true);
  useFocusEffect(useCallback(() => { loadPacks().then(() => setCore(coreReady() && allReady())); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Screen>
        <View style={{ alignItems: 'center', gap: 6, marginVertical: S.lg }}>
          <BoltShield size={64} />
          <Wordmark size={34} />
          <Text style={{ color: C.muted, fontFamily: F.narrowBold, fontSize: T.label, letterSpacing: 2 }}>ERG · EVR · BESS EXPERT</Text>
        </View>

        <LastVehicleBar />

        {!core && (
          <Pressable onPress={() => r.push('/settings/downloads')} accessibilityRole="button" accessibilityLabel="Offline not ready. Cut sheets not all on this phone yet, some need signal. Tap to download them.">
            <Card style={{ marginBottom: S.md, borderColor: C.control }}>
              <Text style={st.label}>Offline not ready</Text>
              <Text style={st.body}>Cut sheets not all on this phone yet — some need signal. Tap to download them.</Text>
            </Card>
          </Pressable>
        )}

        <View style={{ gap: S.md }}>
          <Btn big tone="red" label="IDENTIFY BY CAMERA" sub="Photograph the non-damaged side" onPress={() => r.push('/camera')} />
          <Btn big label="SEARCH A VEHICLE" sub="Make / model · VIN" onPress={() => r.push('/search')} />
          <Btn big label="BESS" sub="8 home battery systems" onPress={() => r.push('/bess')} />
        </View>

        <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.md }}>
          <View style={{ flex: 1 }}><Btn tone="hazmat" label="ERG 147" onPress={() => r.push('/hazmat')} /></View>
          <View style={{ flex: 1 }}><Btn tone="red" label="ZONES + MAP" onPress={() => r.push('/zones')} /></View>
        </View>

        <More title="EV first moves" count={`${EV_FIRST_MOVES.length}-step checklist`}>
          <Bullets items={EV_FIRST_MOVES} />
        </More>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, marginTop: S.lg }}>
          {[['Recents', '/recents'], ['ID History', '/history'], ['Downloads', '/settings/downloads'], ['Settings', '/settings']].map(([l, p]) => (
            <View key={p} style={{ flexBasis: '48%', flexGrow: 1 }}><Btn tone="ghost" label={l} onPress={() => r.push(p)} /></View>
          ))}
        </View>
      </Screen>
    </View>
  );
}
