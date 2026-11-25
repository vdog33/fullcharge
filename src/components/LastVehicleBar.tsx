import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getRecents, Recent } from '../lib/history';
import { recentHref, recentKind, recentName } from '../lib/recent-nav';
import { C, F, S, T, TAP } from '../theme';

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
      accessibilityRole="button"
      accessibilityLabel={`Quick, last ${recentKind(last).toLowerCase()}: ${name}`}
      style={({ pressed }) => ({ minHeight: TAP.primary + 8, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderColor: C.control, borderWidth: 1, borderRadius: 10, padding: S.md, marginBottom: S.md, opacity: pressed ? 0.75 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.muted, fontFamily: F.narrowBold, fontSize: T.label, letterSpacing: 0.8 }}>QUICK — LAST {recentKind(last)}</Text>
        <Text style={{ color: C.text, fontFamily: F.narrowBold, fontSize: T.btn }}>{name}</Text>
      </View>
      <Text style={{ color: C.text, fontSize: 28 }} accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </Pressable>
  );
}
