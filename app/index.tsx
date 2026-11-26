import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigNav, Grid, Icon, Screen, Wordmark } from '../src/components/ui';
import { IconName } from '../src/components/Icon';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { SceneBadge } from '../src/components/SceneBadge';
import { ZoneBanner } from '../src/components/ZoneBanner';
import { commandOn, getSetup } from '../src/lib/setup';
import { BESS } from '../src/data/catalog';
import { BETA } from '../src/config';
import { C, R } from '../src/theme';

// Corner menu: things you set up at the station, not on scene.
const MENU: [string, string, IconName][] = [
  ['Zone sharing', '/zone', 'users'], ['Downloads', '/settings/downloads', 'dl'], ['ID History', '/history', 'id'], ['Settings', '/settings', 'gear'],
];

export default function Home() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [cmd, setCmd] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  // iPad: the big buttons share the screen below the logo and badges.
  const tilesH = W >= 700 ? H - 330 : undefined;
  useFocusEffect(useCallback(() => { getSetup().then((x) => setCmd(commandOn(x))); }, []));
  useFocusEffect(useCallback(() => () => setMenu(false), []));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Screen>
        {/* FULLCHARGE wordmark — big enough to read at arm's length, not a whole banner. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, alignItems: 'center' }}><Wordmark fill /></View>
          {/* Labelled, not just an icon — easy for everyone to find. */}
          <Pressable onPress={() => setMenu(!menu)} accessibilityRole="button" accessibilityState={{ expanded: menu }} accessibilityLabel="Menu: Zone sharing, Downloads, ID History, Settings"
            style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 56, paddingHorizontal: 8, borderRadius: R.card, borderWidth: 2, borderColor: menu ? C.text : C.line, backgroundColor: pressed || menu ? C.surface2 : 'transparent' })}>
            <Icon name={menu ? 'x' : 'menu'} size={24} />
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{menu ? 'Close' : 'Menu'}</Text>
          </Pressable>
        </View>
        {menu && (
          <View style={{ borderWidth: 2, borderColor: C.text, borderRadius: R.card, backgroundColor: C.surface, overflow: 'hidden' }}>
            {MENU.map(([l, p, ic], i) => (
              <Pressable key={p} onPress={() => { setMenu(false); r.push(p); }} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: C.border, backgroundColor: pressed ? C.surface2 : 'transparent' })}>
                <Icon name={ic} size={24} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 18, flex: 1 }}>{l}</Text>
                <Icon name="chev" size={22} />
              </Pressable>
            ))}
          </View>
        )}

        <LastVehicleBar />

        {/* Scene-ready: green when this phone works with no signal; yellow when it needs a re-check. */}
        <SceneBadge />
        <ZoneBanner />

        {/* The four things a crew needs, nothing else to read first. */}
        <Grid fillH={tilesH}>
          <BigNav tone="red" icon="cam" title="Identify by camera" sub="Photograph the non-damaged side" onPress={() => r.push('/camera')} />
          <BigNav icon="search" title="Search a vehicle" sub="Make / model · VIN" onPress={() => r.push('/search')} />
          <BigNav icon="batt" title="BESS" sub={`${BESS.length} home battery systems`} onPress={() => r.push('/bess')} />
          <BigNav icon="pin" title="Isolation zones + map" sub="Starts on your location" onPress={() => r.push('/zones')} />
          {cmd && <BigNav icon="users" title="Command view" sub="Map + cut sheet / ERG · zone scenes" onPress={() => r.push('/command')} />}
          {BETA && <BigNav icon="flask" title="Test" sub="Beta: 20 vehicles — cut sheets broken down" onPress={() => r.push('/test')} />}
        </Grid>

        {/* Small link — Recents can matter on scene, but it isn't one of the big four. */}
        <Pressable onPress={() => r.push('/recents')} accessibilityRole="button"
          style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: pressed ? C.surface : 'transparent' })}>
          <Icon name="clock" size={20} color={C.muted} />
          <Text style={{ color: C.muted, fontWeight: '700', fontSize: 17, textDecorationLine: 'underline' }}>Recents</Text>
        </Pressable>
      </Screen>
    </View>
  );
}
