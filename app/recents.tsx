import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, CardBtn, Divider, Empty, H1, Screen, st, Toast } from '../src/components/ui';
import { clearRecents, getRecents, Recent, RECENTS_SHOWN, restoreRecents } from '../src/lib/history';
import { recentHref, recentKind, recentName } from '../src/lib/recent-nav';

const kindLabel = (x: Recent) => (x.kind === 'bess' ? 'BESS' : x.kind === 'guide' ? 'Cut sheet' : 'Vehicle');

export default function Recents() {
  const r = useRouter();
  const [list, setList] = useState<Recent[]>([]);
  const [undo, setUndo] = useState<Recent[] | null>(null);
  useFocusEffect(useCallback(() => { getRecents().then(setList); }, []));
  const rows = list.slice(0, RECENTS_SHOWN).filter((x) => recentName(x));

  return (
    <Screen>
      <H1>Recents</H1>
      {!rows.length && !undo && <Empty icon="clock" title="Nothing viewed yet." body="Vehicles, cut sheets and batteries you open show up here." />}
      {rows.map((x) => (
        <CardBtn key={x.kind + x.id} icon={x.kind === 'bess' ? 'batt' : 'book'} onPress={() => r.push(recentHref(x))}>
          <Text style={[st.body, { fontWeight: '700', fontSize: 19 }]}>{recentName(x)}</Text>
          <Text style={st.muted} accessibilityLabel={`${recentKind(x)}, ${new Date(x.at).toLocaleString()}`}>{kindLabel(x)} · {new Date(x.at).toLocaleString()}</Text>
        </CardBtn>
      ))}
      {!!rows.length && (
        <>
          <Divider />
          {/* Quiet, at the bottom, with Undo after (F25). */}
          <Btn tone="danger" size="sm" icon="x" label="Clear recents" onPress={async () => { setUndo(list); await clearRecents(); setList([]); }} />
        </>
      )}
      {undo && (
        <Toast text="Recents cleared" action="Undo" onHide={() => setUndo(null)}
          onAction={async () => { await restoreRecents(undo); setList(undo); setUndo(null); }} />
      )}
    </Screen>
  );
}
