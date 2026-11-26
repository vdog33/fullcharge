// Official ERG PDFs kept ON THE PHONE: every guide the app sends crews to, plus the full ERG 2024.
// Downloaded once with signal (quietly at launch, or Downloads / Scene-ready setup) — then they open with no signal.
import * as FS from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { ERG147 } from '../data/catalog';

export type ErgDoc = { key: string; title: string; url: string };
const guide = (n: string, t: string): ErgDoc => ({ key: n, title: `Guide ${n} — ${t}`, url: `https://cameochemicals.noaa.gov/erg_guides/en/Guide_${n}.pdf` });
/** Every ERG guide the app points to (by battery chemistry / fuel), and the whole book. */
export const ERG_DOCS: ErgDoc[] = [
  guide('147', 'Lithium-ion / sodium-ion batteries'),
  guide('138', 'Lithium-metal batteries'),
  guide('171', 'Nickel-metal hydride (hybrids)'),
  guide('154', 'Lead-acid (12V)'),
  guide('115', 'Hydrogen (fuel-cell cars)'),
  guide('125', 'Hydrogen fluoride (Li-ion fire gas)'),
  { key: 'full', title: 'Full ERG 2024 (PHMSA)', url: ERG147.full_erg_2024_pdf_url },
];
const DIR = `${FS.documentDirectory}erg/`;
export const ergFile = (key: string) => `${DIR}${key === 'full' ? 'ERG2024' : `Guide_${key}`}.pdf`;
export const ergDoc = (key: string) => ERG_DOCS.find((d) => d.key === key) ?? guide(key, '');

export async function haveErg(key: string) { return (await FS.getInfoAsync(ergFile(key)).catch(() => ({ exists: false }))).exists; }
export async function ergState(): Promise<{ have: number; total: number; missing: string[] }> {
  const missing: string[] = [];
  for (const d of ERG_DOCS) if (!(await haveErg(d.key))) missing.push(d.key);
  return { have: ERG_DOCS.length - missing.length, total: ERG_DOCS.length, missing };
}

/** Download one (kept only if it really is a PDF). */
export async function fetchErg(key: string): Promise<boolean> {
  const d = ergDoc(key);
  await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const tmp = `${ergFile(key)}.part`;
  try {
    const r = await FS.downloadAsync(d.url, tmp);
    const head = await FS.readAsStringAsync(tmp, { encoding: FS.EncodingType.Base64, length: 8, position: 0 }).catch(() => '');
    if (r.status !== 200 || !head.startsWith('JVBER')) throw new Error('not a PDF'); // "%PDF" in base64
    await FS.deleteAsync(ergFile(key), { idempotent: true });
    await FS.moveAsync({ from: tmp, to: ergFile(key) });
    return true;
  } catch { await FS.deleteAsync(tmp, { idempotent: true }).catch(() => {}); return false; }
}

let running: Promise<{ ok: number; failed: number }> | null = null;
/** Get every missing ERG PDF. Safe to call often; does nothing when all are on the phone or there's no signal. */
export function ensureErgPdfs(onProgress?: (done: number, total: number) => void) {
  if (running) return running;
  running = (async () => {
    const { missing } = await ergState();
    if (!missing.length) return { ok: 0, failed: 0 };
    if ((await NetInfo.fetch()).isConnected === false) return { ok: 0, failed: missing.length };
    let ok = 0, failed = 0, i = 0;
    for (const k of missing) { (await fetchErg(k)) ? ok++ : failed++; onProgress?.(++i, missing.length); }
    return { ok, failed };
  })().finally(() => { running = null; });
  return running;
}
