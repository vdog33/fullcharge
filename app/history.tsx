import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, H1, Muted, Screen, st } from '../src/components/ui';
import { clearIdHistory, getIdHistory, IdAttempt, IDHIST_SHOWN } from '../src/lib/history';
import { getVehicle } from '../src/data/catalog';
import { C, S } from '../src/theme';

const nm = (id: string | null) => { if (!id) return '—'; const v = getVehicle(id); return v ? `${v.make} ${v.model}` : id; };

export default function History() {
  const r = useRouter();
  const [list, setList] = useState<IdAttempt[]>([]);
  const [all, setAll] = useState(false);
  useFocusEffect(useCallback(() => { getIdHistory().then(setList); }, []));
  const shown = all ? list : list.slice(0, IDHIST_SHOWN);
  return (
    <Screen>
      <H1>ID history</H1>
      <Muted>Top match vs what the crew confirmed.</Muted>
      {!list.length && <Muted>No IDs yet.</Muted>}
      <View style={{ marginTop: S.md }}>
        {shown.map((a) => (
          <Pressable key={a.at} disabled={!a.confirmedId} onPress={() => a.confirmedId && r.push(a.confirmedId.startsWith('guide:') ? `/guide?keys=${a.confirmedId.slice(6)}&title=${encodeURIComponent(a.confirmedLabel ?? '')}` : `/vehicle/${a.confirmedId}`)}
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
            <Text style={st.body}>{a.source.toUpperCase()} · top: {nm(a.topMatch)}</Text>
            <Text style={st.body}>Confirmed: {a.confirmedLabel ?? nm(a.confirmedId)}{a.correction ? ` · "it was ${a.correction}"` : ''}</Text>
            <Muted>{new Date(a.at).toLocaleString()}</Muted>
          </Pressable>
        ))}
      </View>
      {list.length > IDHIST_SHOWN && !all && <Btn tone="ghost" label={`SHOW ALL ${list.length}`} onPress={() => setAll(true)} />}
      {!!list.length && <View style={{ marginTop: S.sm }}><Btn tone="ghost" label="CLEAR ID HISTORY" onPress={async () => { await clearIdHistory(); setList([]); }} /></View>}
    </Screen>
  );
}
