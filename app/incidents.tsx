// ACTIVE / PAST incident lists. Tap one → its command screen (past ones open read-only).
import React, { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Muted, Notice, Screen } from '../src/components/ui';
import { IncidentCard } from '../src/components/IncidentCard';
import { useAuth } from '../src/lib/auth';
import { getMyIncident, Incident, liveIncidents, myGroups, OPEN_ZONE, pastIncidents, watchIncidents } from '../src/lib/zone-share';

export default function Incidents() {
  const { kind = 'active' } = useLocalSearchParams<{ kind?: string }>();
  const past = kind === 'past';
  const r = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<Incident[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    if (!user && !OPEN_ZONE) { setList([]); return; }
    try {
      const ids = (await myGroups()).map((g) => g.id);
      setList(await (past ? pastIncidents(ids) : liveIncidents(ids)));
      setMine((await getMyIncident())?.id ?? null);
      setErr('');
    } catch (e) { setErr((e as Error).message || 'No signal'); setList((l) => l ?? []); }
  }, [past, user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (user || OPEN_ZONE ? watchIncidents(() => load()) : undefined), [user?.id, past]);
  return (
    <Screen>
      <Stack.Screen options={{ title: past ? 'Past incidents' : 'Active incidents' }} />
      {!!err && <Notice tone="warn">{err}</Notice>}
      {list === null && <Muted>Loading…</Muted>}
      {list?.length === 0 && <Muted>{past ? 'No completed incidents in the last 7 days.' : 'No active incidents. Share one from any vehicle page.'}</Muted>}
      {list?.map((i) => <IncidentCard key={i.id} i={i} past={past} mine={mine === i.id} onPress={() => r.push(`/command?incident=${i.id}`)} />)}
    </Screen>
  );
}
