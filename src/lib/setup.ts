// Scene-ready: the one-time setup so the app works with no signal (cut sheets, VIN decoder, map areas),
// proven by an airplane-mode test. The home badge goes yellow when it's out of date.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateAvailable } from './packs';

export type Role = 'crew' | 'captain' | 'chief' | 'hazmat' | 'tow';
export const ROLES: { key: Role; label: string; sub: string }[] = [
  { key: 'crew', label: 'Firefighter', sub: 'Engine / truck crew' },
  { key: 'captain', label: 'Captain', sub: 'Company officer — command view optional' },
  { key: 'chief', label: 'Chief / Command', sub: 'Command view on (iPad: map + cut sheet side by side)' },
  { key: 'hazmat', label: 'Hazmat', sub: 'Guides, zones, chemistry first' },
  { key: 'tow', label: 'Tow operator', sub: 'Towing info — tow layout still being worked out' },
];

export type SetupState = {
  role?: Role;
  commandView?: boolean;
  readyAt?: number;                 // last airplane-mode test that passed
  checks?: Record<string, boolean>; // sheets / vin / maps
};
const KEY = 'fullcharge.setup.v1';
const STALE_MS = 30 * 24 * 3600_000;

let cur: SetupState | null = null;
const subs = new Set<() => void>();
export const subscribeSetup = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export async function getSetup(): Promise<SetupState> {
  if (!cur) { try { cur = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); } catch { cur = {}; } }
  return cur!;
}
export async function setSetup(p: Partial<SetupState>) {
  cur = { ...(await getSetup()), ...p };
  await AsyncStorage.setItem(KEY, JSON.stringify(cur)).catch(() => {});
  subs.forEach((f) => f());
}
/** Chiefs get command view by default; captains choose; others don't see it. */
export const commandDefault = (r?: Role) => r === 'chief';
export const commandOn = (s: SetupState) => (s.role === 'chief' || s.role === 'captain') && (s.commandView ?? commandDefault(s.role));

export type Readiness = 'ready' | 'stale' | 'not';
export function readiness(s: SetupState, now = Date.now()): { level: Readiness; why?: string } {
  if (!s.readyAt) return { level: 'not' };
  if (now - s.readyAt > STALE_MS) return { level: 'stale', why: 'Last checked over 30 days ago' };
  if (updateAvailable('nhtsa-rescue') || updateAvailable('core')) return { level: 'stale', why: 'New cut sheets to download' };
  return { level: 'ready' };
}
