import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, CardBtn, Divider, Empty, H1, Screen, st, Toast } from '../src/components/ui';
import { clearIdHistory, getIdHistory, IdAttempt, IDHIST_SHOWN, restoreIdHistory } from '../src/lib/history';
import { getVehicle } from '../src/data/catalog';
import { C } from '../src/theme';

const nm = (id: string | null) => { if (!id) return '—'; const v = getVehicle(id); return v ? `${v.make} ${v.model}` : id; };

export default function History() {
  const r = useRouter();
  const [list, setList] = useState<IdAttempt[]>([]);
  const [all, setAll] = useState(false);
  const [undo, setUndo] = useState<IdAttempt[] | null>(null);
  useFocusEffect(useCallback(() => { getIdHistory().then(setList); }, []));
  const shown = all ? list : list.slice(0, IDHIST_SHOWN);

  return (
    <Screen>
      <View>
        <H1>ID history</H1>
        <Text style={[st.body, { color: C.muted, fontSize: 17 }]}>Top match vs what the crew confirmed.</Text>
      </View>
      {!list.length && !undo && (
        <Empty icon="id" title="No IDs yet." body="Each camera ID you run shows up here with the app's top match and what the crew confirmed.">
          <Btn tone="red" icon="cam" label="Identify by camera" onPress={() => r.push('/camera')} />
        </Empty>
      )}
      {shown.map((a) => (
        <CardBtn key={a.at} icon={a.source === 'camera' ? 'cam' : 'search'} disabled={!a.confirmedId}
          onPress={() => a.confirmedId && r.push(a.confirmedId.startsWith('guide:') ? `/guide?keys=${a.confirmedId.slice(6)}&title=${encodeURIComponent(a.confirmedLabel ?? '')}` : `/vehicle/${a.confirmedId}`)}>
          <Text style={st.label}>{a.source === 'camera' ? 'Camera' : 'VIN'} · {new Date(a.at).toLocaleString()}</Text>
          <Text style={[st.body, { fontSize: 17 }]}>Top match: <Text style={{ fontWeight: '700' }}>{nm(a.topMatch)}</Text></Text>
          <Text style={[st.body, { fontSize: 17 }]}>Confirmed: <Text style={{ fontWeight: '700' }}>{a.confirmedLabel ?? nm(a.confirmedId)}</Text>{a.correction ? ` · "it was ${a.correction}"` : ''}</Text>
        </CardBtn>
      ))}
      {list.length > IDHIST_SHOWN && !all && <Btn tone="outline" label={`Show all ${list.length}`} onPress={() => setAll(true)} />}
      {!!list.length && (
        <>
          <Divider />
          <Btn tone="danger" size="sm" icon="x" label="Clear ID history" onPress={async () => { setUndo(list); await clearIdHistory(); setList([]); }} />
        </>
      )}
      {undo && (
        <Toast text="ID history cleared" action="Undo" onHide={() => setUndo(null)}
          onAction={async () => { await restoreIdHistory(undo); setList(undo); setUndo(null); }} />
      )}
    </Screen>
  );
}
