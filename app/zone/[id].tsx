// One shared scene: where, vehicle, wind, on the map. The unit that shared it can update wind or clear it.
import React, { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, H1, Muted, Notice, Screen, st } from '../../src/components/ui';
import { ZoneMap } from '../../src/components/ZoneMap';
import { useAuth } from '../../src/lib/auth';
import { ago, Incident, updateIncident, watchIncidents } from '../../src/lib/zone-share';
import { supabase } from '../../src/lib/supabase';
import { COMPASS, Compass, compassDeg, toCompass } from '../../src/lib/geo';
import { ZONES } from '../../src/data/catalog';
import { C, S } from '../../src/theme';

export default function IncidentView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRouter();
  const { user } = useAuth();
  const { height } = useWindowDimensions();
  const [i, setI] = useState<Incident | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    supabase?.from('zone_incidents').select('*').eq('id', id).single().then(({ data, error }: { data: Incident; error: { message: string } | null }) => (error ? setErr(error.message) : setI(data)));
    return watchIncidents((x) => { if (x.id === id) setI(x); });
  }, [id]);
  if (!i) return <Screen>{err ? <Notice tone="warn">{err}</Notice> : <Muted>Loading…</Muted>}</Screen>;
  const mine = user?.id === i.created_by;
  const wind = i.wind_from_deg != null ? toCompass(i.wind_from_deg) : null;
  const open = i.vehicle_ref?.startsWith('vehicle:') ? `/vehicle/${i.vehicle_ref.slice(8)}` : i.vehicle_ref?.startsWith('guide:') ? `/guide?keys=${i.vehicle_ref.slice(6)}&title=${encodeURIComponent(i.vehicle)}` : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: i.unit || 'Shared scene' }} />
      <View>
        <H1>{i.vehicle || 'Vehicle not set'}</H1>
        <Text style={[st.body, { color: C.muted }]}>{[i.unit, i.place, `shared ${ago(i.created_at)}`].filter(Boolean).join(' · ')}</Text>
      </View>
      {i.status === 'cleared' && <Notice tone="ok">Cleared by the unit that shared it.</Notice>}
      <Notice tone="info">Info only — no approach instructions. The incident commander on scene decides.</Notice>
      {i.lat != null && i.lng != null && (
        <ZoneMap fire={{ lat: i.lat, lng: i.lng }} you={null} mapType="satellite" height={Math.min(420, height * 0.45)}
          plumeHeading={((i.wind_from_deg ?? 0) + 180) % 360} plumeHalfDeg={i.wind_from_deg != null ? ZONES.plume_day_spread_deg : 0}
          plumeLenM={i.wind_from_deg != null ? ZONES.plume_day_m : 0} onMoveFire={() => {}} />
      )}
      <Card>
        <Text style={st.label}>Wind</Text>
        <Text style={[st.body, { fontWeight: '700', fontSize: 22 }]}>{wind ? `From ${wind}` : 'Not set'}</Text>
        {i.updated_at !== i.created_at && <Muted>Updated {ago(i.updated_at)}</Muted>}
      </Card>
      {open && <Btn tone="red" icon="book" label="Open the cut sheet" onPress={() => r.push(open)} />}
      {mine && i.status === 'active' && (
        <View style={{ gap: S.sm }}>
          <Text style={st.label}>Update wind (sends to the zone)</Text>
          <Chips label="Wind from" square options={COMPASS.map((c) => ({ key: c, label: c }))} value={wind ?? undefined}
            onChange={(c) => updateIncident(i.id, { wind_from_deg: compassDeg(c as Compass) }).catch((e) => setErr(e.message))} />
          <Btn tone="outline" icon="check" label="Clear this scene" onPress={() => updateIncident(i.id, { status: 'cleared' }).catch((e) => setErr(e.message))} />
        </View>
      )}
      {!!err && <Notice tone="warn">{err}</Notice>}
    </Screen>
  );
}
