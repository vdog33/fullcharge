// One tap: share this vehicle to the zone and go straight into the command view for it.
// First time only, it asks for your unit (remembered after that).
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Btn, Muted } from './ui';
import { getMyUnit, myGroups, shareIncident } from '../lib/zone-share';
import { lastFix, quickFix } from '../lib/here';
import { getScene } from '../lib/scene';

export function ShareToZoneBtn({ vehicleRef, title }: { vehicleRef: string; title: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setErr('');
    const unit = await getMyUnit();
    const form = `/zone/share?ref=${encodeURIComponent(vehicleRef)}&title=${encodeURIComponent(title)}&next=command`;
    if (!unit) return r.push(form); // first time: type your unit once
    setBusy(true);
    try {
      const g = (await myGroups())[0];
      if (!g) { setBusy(false); return r.push(form); }
      const fx = await quickFix().catch(() => null);
      const at = fx && fx !== 'denied' ? fx : lastFix();
      const sc = getScene();
      const i = await shareIncident({ group_id: g.id, unit, vehicle: title, vehicle_ref: vehicleRef || null, place: '',
        lat: at?.lat ?? null, lng: at?.lng ?? null, wind_from_deg: sc.windDeg != null ? Math.round(sc.windDeg) % 360 : null });
      r.push(`/command?incident=${i.id}`);
    } catch (e) { setErr((e as Error).message || 'No signal — try again.'); }
    setBusy(false);
  }
  return (
    <>
      <Btn big tone="hazmat" icon="share" label={busy ? 'Sharing…' : 'Share to zone'} sub="One tap — opens command view" disabled={busy} onPress={go} />
      {!!err && <Muted>{err}</Muted>}
    </>
  );
}
