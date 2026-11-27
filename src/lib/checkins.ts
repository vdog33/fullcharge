// Scene check-ins (shown as "APP CHECK-IN" — self check-in on this app only, never dispatch data): responding = "I'm coming" (listed by unit) or watching = "Just looking" (not shown).
// Info only — Tablet Command / the MDC is the real tracking and accountability system.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type CheckStatus = 'responding' | 'watching';
export type Checkin = { incident_id: string; device_id: string; unit: string; status: CheckStatus; updated_at: string };

let dev: string | null = null;
/** A random ID for this phone (no personal data), so a check-in can be changed later. */
export async function deviceId(): Promise<string> {
  if (dev) return dev;
  dev = await AsyncStorage.getItem('fullcharge.deviceId').catch(() => null);
  if (!dev) {
    dev = Array.from({ length: 24 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
    await AsyncStorage.setItem('fullcharge.deviceId', dev).catch(() => {});
  }
  return dev;
}

export async function checkIn(incidentId: string, status: CheckStatus, unit: string) {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.from('zone_checkins').upsert({
    incident_id: incidentId, device_id: await deviceId(), unit: unit.trim(), status, user_id: data.user?.id ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'incident_id,device_id' });
  if (error) throw new Error(error.message);
}

export async function listCheckins(incidentId: string): Promise<Checkin[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('zone_checkins').select('*').eq('incident_id', incidentId).order('updated_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Checkin[];
}

export function watchCheckins(incidentId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase.channel(`checkins-${incidentId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'zone_checkins', filter: `incident_id=eq.${incidentId}` }, () => onChange())
    .subscribe();
  return () => { supabase?.removeChannel(ch); };
}
