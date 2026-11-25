import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigNav, BoltShield, Btn, Disclose, Icon, Notice, Screen, Steps, Wordmark } from '../src/components/ui';
import { IconName } from '../src/components/Icon';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { EV_FIRST_MOVES } from '../src/data/content';
import { BESS } from '../src/data/catalog';
import { allReady, coreReady, loadPacks } from '../src/lib/packs';
import { C, F, R, S } from '../src/theme';

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
        <View style={{ alignItems: 'center', gap: 6, marginTop: S.sm }}>
          <BoltShield size={56} />
          <Wordmark size={34} />
          <Text style={{ color: C.muted, fontFamily: F.displayBold, fontSize: 15, letterSpacing: 2 }}>ERG · EVR · BESS EXPERT</Text>
        </View>

        <LastVehicleBar />

        {!core && (
          <Notice tone="warn" icon="cloud" title="Offline not ready"
            action={<Btn tone="hazmat" size="sm" icon="dl" label="Download cut sheets" onPress={() => r.push('/settings/downloads')} />}>
            Cut sheets not all on this phone yet — some need signal.
          </Notice>
        )}

        <BigNav tone="red" icon="cam" title="Identify by camera" sub="Photograph the non-damaged side" onPress={() => r.push('/camera')} />
        <BigNav icon="search" title="Search a vehicle" sub="Make / model · VIN" onPress={() => r.push('/search')} />
        <BigNav icon="batt" title="BESS" sub={`${BESS.length} home battery systems`} onPress={() => r.push('/bess')} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexGrow: 1, flexBasis: 140 }}><Btn tone="hazmat" icon="book" label="Hazmat ERG 147" onPress={() => r.push('/hazmat')} /></View>
          <View style={{ flexGrow: 1, flexBasis: 140 }}><Btn tone="red" icon="pin" label="Isolation zones + map" onPress={() => r.push('/zones')} /></View>
        </View>

        <Disclose title="EV first moves" count={`${EV_FIRST_MOVES.length} steps`}>
          <Steps items={EV_FIRST_MOVES} />
        </Disclose>

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
