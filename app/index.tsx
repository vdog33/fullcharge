import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigNav, Btn, Icon, Notice, Screen, Wordmark } from '../src/components/ui';
import { IconName } from '../src/components/Icon';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { BESS } from '../src/data/catalog';
import { allReady, coreReady, loadPacks } from '../src/lib/packs';
import { C, R } from '../src/theme';

const TILES: [string, string, IconName][] = [
  ['Recents', '/recents', 'clock'], ['ID History', '/history', 'id'], ['Downloads', '/settings/downloads', 'dl'], ['Settings', '/settings', 'gear'],
];

export default function Home() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const [core, setCore] = useState(true);
  useFocusEffect(useCallback(() => { loadPacks().then(() => setCore(coreReady() && allReady())); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Screen>
        {/* FULLCHARGE wordmark — big enough to read at arm's length, not a whole banner. */}
        <View style={{ alignItems: 'center', paddingVertical: 4 }}><Wordmark size={46} /></View>

        <LastVehicleBar />

        {!core && (
          <Notice tone="warn" icon="cloud" title="Offline not ready"
            action={<Btn tone="hazmat" size="sm" icon="dl" label="Download cut sheets" onPress={() => r.push('/settings/downloads')} />}>
            Cut sheets not all on this phone yet — some need signal.
          </Notice>
        )}

        {/* The four things a crew needs, nothing else to read first. */}
        <BigNav tone="red" icon="cam" title="Identify by camera" sub="Photograph the non-damaged side" onPress={() => r.push('/camera')} />
        <BigNav icon="search" title="Search a vehicle" sub="Make / model · VIN" onPress={() => r.push('/search')} />
        <BigNav icon="batt" title="BESS" sub={`${BESS.length} home battery systems`} onPress={() => r.push('/bess')} />
        <BigNav icon="pin" title="Isolation zones + map" sub="Starts on your location" onPress={() => r.push('/zones')} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TILES.map(([l, p, ic]) => (
            <Pressable key={p} onPress={() => r.push(p)} accessibilityRole="button"
              style={({ pressed }) => ({ flexGrow: 1, flexBasis: 136, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 12, borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: pressed ? C.surface : 'transparent' })}>
              <Icon name={ic} size={24} />
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 17 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </Screen>
    </View>
  );
}
