import React, { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getRecents, Recent } from '../lib/history';
import { recentHref, recentKind, recentName } from '../lib/recent-nav';
import { C, F, S } from '../theme';

/** "Quick — last vehicle". Not sticky: rendered inside the ScrollView, scrolls away. */
export function LastVehicleBar() {
  const r = useRouter();
  const [last, setLast] = useState<Recent | null>(null);
  useFocusEffect(useCallback(() => { getRecents().then((l) => setLast(l[0] ?? null)); }, []));
  if (!last) return null;
  const name = recentName(last);
  if (!name) return null;
  return (
    <Pressable
      onPress={() => r.push(recentHref(last))}
      style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: S.md, marginBottom: S.md }}
    >
      <Text style={{ color: C.muted, fontFamily: F.narrowBold, fontSize: 12, letterSpacing: 0.8 }}>QUICK — LAST {recentKind(last)}</Text>
      <Text style={{ color: C.text, fontFamily: F.narrowBold, fontSize: 17 }}>{name} ›</Text>
    </Pressable>
  );
}
