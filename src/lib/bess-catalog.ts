// Home-battery catalog on the device: every UL 9540 system on the CEC list, grouped into product families.
// Small JSON — fetched once with signal, kept on the phone, refreshed every few hours when online.
import * as FS from 'expo-file-system/legacy';
import { BACKEND_READY, SUPABASE_URL, USE_MOCKS } from '../config';
import { BESS as CURATED } from '../data/catalog';
import { BessCatalog, BessFamily, Chem } from './bess-core';

const FILE = `${FS.documentDirectory}packs/bess/catalog.json`;
const URL_ = `${SUPABASE_URL}/storage/v1/object/public/packs/bess/catalog.json`;
let cat: BessCatalog | null = null;
let loaded = false;
let lastCheck = 0;
const subs = new Set<() => void>();
export const subscribeBess = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const emit = () => subs.forEach((f) => f());

export async function loadBessCatalog(): Promise<BessCatalog | null> {
  if (!loaded) {
    loaded = true;
    try { if ((await FS.getInfoAsync(FILE)).exists) cat = JSON.parse(await FS.readAsStringAsync(FILE)); } catch { cat = null; }
    if (!cat && USE_MOCKS) cat = mockCatalog();
    emit();
  }
  return cat;
}

/** Fetch a newer catalog when online. No-op offline / in mock mode. */
export async function ensureBessCatalog() {
  await loadBessCatalog();
  if (USE_MOCKS || !BACKEND_READY || Date.now() - lastCheck < 6 * 3600_000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(`${URL_}?t=${Date.now()}`);
    if (!r.ok) return;
    const next = (await r.json()) as BessCatalog;
    if (!next?.families?.length || next.version === cat?.version) return;
    await FS.makeDirectoryAsync(`${FS.documentDirectory}packs/bess/`, { intermediates: true }).catch(() => {});
    await FS.writeAsStringAsync(FILE, JSON.stringify(next));
    cat = next; emit();
  } catch { /* offline */ }
}

export const bessFamilies = (): BessFamily[] => cat?.families ?? [];
export const getFamily = (id: string) => bessFamilies().find((f) => f.id === id);
export const bessCatalogInfo = () => (cat ? { version: cat.version, source: cat.source, count: cat.count } : null);

/** Chemistry for hazard / zone screens: a verified card's value wins over the listing text. */
export function familyChem(f: BessFamily): { chem: Chem | string; verified: boolean } {
  const c = f.curatedId ? CURATED.find((b) => b.id === f.curatedId) : undefined;
  if (c?.chemistry_verified) return { chem: c.chemistry, verified: true };
  return { chem: f.chemistry, verified: false };
}

function mockCatalog(): BessCatalog {
  const families: BessFamily[] = CURATED.map((b) => ({
    id: `mock-${b.id}`, brand: b.name.split(' ')[0], manufacturer: b.name.split(' ')[0], family: b.name.split(' ').slice(1).join(' '),
    chemistry: (b.chemistry as Chem) ?? 'Unknown', kwhMin: parseFloat(b.kwh_usable) || null, kwhMax: parseFloat(b.kwh_usable) || null,
    residential: true, curatedId: b.id, models: [{ model: b.name, kwh: parseFloat(b.kwh_usable) || null, kw: null, vac: 240, description: b.coupling }],
  }));
  return { version: 'mock-1', source: 'mock', fetchedAt: new Date().toISOString(), count: families.length, families };
}
