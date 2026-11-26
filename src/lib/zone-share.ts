// Zone sharing: invite-only groups of nearby departments. A unit shares an incident card — unit, vehicle,
// where, when, wind — and every member's phone gets it live. Info only: never approach instructions.
// Needs sign-in (Settings) and signal. Scenes clear on their own after 6 hours.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { BETA } from '../config';

/** BETA: one open test zone — no sign-in, no code; everyone on the beta sees and can update every scene in it.
 *  (supabase/migrations/0007_open_test_zone.sql). Invite-only groups still work alongside it for signed-in users. */
export const OPEN_ZONE = BETA;
export const OPEN_ZONE_ID = '00000000-0000-0000-0000-0000000000be';
const UNIT_KEY = 'fullcharge.zoneUnit';
export const getMyUnit = async () => (await AsyncStorage.getItem(UNIT_KEY).catch(() => null)) ?? '';
export const setMyUnit = (u: string) => AsyncStorage.setItem(UNIT_KEY, u.trim()).catch(() => {});

export type ZoneGroup = { id: string; name: string; invite_code: string; created_by: string };
export type Incident = {
  id: string; group_id: string; created_by: string | null; unit: string; vehicle: string; vehicle_ref: string | null;
  place: string; lat: number | null; lng: number | null; wind_from_deg: number | null;
  status: 'active' | 'cleared'; created_at: string; updated_at: string; expires_at: string;
};

const need = () => { if (!supabase) throw new Error('Zone sharing needs the live backend.'); return supabase; };
const msg = (e: { message?: string } | null) => { if (e) throw new Error(e.message?.replace(/^.*?: /, '') || 'Something went wrong — try again.'); };

export async function myGroups(): Promise<(ZoneGroup & { unit: string })[]> {
  const sb = need();
  const open = OPEN_ZONE ? [{ id: OPEN_ZONE_ID, name: 'Beta test zone (open)', invite_code: '', created_by: '', unit: await getMyUnit() }] : [];
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return open;
  const { data, error } = await sb.from('zone_members').select('unit, zone_groups(id, name, invite_code, created_by)').eq('user_id', u.user.id);
  msg(error);
  return [...open, ...(data ?? []).map((r: { unit: string; zone_groups: ZoneGroup | ZoneGroup[] }) => ({ ...(Array.isArray(r.zone_groups) ? r.zone_groups[0] : r.zone_groups), unit: r.unit }))
    .filter((g) => g.id !== OPEN_ZONE_ID)];
}
export async function createZone(name: string, unit: string) {
  const { data, error } = await need().rpc('create_zone', { p_name: name, p_unit: unit }); msg(error);
  return (data as { id: string; invite_code: string }[])[0];
}
export async function joinZone(code: string, unit: string) { const { error } = await need().rpc('join_zone', { p_code: code, p_unit: unit }); msg(error); }
export async function leaveZone(groupId: string) {
  const sb = need(); const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('zone_members').delete().eq('group_id', groupId).eq('user_id', u.user?.id ?? ''); msg(error);
}

export async function liveIncidents(groupIds: string[]): Promise<Incident[]> {
  if (!groupIds.length) return [];
  const { data, error } = await need().from('zone_incidents').select('*').in('group_id', groupIds)
    .eq('status', 'active').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(50);
  msg(error);
  return (data ?? []) as Incident[];
}
export async function shareIncident(p: Pick<Incident, 'group_id' | 'unit' | 'vehicle' | 'vehicle_ref' | 'place' | 'lat' | 'lng' | 'wind_from_deg'>) {
  const sb = need(); const { data: u } = await sb.auth.getUser();
  if (!u.user && p.group_id !== OPEN_ZONE_ID) throw new Error('Sign in first (Settings).');
  if (p.unit) setMyUnit(p.unit);
  const { data, error } = await sb.from('zone_incidents').insert({ ...p, created_by: u.user?.id ?? null }).select('*').single(); msg(error);
  return data as Incident;
}
export async function updateIncident(id: string, p: Partial<Pick<Incident, 'wind_from_deg' | 'place' | 'lat' | 'lng' | 'status'>>) {
  const { error } = await need().from('zone_incidents').update(p).eq('id', id); msg(error);
}

/** Live: calls back on any new / changed incident in my groups (RLS limits it to my groups). */
export function watchIncidents(onChange: (i: Incident, kind: 'new' | 'update') => void): () => void {
  if (!supabase) return () => {};
  const ch = supabase.channel(`zone-incidents-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'zone_incidents' },
      (p: { eventType: string; new: Incident }) => onChange(p.new, p.eventType === 'INSERT' ? 'new' : 'update'))
    .subscribe();
  return () => { supabase?.removeChannel(ch); };
}

/** "12 min ago" — scenes are about minutes. */
export function ago(iso: string, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
