// Pure VIN / catalog-matching logic. No React Native imports — unit-tested in node.

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export const normalizeVin = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const looksLikeVin = (s: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(s));

/** North-American check digit (position 9). Non-NA VINs may legitimately fail — warn, never block. */
export function checkDigitOk(vin: string): boolean {
  const v = normalizeVin(vin);
  if (v.length !== 17) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i];
    const n = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    if (n === undefined) return false;
    sum += n * WEIGHTS[i];
  }
  const r = sum % 11;
  return v[8] === (r === 10 ? 'X' : String(r));
}

/** Model year from position 10; picks the latest 30-year cycle not after next year. */
export function modelYear(vin: string, now = new Date()): number | null {
  const idx = YEAR_CODES.indexOf(normalizeVin(vin)[9] ?? '');
  if (idx < 0) return null;
  const max = now.getFullYear() + 1;
  let y = 1980 + idx;
  while (y + 30 <= max) y += 30;
  return y;
}

// Offline WMI → make (first 3 chars). Make guess only — model needs the online decode.
const WMI: Record<string, string> = {
  '5YJ': 'Tesla', '7SA': 'Tesla', 'LRW': 'Tesla', 'XP7': 'Tesla', '7G2': 'Tesla',
  '1V2': 'Volkswagen', 'WVG': 'Volkswagen', 'WVW': 'Volkswagen',
  WA1: 'Audi', WAU: 'Audi',
  W1N: 'Mercedes-Benz', W1K: 'Mercedes-Benz', '4JG': 'Mercedes-Benz',
  WBA: 'BMW', WBY: 'BMW', '5UX': 'BMW',
  '3FM': 'Ford', '1FT': 'Ford', '1FM': 'Ford',
  KM8: 'Hyundai', KMH: 'Hyundai', '7YA': 'Hyundai',
  KND: 'Kia', KNA: 'Kia',
  '7FC': 'Rivian', '7PD': 'Rivian',
  '3GN': 'Chevrolet', '1GN': 'Chevrolet', '1G1': 'Chevrolet', '3G1': 'Chevrolet',
  '1GT': 'GMC', '1GK': 'GMC',
  '50E': 'Lucid',
  '1C4': 'Jeep',
  JTM: 'Toyota', JTD: 'Toyota', JTE: 'Toyota',
};
export const wmiMake = (vin: string) => WMI[normalizeVin(vin).slice(0, 3)] ?? null;

export type Decoded = {
  make?: string; model?: string; year?: number | null; trim?: string;
  electrification?: string; // e.g. "BEV (Battery Electric Vehicle)", "PHEV ..."
};

export type CatalogMatch = { vehicleId: string; reason: string; strength: 'model' | 'make-only' };

const n = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

type Rule = { make: string; test: (m: string, d: Decoded) => boolean; id: string };
const RULES: Rule[] = [
  { make: 'tesla', id: 'model-y', test: (m) => m === 'modely' },
  { make: 'tesla', id: 'model-3', test: (m) => m === 'model3' },
  { make: 'volkswagen', id: 'id4', test: (m) => m.startsWith('id4') },
  { make: 'audi', id: 'q4-etron', test: (m) => m.startsWith('q4') },
  { make: 'mercedesbenz', id: 'eqb', test: (m) => m.startsWith('eqb') },
  { make: 'bmw', id: 'bmw-i5', test: (m) => m === 'i5' },
  { make: 'bmw', id: 'bmw-i7', test: (m) => m === 'i7' },
  { make: 'ford', id: 'mach-e', test: (m) => m.includes('mache') },
  { make: 'ford', id: 'f150-lightning', test: (m, d) => m.startsWith('f150') && (isBev(d) || n(d.trim).includes('lightning') || m.includes('lightning')) },
  { make: 'hyundai', id: 'ioniq-5', test: (m) => m.startsWith('ioniq5') },
  { make: 'kia', id: 'ev6', test: (m) => m === 'ev6' },
  { make: 'rivian', id: 'r1t', test: (m) => m === 'r1t' },
  { make: 'rivian', id: 'r1s', test: (m) => m === 'r1s' },
  { make: 'chevrolet', id: 'equinox-ev', test: (m, d) => m.startsWith('equinox') && (m.includes('ev') || isBev(d)) },
  { make: 'chevrolet', id: 'blazer-ev', test: (m, d) => m.startsWith('blazer') && (m.includes('ev') || isBev(d)) },
  { make: 'gmc', id: 'hummer-ev', test: (m) => m.startsWith('hummer') },
  { make: 'lucid', id: 'lucid-air', test: (m) => m.startsWith('air') },
  { make: 'jeep', id: 'wrangler-4xe', test: (m, d) => m.startsWith('wrangler') && (m.includes('4xe') || isPhev(d)) },
  { make: 'toyota', id: 'bz4x', test: (m) => m.startsWith('bz4x') },
  { make: 'toyota', id: 'prius-prime', test: (m, d) => m.includes('priusprime') || (m.startsWith('prius') && isPhev(d)) },
];
const isBev = (d: Decoded) => /bev|battery electric/i.test(d.electrification ?? '');
const isPhev = (d: Decoded) => /phev|plug-in/i.test(d.electrification ?? '');

/** Map a decode to catalog ids. Never auto-opens — caller shows a confirm step. */
export function matchCatalog(d: Decoded, catalog: { id: string; make: string }[]): CatalogMatch[] {
  const mk = n(d.make);
  if (!mk) return [];
  const m = n(d.model);
  const hit = RULES.find((r) => r.make === mk && m && r.test(m, d));
  if (hit) return [{ vehicleId: hit.id, reason: `${d.year ?? ''} ${d.make} ${d.model}${d.trim ? ' ' + d.trim : ''}`.trim(), strength: 'model' }];
  return catalog
    .filter((v) => n(v.make) === mk)
    .map((v) => ({ vehicleId: v.id, reason: `Make ${d.make} only — model not matched`, strength: 'make-only' as const }));
}

/** Pull a VIN out of whatever a barcode / photo read returned.
 *  - Door-jamb Code 39 labels often prefix the VIN with "I" (import) — 18 chars.
 *  - Data Matrix / QR codes may hold the VIN plus other fields.
 *  Prefers a 17-character run that passes the check digit; otherwise the first plausible one. */
export function extractVin(raw: string): { vin: string; checked: boolean } | null {
  const up = (raw ?? '').toUpperCase();
  const runs = up.split(/[^A-Z0-9]+/).filter(Boolean);
  const cands: string[] = [];
  for (const r of runs) {
    if (r.length === 18 && r.startsWith('I')) cands.push(r.slice(1));
    for (let i = 0; i + 17 <= r.length; i++) cands.push(r.slice(i, i + 17));
  }
  const valid = cands.filter((c) => /^[A-HJ-NPR-Z0-9]{17}$/.test(c));
  const good = valid.find((c) => checkDigitOk(c));
  if (good) return { vin: good, checked: true };
  return valid.length ? { vin: valid[0], checked: false } : null;
}
