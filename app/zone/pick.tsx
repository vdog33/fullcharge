// Share a scene, step 1: which vehicle? Recent ones first, or type to search. Step 2 is the share form.
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CardBtn, H2, Input, Muted, Screen, st } from '../../src/components/ui';
import { getRecents, Recent } from '../../src/lib/history';
import { recentName } from '../../src/lib/recent-nav';
import { guideIndex, loadPacks, subscribe } from '../../src/lib/packs';
import { Guide, smartSearchGuides } from '../../src/lib/match-core';

export default function PickVehicle() {
  const r = useRouter();
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<Recent[]>([]);
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  useFocusEffect(useCallback(() => { getRecents().then((l) => setRecents(l.filter((x) => x.kind !== 'bess').slice(0, 5))); }, []));
  const index = guideIndex();
  // One row per make + model; every sheet for it goes along.
  const rows = useMemo(() => {
    if (q.trim().length < 2) return [];
    const by = new Map<string, Guide[]>();
    for (const g of smartSearchGuides(q, index, undefined, 120)) {
      const k = `${g.make} ${g.model}`;
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return [...by.entries()].slice(0, 20);
  }, [q, index.length]);
  const go = (ref: string, title: string) => r.replace(`/zone/share?ref=${encodeURIComponent(ref)}&title=${encodeURIComponent(title)}&next=command`);

  return (
    <Screen>
      <Input label="Vehicle" placeholder="Type make or model — e.g. model y, lightning" value={q} onChangeText={setQ} autoFocus />
      {rows.map(([name, gs]) => (
        <CardBtn key={name} onPress={() => go(`guide:${gs.slice(0, 8).map((g) => g.key).join(',')}`, name)}>
          <Text style={[st.body, { fontWeight: '700', fontSize: 19 }]}>{name}</Text>
          <Muted>{gs.length} sheet{gs.length === 1 ? '' : 's'}</Muted>
        </CardBtn>
      ))}
      {q.trim().length < 2 && recents.length > 0 && <>
        <H2>Recent</H2>
        {recents.map((x) => {
          const name = recentName(x) ?? 'Vehicle';
          return (
            <CardBtn key={`${x.kind}:${x.id}`} onPress={() => go(x.kind === 'vehicle' ? `vehicle:${x.id}` : `guide:${x.id}`, name)}>
              <Text style={[st.body, { fontWeight: '700', fontSize: 19 }]}>{name}</Text>
            </CardBtn>
          );
        })}
      </>}
      {q.trim().length >= 2 && !rows.length && <Muted>No match — check the spelling, or share with the vehicle typed in by hand on the next screen.</Muted>}
      {q.trim().length >= 2 && <CardBtn onPress={() => go('', q.trim())}><Text style={st.body}>Share as "{q.trim()}" (no cut sheet link)</Text></CardBtn>}
    </Screen>
  );
}
