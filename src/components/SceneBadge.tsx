// Home badge: green Scene-ready / yellow check again / "Set up for no-signal scenes". Tap → setup.
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from './Icon';
import { loadPacks } from '../lib/packs';
import { getSetup, readiness } from '../lib/setup';
import { C, F, R } from '../theme';

export function SceneBadge() {
  const r = useRouter();
  const [st, setSt] = useState<ReturnType<typeof readiness> | null>(null);
  useFocusEffect(useCallback(() => { loadPacks().then(getSetup).then((s) => setSt(readiness(s))); }, []));
  if (!st) return null;
  const look = st.level === 'ready'
    ? { bg: '#0F2A1A', edge: C.green, fg: C.green, icon: 'check' as const, title: 'SCENE-READY', sub: 'Works with no signal' }
    : st.level === 'stale'
      ? { bg: C.warnBg, edge: C.hazmat, fg: C.hazmat, icon: 'warn' as const, title: 'SCENE-READY — CHECK AGAIN', sub: st.why ?? '' }
      : { bg: C.warnBg, edge: C.hazmat, fg: C.hazmat, icon: 'cloud' as const, title: 'SET UP FOR NO SIGNAL', sub: 'Cut sheets, VIN, maps on this phone — 5 min' };
  return (
    <Pressable onPress={() => r.push('/setup')} accessibilityRole="button" accessibilityLabel={`${look.title}. ${look.sub}. Open setup.`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: R.card, borderWidth: 2, borderColor: look.edge, backgroundColor: pressed ? C.surface2 : look.bg })}>
      <Icon name={look.icon} size={26} color={look.fg} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: look.fg, fontFamily: F.display, fontSize: 17, letterSpacing: 0.5 }}>{look.title}</Text>
        {!!look.sub && <Text style={{ color: C.text, fontSize: 15 }}>{look.sub}</Text>}
      </View>
      <Icon name="chev" size={22} color={look.fg} />
    </Pressable>
  );
}
