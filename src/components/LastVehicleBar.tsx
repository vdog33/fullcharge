import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getRecents, Recent } from '../lib/history';
import { recentHref, recentKind, recentName } from '../lib/recent-nav';
import { C, F, R } from '../theme';
import { Icon } from './Icon';

/** "Quick — last vehicle". Not sticky: rendered inside the ScrollView, scrolls away. */
export function LastVehicleBar() {
  const r = useRouter();
  const [last, setLast] = useState<Recent | null>(null);
  useFocusEffect(useCallback(() => { getRecents().then((l) => setLast(l[0] ?? null)); }, []));
  if (!last) return null;
  const name = recentName(last);
  if (!name) return null;
  const kind = recentKind(last).toLowerCase();
  return (
    <Pressable onPress={() => r.push(recentHref(last))} accessibilityRole="button" accessibilityLabel={`Quick, last ${kind}: ${name}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.card, borderWidth: 2, borderColor: C.line, backgroundColor: pressed ? C.surface : 'transparent' })}>
      <Icon name="clock" size={24} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.muted, fontFamily: F.display, fontSize: 15, letterSpacing: 0.9, textTransform: 'uppercase' }}>Quick — last {kind}</Text>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 18 }}>{name}</Text>
      </View>
      <Icon name="chev" size={22} />
    </Pressable>
  );
}
