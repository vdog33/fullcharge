// Confirmed rescue-sheet callouts on the device. Small JSON — fetched with signal, kept on the phone.
import * as FS from 'expo-file-system/legacy';
import { BACKEND_READY, SUPABASE_URL, USE_MOCKS } from '../config';
import { CalloutFile, confirmedFor } from './callouts-core';

const DIR = `${FS.documentDirectory}packs/callouts/`;
const FILE = `${DIR}callouts.json`;
const URL_ = `${SUPABASE_URL}/storage/v1/object/public/packs/callouts/callouts.json`;
let data: CalloutFile | null = null;
let loaded = false;
let lastCheck = 0;
const subs = new Set<() => void>();
export const subscribeCallouts = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const emit = () => subs.forEach((f) => f());

async function load() {
  if (loaded) return;
  loaded = true;
  try { if ((await FS.getInfoAsync(FILE)).exists) data = JSON.parse(await FS.readAsStringAsync(FILE)); } catch { data = null; }
  emit();
}

export async function ensureCallouts() {
  await load();
  if (USE_MOCKS || !BACKEND_READY || Date.now() - lastCheck < 3 * 3600_000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(`${URL_}?t=${Date.now()}`);
    if (!r.ok) return;
    const next = (await r.json()) as CalloutFile;
    if (!next?.sheets || next.version === data?.version) return;
    await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    await FS.writeAsStringAsync(FILE, JSON.stringify(next));
    data = next; emit();
  } catch { /* offline */ }
}

export const calloutsFor = (guideKey: string) => confirmedFor(data, guideKey);
