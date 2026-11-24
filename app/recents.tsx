import React, { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, H1, Muted, Screen, st } from '../src/components/ui';
import { clearRecents, getRecents, Recent, RECENTS_SHOWN } from '../src/lib/history';
import { recentHref, recentKind, recentName } from '../src/lib/recent-nav';
import { C } from '../src/theme';

export default function Recents() {
  const r = useRouter();
  const [list, setList] = useState<Recent[]>([]);
  useFocusEffect(useCallback(() => { getRecents().then(setList); }, []));
  return (
    <Screen>
      <H1>Recents</H1>
      {!list.length && <Muted>Nothing viewed yet.</Muted>}
      {list.slice(0, RECENTS_SHOWN).map((x) => {
        const name = recentName(x);
        if (!name) return null;
        return (
          <Pressable key={x.kind + x.id} onPress={() => r.push(recentHref(x))} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
            <Text style={st.body}>{name}</Text>
            <Muted>{recentKind(x)} · {new Date(x.at).toLocaleString()}</Muted>
          </Pressable>
        );
      })}
      {!!list.length && <Btn tone="ghost" label="CLEAR RECENTS" onPress={async () => { await clearRecents(); setList([]); }} />}
    </Screen>
  );
}
