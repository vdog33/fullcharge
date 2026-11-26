// Offline VIN decoder file on the phone (NHTSA vPIC data, trimmed on the PC). Downloaded once with signal —
// from Scene-ready setup or Downloads — then VINs decode to make + model with no signal.
import * as FS from 'expo-file-system/legacy';
import { BACKEND_READY, SUPABASE_URL, USE_MOCKS } from '../config';
import { decodeOffline, OfflineDecode, VinDb } from './vin-offline-core';

const DIR = `${FS.documentDirectory}packs/vin/`;
const FILE = `${DIR}vin-db.json`;
const URL_ = `${SUPABASE_URL}/storage/v1/object/public/packs/vin/vin-db.json`;
let db: VinDb | null = null;
let tried = false;

export type VinDbState = { onPhone: boolean; version?: string; bytes?: number };
export async function vinDbState(): Promise<VinDbState> {
  const i = await FS.getInfoAsync(FILE).catch(() => null);
  if (!i?.exists) return { onPhone: false };
  return { onPhone: true, bytes: (i as { size?: number }).size, version: (await load())?.version };
}

async function load(): Promise<VinDb | null> {
  if (db || tried) return db;
  tried = true;
  try { if ((await FS.getInfoAsync(FILE)).exists) db = JSON.parse(await FS.readAsStringAsync(FILE)); } catch { db = null; }
  return db;
}

/** Download (or refresh) the offline VIN file. Old copy stays until the new one is complete. */
export async function downloadVinDb(): Promise<{ ok: boolean; msg: string }> {
  if (USE_MOCKS || !BACKEND_READY) return { ok: false, msg: 'Not available in this build.' };
  try {
    await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const tmp = `${FILE}.part`;
    const r = await FS.downloadAsync(`${URL_}?t=${Date.now()}`, tmp);
    if (r.status !== 200) { await FS.deleteAsync(tmp, { idempotent: true }); return { ok: false, msg: r.status === 404 ? 'Offline VIN file not published yet.' : `Download failed (${r.status}).` }; }
    const next = JSON.parse(await FS.readAsStringAsync(tmp)) as VinDb;
    if (!next?.wmi) throw new Error('bad file');
    await FS.moveAsync({ from: tmp, to: FILE }).catch(async () => { await FS.deleteAsync(FILE, { idempotent: true }); await FS.moveAsync({ from: tmp, to: FILE }); });
    db = next; tried = true;
    return { ok: true, msg: 'Offline VIN decoder on this phone.' };
  } catch { return { ok: false, msg: 'No signal — try again with signal.' }; }
}

export async function decodeVinOffline(vin: string, year: number | null): Promise<OfflineDecode | null> {
  const d = await load();
  return d ? decodeOffline(d, vin, year) : null;
}
