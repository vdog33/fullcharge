import AsyncStorage from '@react-native-async-storage/async-storage';

// Recents: every vehicle/BESS view, deduped, newest first. 60 stored, 12 shown.
// ID history: {topMatch, confirmedId} per attempt. 30 stored, 10 shown, user-clearable.
const RECENTS = 'fullcharge.recents.v1';
const IDHIST = 'fullcharge.idhistory.v1';
const SETTINGS = 'fullcharge.settings.v1';

export type Recent = { kind: 'vehicle' | 'bess' | 'guide'; id: string; at: number; label?: string };
export type IdAttempt = {
  at: number;
  topMatch: string | null;           // label, e.g. "2020–2024 Tesla Model Y"
  candidates: { label: string; vehicleId?: string; confidence: number }[];
  confirmedId: string | null;        // FULLCHARGE vehicle id, or "guide:<key>" for an NHTSA-only sheet
  confirmedLabel?: string;
  correction?: string;               // "No, it was ___"
  attemptId?: string;                // server row
  feedbackToken?: string;
  source: 'camera' | 'vin';
};
export type Settings = { wifiOnly: boolean; sharePhotos: boolean };

async function read<T>(k: string, d: T): Promise<T> {
  try {
    const s = await AsyncStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
}
const write = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v));

export const RECENTS_SHOWN = 12;
export const IDHIST_SHOWN = 10;

export function addRecentPure(list: Recent[], r: Omit<Recent, 'at'>, now = Date.now()): Recent[] {
  return [{ ...r, at: now }, ...list.filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, 60);
}
export async function logView(kind: Recent['kind'], id: string, label?: string) {
  await write(RECENTS, addRecentPure(await read<Recent[]>(RECENTS, []), { kind, id, label }));
}
export const getRecents = () => read<Recent[]>(RECENTS, []);
export const clearRecents = () => write(RECENTS, []);

export async function logIdAttempt(a: IdAttempt) {
  const list = await read<IdAttempt[]>(IDHIST, []);
  await write(IDHIST, [a, ...list].slice(0, 30));
}
export async function updateIdAttempt(at: number, patch: Partial<IdAttempt>) {
  const list = await read<IdAttempt[]>(IDHIST, []);
  await write(IDHIST, list.map((x) => (x.at === at ? { ...x, ...patch } : x)));
}
export const getIdHistory = () => read<IdAttempt[]>(IDHIST, []);
export const clearIdHistory = () => write(IDHIST, []);

export const getSettings = () => read<Settings>(SETTINGS, { wifiOnly: true, sharePhotos: false });
export async function setSettings(p: Partial<Settings>) {
  await write(SETTINGS, { ...(await getSettings()), ...p });
}
