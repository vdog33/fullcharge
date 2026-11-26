// Home: three big buttons, nothing else. START NEW · ACTIVE · PAST. Everything else lives in Menu.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../src/components/Icon';
import { Wordmark } from '../src/components/ui';
import { useAuth } from '../src/lib/auth';
import { liveIncidents, myGroups, OPEN_ZONE, watchIncidents } from '../src/lib/zone-share';
import { C, F, R } from '../src/theme';

// Corner menu: set-up and extras — not on-scene buttons.
const MENU: [string, string, IconName][] = [
  ['Isolation zones + map', '/zones', 'pin'], ['Recents', '/recents', 'clock'], ['Scene-ready setup', '/setup', 'check'],
  ['Zone sharing', '/zone', 'users'], ['Downloads', '/settings/downloads', 'dl'], ['ID History', '/history', 'id'], ['Settings', '/settings', 'gear'],
];

export default function Home() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [live, setLive] = useState(0);
  useFocusEffect(useCallback(() => () => setMenu(false), []));
  const load = useCallback(() => { if (user || OPEN_ZONE) myGroups().then((g) => liveIncidents(g.map((x) => x.id))).then((a) => setLive(a.length)).catch(() => {}); }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (user || OPEN_ZONE ? watchIncidents(() => load()) : undefined), [user?.id]);
  // The three buttons share the screen below the logo.
  const btnH = Math.max(110, (height - insets.top - insets.bottom - 170) / 3);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 12, paddingHorizontal: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, alignItems: 'center' }}><Wordmark fill /></View>
        <Pressable onPress={() => setMenu(!menu)} accessibilityRole="button" accessibilityState={{ expanded: menu }} accessibilityLabel="Menu"
          style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 56, paddingHorizontal: 8, borderRadius: R.card, borderWidth: 2, borderColor: menu ? C.text : C.line, backgroundColor: pressed || menu ? C.surface2 : 'transparent' })}>
          <Icon name={menu ? 'x' : 'menu'} size={24} />
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{menu ? 'Close' : 'Menu'}</Text>
        </Pressable>
      </View>

      {menu ? (
        <View style={{ borderWidth: 2, borderColor: C.text, borderRadius: R.card, backgroundColor: C.surface, overflow: 'hidden' }}>
          {MENU.map(([l, p, ic], i) => (
            <Pressable key={p} onPress={() => { setMenu(false); r.push(p); }} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: C.border, backgroundColor: pressed ? C.surface2 : 'transparent' })}>
              <Icon name={ic} size={24} />
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 18, flex: 1 }}>{l}</Text>
              <Icon name="chev" size={22} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ flex: 1, gap: 12 }}>
          <Big h={btnH} tone="red" icon="plus" title="START NEW" onPress={() => r.push('/start')} />
          <Big h={btnH} icon="fire" title="ACTIVE" sub={live ? `${live} live` : undefined} hot={live > 0} onPress={() => r.push('/incidents?kind=active')} />
          <Big h={btnH} icon="clock" title="PAST" onPress={() => r.push('/incidents?kind=past')} />
        </View>
      )}
    </View>
  );
}

function Big({ title, sub, icon, tone, hot, h, onPress }: { title: string; sub?: string; icon: IconName; tone?: 'red'; hot?: boolean; h: number; onPress: () => void }) {
  const red = tone === 'red';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title}
      style={({ pressed }) => ({ flex: 1, minHeight: Math.min(h, 110), flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 28, borderRadius: 18, borderWidth: 3,
        borderColor: red ? C.red : hot ? C.redText : C.line, backgroundColor: red ? C.red : C.surface, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={52} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontFamily: F.black, fontSize: 40, letterSpacing: 1 }} adjustsFontSizeToFit numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={{ color: hot ? C.redText : C.muted, fontFamily: F.display, fontSize: 20 }}>{sub}</Text>}
      </View>
      <Icon name="chev" size={32} />
    </Pressable>
  );
}
