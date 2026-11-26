// Zone sharing home: live scenes in my zone groups, then create / join a group.
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, Vibration } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, Card, CardBtn, H1, H2, Input, Muted, Notice, Pill, Screen, st } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { ago, createZone, Incident, joinZone, leaveZone, liveIncidents, myGroups, watchIncidents, ZoneGroup } from '../../src/lib/zone-share';
import { toCompass } from '../../src/lib/geo';
import { C, S } from '../../src/theme';

export default function ZoneHome() {
  const r = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<(ZoneGroup & { unit: string })[]>([]);
  const [inc, setInc] = useState<Incident[]>([]);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [unit, setUnit] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try { const g = await myGroups(); setGroups(g); setInc(await liveIncidents(g.map((x) => x.id))); setErr(''); }
    catch (e) { setErr((e as Error).message); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (user ? watchIncidents((_i, kind) => { if (kind === 'new') Vibration.vibrate(400); load(); }) : undefined), [user?.id]);

  if (!user) return (
    <Screen>
      <H1>Zone sharing</H1>
      <Text style={st.body}>Share a scene with the departments in your zone — unit, vehicle, where, wind — and see theirs live.</Text>
      <Notice tone="info" title="Sign in first">Zone groups are invite-only, so you sign in once with your email.</Notice>
      <Btn tone="red" label="Sign in — Settings" onPress={() => r.push('/settings')} />
    </Screen>
  );

  const gName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';
  return (
    <Screen>
      <H1>Zone sharing</H1>
      {!!err && <Notice tone="warn">{err}</Notice>}

      <H2 sub="Info only — no approach instructions. Scenes clear after 6 hours.">Live scenes</H2>
      {!inc.length && <Muted>{groups.length ? 'No active scenes in your zones.' : 'Join or create a zone group below.'}</Muted>}
      {inc.map((i) => (
        <CardBtn key={i.id} onPress={() => r.push(`/zone/${i.id}`)}>
          <Text style={[st.label, { color: C.redText }]}>{gName(i.group_id)} · {ago(i.created_at)}</Text>
          <Text style={[st.body, { fontWeight: '700', fontSize: 20 }]}>{i.vehicle || 'Vehicle not set'}</Text>
          <Text style={st.body}>{[i.unit, i.place].filter(Boolean).join(' · ')}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {i.wind_from_deg != null && <Pill label={`Wind from ${toCompass(i.wind_from_deg)}`} />}
            {i.updated_at !== i.created_at && <Pill tone="sig" label={`Updated ${ago(i.updated_at)}`} />}
          </View>
        </CardBtn>
      ))}

      <H2>My zone groups</H2>
      {groups.map((g) => (
        <Card key={g.id}>
          <Text style={[st.body, { fontWeight: '700' }]}>{g.name}</Text>
          <Muted>{g.unit ? `You: ${g.unit} · ` : ''}Invite code {g.invite_code}</Muted>
          <Btn size="sm" tone={sure === g.id ? 'danger' : 'outline'} label={sure === g.id ? 'Tap again to leave' : 'Leave group'}
            onPress={async () => { if (sure !== g.id) return setSure(g.id); setSure(null); await leaveZone(g.id).catch((e) => setErr(e.message)); load(); }} />
        </Card>
      ))}
      {made && <Notice tone="ok" title={`Invite code: ${made}`}>Give this code only to departments in your zone. They join with it here.</Notice>}

      {mode === 'none' && (
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn icon="users" label="Join with code" onPress={() => setMode('join')} /></View>
          <View style={{ flex: 1 }}><Btn tone="outline" label="Create group" onPress={() => setMode('create')} /></View>
        </View>
      )}
      {mode !== 'none' && (
        <Card>
          {mode === 'create' && <Input label="Group name" placeholder="e.g. North Zone" value={name} onChangeText={setName} />}
          {mode === 'join' && <Input label="Invite code" placeholder="6 letters" autoCapitalize="characters" autoCorrect={false} maxLength={6} value={code} onChangeText={setCode} />}
          <Input label="Your unit" placeholder="e.g. Vista E151" value={unit} onChangeText={setUnit} />
          <Btn tone="red" label={mode === 'create' ? 'Create' : 'Join'} disabled={mode === 'create' ? name.trim().length < 2 : code.trim().length < 6}
            reason={mode === 'create' ? 'Type a group name.' : 'Type the 6-letter code.'}
            onPress={async () => {
              setErr('');
              try {
                if (mode === 'create') setMade((await createZone(name, unit)).invite_code); else await joinZone(code, unit);
                setMode('none'); setName(''); setCode(''); load();
              } catch (e) { setErr((e as Error).message); }
            }} />
          <Btn tone="ghost" label="Cancel" onPress={() => setMode('none')} />
        </Card>
      )}
    </Screen>
  );
}
