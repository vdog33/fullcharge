// "Share to zone" from a cut sheet: unit, vehicle and where — pre-filled, one tap to send.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, H1, Input, Muted, Notice, Screen, st } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { myGroups, OPEN_ZONE, shareIncident, ZoneGroup } from '../../src/lib/zone-share';
import { quickFix, lastFix } from '../../src/lib/here';
import { getScene } from '../../src/lib/scene';
import { COMPASS, Compass, compassDeg } from '../../src/lib/geo';
import { S } from '../../src/theme';

export default function ShareToZone() {
  const { ref = '', title = '' } = useLocalSearchParams<{ ref?: string; title?: string }>();
  const r = useRouter();
  const { user } = useAuth();
  const [groups, setGroups] = useState<(ZoneGroup & { unit: string })[]>([]);
  const [g, setG] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [vehicle, setVehicle] = useState(title);
  const [place, setPlace] = useState('');
  const [wind, setWind] = useState<Compass | 'Not set'>('Not set');
  const [fix, setFix] = useState(lastFix());
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (user || OPEN_ZONE) myGroups().then((x) => { setGroups(x); if (x[0]) { setG(x[0].id); setUnit(x[0].unit); } }).catch((e) => setErr(e.message)).finally(() => setLoaded(true));
    quickFix().then((x) => { if (x && x !== 'denied') setFix(x); });
    const sc = getScene(); if (sc.windDeg != null || sc.windFrom) setWind(sc.windFrom);
  }, [user?.id]);

  // Open beta zone: no sign-in needed. Only block when there's truly no zone to send to.
  if ((!user && !OPEN_ZONE) || (loaded && !groups.length)) return (
    <Screen>
      <H1>Share to zone</H1>
      <Notice tone="info">{!user && !OPEN_ZONE ? 'Sign in first (Settings), then join your zone group.' : 'Join your zone group first.'}</Notice>
      <Btn label="Zone sharing" icon="users" onPress={() => r.replace('/zone')} />
    </Screen>
  );

  return (
    <Screen>
      <H1>Share to zone</H1>
      <Muted>Info only — the zone sees unit, vehicle, where and wind. No approach instructions.</Muted>
      {groups.length > 1 && <Chips label="Zone group" options={groups.map((x) => ({ key: x.id, label: x.name }))} value={g} onChange={(k) => { setG(k); setUnit(groups.find((x) => x.id === k)?.unit || unit); }} />}
      <Input label="Your unit" placeholder="e.g. Vista E151" value={unit} onChangeText={setUnit} />
      <Input label="Vehicle" value={vehicle} onChangeText={setVehicle} />
      <Input label="Where (optional)" placeholder="e.g. I-5 NB at Oceanside Blvd" value={place} onChangeText={setPlace} />
      <Card><Text style={st.body}>{fix ? `Location: your GPS (±${Math.round(fix.acc ?? 0)} m)` : 'Location: not available — add "Where".'}</Text></Card>
      <Text style={st.label}>Wind from</Text>
      <Chips label="Wind from" square options={['Not set', ...COMPASS].map((c) => ({ key: c, label: c }))} value={wind} onChange={(k) => setWind(k as Compass | 'Not set')} />
      {!!err && <Notice tone="warn">{err}</Notice>}
      <View style={{ gap: S.sm }}>
        <Btn tone="red" icon="share" label={busy ? 'Sending…' : 'Send to zone'} disabled={busy || !vehicle.trim()} reason="Type the vehicle."
          onPress={async () => {
            setBusy(true); setErr('');
            try {
              const i = await shareIncident({ group_id: g, unit: unit.trim(), vehicle: vehicle.trim(), vehicle_ref: ref || null, place: place.trim(),
                lat: fix?.lat ?? null, lng: fix?.lng ?? null, wind_from_deg: wind === 'Not set' ? null : compassDeg(wind) });
              r.replace(`/zone/${i.id}`);
            } catch (e) { setErr((e as Error).message); setBusy(false); }
          }} />
      </View>
    </Screen>
  );
}
