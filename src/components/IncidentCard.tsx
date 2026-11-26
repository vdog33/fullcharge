// One incident in the Active / Past lists.
import React from 'react';
import { Text, View } from 'react-native';
import { CardBtn, st } from './ui';
import { ago, Incident } from '../lib/zone-share';
import { toCompass } from '../lib/geo';
import { C } from '../theme';

export function IncidentCard({ i, mine, past, onPress }: { i: Incident; mine?: boolean; past?: boolean; onPress: () => void }) {
  return (
    <CardBtn onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[st.label, { color: past ? C.muted : C.redText, flex: 1 }]}>
          {past ? `${i.status === 'cleared' ? 'Ended' : 'Timed out'} · ${new Date(i.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `Live · started ${ago(i.created_at)}`}
        </Text>
        {mine && <Text style={{ color: C.hazmatText, backgroundColor: C.hazmat, fontWeight: '800', fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>YOURS</Text>}
      </View>
      <Text style={[st.body, { fontWeight: '700', fontSize: 20 }]}>{i.vehicle || 'Vehicle not set'}</Text>
      <Text style={st.body}>{[i.unit, i.place, i.wind_from_deg != null ? `wind from ${toCompass(i.wind_from_deg)}` : ''].filter(Boolean).join(' · ')}</Text>
    </CardBtn>
  );
}
