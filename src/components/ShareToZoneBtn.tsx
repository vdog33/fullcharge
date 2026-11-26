// One tap: put this vehicle on a shared incident and go straight into the command screen.
// A unit runs one incident at a time — if yours is already running, this adds the vehicle to it.
// First time only, it asks for your unit (remembered after that).
import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Btn, Muted } from './ui';
import { getMyIncident, getMyUnit, Incident, myGroups, shareIncident, updateIncident } from '../lib/zone-share';
import { lastFix, quickFix } from '../lib/here';
import { getScene } from '../lib/scene';

/** Start a new incident (vehicle may be empty) — or return the one this unit already has running. */
export async function startIncident(vehicle = '', vehicleRef = ''): Promise<{ incident?: Incident; needUnit?: boolean }> {
  const mine = await getMyIncident();
  if (mine) return { incident: mine };
  const unit = await getMyUnit();
  if (!unit) return { needUnit: true };
  const g = (await myGroups())[0];
  if (!g) throw new Error('No zone to share to — join one in Menu → Zone sharing.');
  const fx = await quickFix().catch(() => null);
  const at = fx && fx !== 'denied' ? fx : lastFix();
  const sc = getScene();
  const incident = await shareIncident({ group_id: g.id, unit, vehicle, vehicle_ref: vehicleRef || null, place: '',
    lat: at?.lat ?? null, lng: at?.lng ?? null, wind_from_deg: sc.windSource !== 'none' && sc.windDeg != null ? Math.round(sc.windDeg) % 360 : null });
  return { incident };
}

export function ShareToZoneBtn({ vehicleRef, title }: { vehicleRef: string; title: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<Incident | null>(null);
  useFocusEffect(useCallback(() => { getMyIncident().then(setMine).catch(() => setMine(null)); }, []));
  async function go() {
    setErr(''); setBusy(true);
    try {
      const cur = await getMyIncident();
      if (cur) {
        // Your incident is running: this is the vehicle — attach it and go back to command.
        await updateIncident(cur.id, { vehicle: title, vehicle_ref: vehicleRef || null });
        r.push(`/command?incident=${cur.id}`);
      } else {
        const out = await startIncident(title, vehicleRef);
        if (out.needUnit) r.push(`/zone/share?ref=${encodeURIComponent(vehicleRef)}&title=${encodeURIComponent(title)}&next=command`);
        else if (out.incident) r.push(`/command?incident=${out.incident.id}`);
      }
    } catch (e) { setErr((e as Error).message || 'No signal — try again.'); }
    setBusy(false);
  }
  return (
    <>
      <Btn big tone="hazmat" icon="share" disabled={busy}
        label={busy ? 'Sending…' : mine ? 'Add to my incident' : 'Share to zone'}
        sub={mine ? `Your incident: ${mine.vehicle || 'vehicle not set'} — opens command` : 'One tap — starts an incident, opens command'} onPress={go} />
      {!!err && <Muted>{err}</Muted>}
    </>
  );
}
