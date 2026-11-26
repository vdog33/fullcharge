// Home: shows only when a zone group you're in has a live scene. Tap → Zone sharing.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, Vibration } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from './Icon';
import { useAuth } from '../lib/auth';
import { Incident, liveIncidents, myGroups, watchIncidents } from '../lib/zone-share';
import { C, F, R } from '../theme';

export function ZoneBanner() {
  const r = useRouter();
  const { user } = useAuth();
  const [inc, setInc] = useState<Incident[]>([]);
  const load = useCallback(() => { if (user) myGroups().then((g) => liveIncidents(g.map((x) => x.id))).then(setInc).catch(() => {}); }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (user ? watchIncidents((_i, kind) => { if (kind === 'new') Vibration.vibrate(400); load(); }) : undefined), [user?.id]);
  if (!inc.length) return null;
  const top = inc[0];
  return (
    <Pressable onPress={() => r.push(inc.length === 1 ? `/zone/${top.id}` : '/zone')} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 12, borderRadius: R.card, borderWidth: 2, borderColor: C.redText, backgroundColor: pressed ? C.surface2 : '#2A0B08' })}>
      <Icon name="users" size={26} color={C.redText} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.redText, fontFamily: F.display, fontSize: 16 }}>{inc.length === 1 ? 'ZONE: LIVE SCENE' : `ZONE: ${inc.length} LIVE SCENES`}</Text>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{[top.unit, top.vehicle].filter(Boolean).join(' · ')}</Text>
      </View>
      <Icon name="chev" size={22} color={C.redText} />
    </Pressable>
  );
}
