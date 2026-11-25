// ForeFlight-style data packs. The App Store download is the shell; packs put the cut sheets ON the device.
//   core         — the 20 FULLCHARGE seed vehicles' manufacturer PDFs (from the manufacturer URLs)
//   nhtsa-rescue — every NHTSA rescue sheet, as page images: 200 dpi on iPhone, 300 dpi on iPad
//   nhtsa-erg    — every full NHTSA emergency response guide, as shrunk PDFs
// One manifest drives both NHTSA packs. Every file path contains a content hash, so updates fetch only what changed,
// and an old sheet stays usable until its replacement has fully downloaded.
import { AppState, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FS from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_READY, SUPABASE_URL, USE_MOCKS } from '../config';
import { DATA_VERSION, pdfUrl, VEHICLES } from '../data/catalog';
import { getSettings } from './history';
import { filesFor, Guide, PageImage, parseYears, resolveLocal } from './match-core';
import { Bundle, bundleKey, planDownload } from './bundle-core';

export type PackId = 'core' | 'nhtsa-rescue' | 'nhtsa-erg' | 'maps';
export type NhtsaPack = 'nhtsa-rescue' | 'nhtsa-erg';
const NHTSA: NhtsaPack[] = ['nhtsa-rescue', 'nhtsa-erg'];
const DOC: Record<NhtsaPack, string> = { 'nhtsa-rescue': 'rescue_sheet', 'nhtsa-erg': 'erg' };
const isNhtsa = (id: PackId): id is NhtsaPack => id === 'nhtsa-rescue' || id === 'nhtsa-erg';
export const packForDoc = (docType: string): NhtsaPack => (docType === 'rescue_sheet' ? 'nhtsa-rescue' : 'nhtsa-erg');

/** Image set for this device: iPad screens are ~2x wider, so they get the sharper set. */
export const IMAGE_SET: '200' | '300' = Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad ? '300' : '200';

// A file is either its own file on disk, or a slice of a downloaded bundle (offset/length) until first opened.
type FileRec = { uri: string; offset?: number; length?: number };
export type PackState = {
  status: 'none' | 'downloading' | 'paused' | 'done' | 'error';
  bytesDone: number; bytesTotal: number; fileIndex: number;
  version?: string; updatedAt?: number; error?: string;
  filesDone?: number; filesTotal?: number;
  interrupted?: boolean; // paused by the app going to background / closing — resume automatically
  files: Record<string, FileRec>; // core: vehicleId -> file · nhtsa: storage path -> file
};
export type PackDef = { id: PackId; name: string; required: boolean; blurb: string };
export type Manifest = {
  version: string; generatedAt: string; count: number; totalBytes?: number;
  byType?: Record<string, Record<string, { files: number; bytes: number }>>; guides: Guide[];
  bundles?: Record<string, Bundle[]>; // 'rescue_sheet:200' | 'rescue_sheet:300' | 'erg'
};

export const PACKS: PackDef[] = [
  { id: 'core', name: 'Core', required: true, blurb: 'The 20 FULLCHARGE vehicles\' manufacturer cut sheets. Small — get this first.' },
  { id: 'nhtsa-rescue', name: 'All rescue sheets (NHTSA)', required: false, blurb: 'Every cut sheet on the NHTSA portal — cut points, HV, 12V, airbags. Stored on this device; opens with no signal. Recommended.' },
  { id: 'nhtsa-erg', name: 'All full ERGs (NHTSA)', required: false, blurb: 'Every full emergency response guide — the long manuals. Optional. Wi-Fi.' },
  { id: 'maps', name: 'Offline maps', required: false, blurb: 'Satellite / map tiles by region. Not published yet — zone diagram works offline today.' },
];

const KEY = 'fullcharge.packs.v3';
const DIR = `${FS.documentDirectory}packs/`;
const MANIFEST_DIR = `${DIR}nhtsa/`;
const MANIFEST_FILE = `${MANIFEST_DIR}manifest.json`;
const PREV_FILE = `${MANIFEST_DIR}manifest.prev.json`;
const packDir = (id: PackId) => `${DIR}${id}/`;
const localPath = (id: PackId, file: string) => `${packDir(id)}${file.replace(/\//g, '_')}`;
const STORAGE = `${SUPABASE_URL}/storage/v1/object/public/packs/nhtsa`;
export const storageUrl = (file: string) => `${STORAGE}/${file}`;

const EMPTY: PackState = { status: 'none', bytesDone: 0, bytesTotal: 0, fileIndex: 0, files: {} };
let state: Record<string, PackState> = {};
let manifest: Manifest | null = null;  // installed index
let prev: Manifest | null = null;      // index before the last update — fallback while a pack catches up
let remote: Manifest | null = null;    // latest on the server (when online)
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getPackState = (id: PackId) => state[id] ?? EMPTY;

async function readJson<T>(uri: string): Promise<T | null> {
  try { return (await FS.getInfoAsync(uri)).exists ? (JSON.parse(await FS.readAsStringAsync(uri)) as T) : null; } catch { return null; }
}
export async function loadPacks() {
  if (loaded) return;
  try { state = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); } catch { state = {}; }
  for (const k of Object.keys(state)) if (state[k].status === 'downloading') state[k] = { ...state[k], status: 'paused', interrupted: true };
  manifest = await readJson<Manifest>(MANIFEST_FILE);
  // iOS suspends downloads when the app leaves the screen: pause cleanly, then pick up again on return.
  // Bundles keep downloading in iOS's background downloader when the app leaves the screen.
  // Single-file downloads can't, so they pause and pick up again when the app comes back.
  AppState.addEventListener('change', (st) => {
    if (st === 'background') {
      for (const id of running) pause(id, { auto: true });
      for (const t of [...fgBundles]) t.toBackground(); // hand big files to iOS's background downloader
    }
    if (st === 'active') { for (const id of running) restartPool.get(id)?.(); resumeInterrupted(); }
  });
  prev = await readJson<Manifest>(PREV_FILE);
  if (!manifest && USE_MOCKS) manifest = mockManifest();
  loaded = true;
  emit();
}
const save = () => AsyncStorage.setItem(KEY, JSON.stringify(state));
const set = (id: PackId, p: Partial<PackState>) => { state[id] = { ...getPackState(id), ...p }; save(); emit(); };
// During a download, state changes hundreds of times. Keep it in memory and let the UI (4×/s) and
// disk (every 3 s) catch up — writing the whole record on every progress tick was the main slowdown.
let uiTimer: ReturnType<typeof setTimeout> | null = null;
let diskTimer: ReturnType<typeof setTimeout> | null = null;
function setQuiet(id: PackId, p: Partial<PackState>) {
  state[id] = { ...getPackState(id), ...p };
  if (!uiTimer) uiTimer = setTimeout(() => { uiTimer = null; emit(); }, 250);
  if (!diskTimer) diskTimer = setTimeout(() => { diskTimer = null; save(); }, 3000);
}

export const coreReady = () => getPackState('core').status === 'done';
/** The cut sheets crews need on scene = the rescue-sheet pack. */
export const allReady = () => getPackState('nhtsa-rescue').status === 'done';

/** Offline cut-sheet index. Empty until a pack is downloaded once. */
export const guideIndex = (): Guide[] => manifest?.guides ?? [];
export const getGuide = (key: string) => guideIndex().find((g) => g.key === key) ?? remote?.guides.find((g) => g.key === key);
export const installedManifest = () => manifest;
export const remoteManifest = () => remote;

/** Files a guide needs on this device. */
export const guideFiles = (g: Guide): string[] => filesFor(g, IMAGE_SET);
const has = (id: PackId, file: string) => !!getPackState(id).files[file];

/** A guide's local copy — or, mid-update, the previous version's copy (never a gap). */
function localGuide(g: Guide): Guide | null {
  const id = packForDoc(g.docType);
  return resolveLocal(g, prev?.guides, (f) => has(id, f), IMAGE_SET);
}
export const guideOnPhone = (g: Guide) => !!localGuide(g);

export type SheetPage = PageImage & { uri: string; local: boolean };

/** Turn a bundle slice into its own file the first time it's needed (~200 KB page: a few ms). */
async function materialize(id: PackId, file: string): Promise<string | null> {
  const rec = getPackState(id).files[file];
  if (!rec) return null;
  if (rec.offset === undefined) return existing(rec.uri);
  const dest = localPath(id, file);
  if (!(await existing(dest))) {
    const b64 = await FS.readAsStringAsync(rec.uri, { encoding: FS.EncodingType.Base64, position: rec.offset, length: rec.length });
    await FS.writeAsStringAsync(dest, b64, { encoding: FS.EncodingType.Base64 });
  }
  getPackState(id).files[file] = { uri: dest };
  setQuiet(id, {});
  return dest;
}

/** Pages of an image sheet: local files when downloaded (pulled out of their bundle if needed), else server URLs. */
export async function sheetPageUris(g: Guide): Promise<SheetPage[]> {
  await loadPacks();
  const lg = localGuide(g);
  const src = lg ?? g;
  if (!src.images) return [];
  const id = packForDoc(g.docType);
  const pages = src.images[IMAGE_SET].pages;
  if (!lg) return pages.map((p) => ({ ...p, uri: storageUrl(p.file), local: false }));
  const uris = await Promise.all(pages.map((p) => materialize(id, p.file)));
  return pages.map((p, i) => ({ ...p, uri: uris[i] ?? storageUrl(p.file), local: !!uris[i] }));
}

async function existing(uri?: string) {
  if (!uri) return null;
  try { return (await FS.getInfoAsync(uri)).exists ? uri : null; } catch { return null; }
}
export async function cachedGuidePdf(key: string): Promise<string | null> {
  await loadPacks();
  const g = getGuide(key);
  const lg = g && !g.images ? localGuide(g) : null;
  return lg ? materialize(packForDoc(lg.docType), lg.file) : null;
}
/** Seed vehicle: core PDF, else a linked NHTSA PDF on the phone. */
export async function cachedPdf(vehicleId: string): Promise<string | null> {
  await loadPacks();
  const core = await existing(getPackState('core').files[vehicleId]?.uri);
  if (core) return core;
  for (const g of guideIndex().filter((x) => x.vehicleId === vehicleId && !x.images)) {
    const u = await cachedGuidePdf(g.key);
    if (u) return u;
  }
  return null;
}
/** Seed vehicle: a linked rescue sheet (image set) that's on the phone. */
export const linkedSheetOnPhone = (vehicleId: string) =>
  guideIndex().find((x) => x.vehicleId === vehicleId && x.images && guideOnPhone(x)) ?? null;

/** Where to open a sheet's ORIGINAL PDF (always needs signal). */
export const originalUrl = (g: Guide) => g.sourceUrl;
/** Where to stream a PDF-type sheet that isn't on the phone. */
export const guideRemoteUrl = (g: Guide) => (USE_MOCKS || !SUPABASE_URL || !g.file ? g.sourceUrl : storageUrl(g.file));

/** Fetch the server manifest (needs signal). */
export async function checkRemote(): Promise<Manifest | null> {
  if (USE_MOCKS) { remote = mockManifest(); emit(); return remote; }
  if (!BACKEND_READY) return null;
  try {
    const r = await fetch(`${STORAGE}/manifest.json?t=${Date.now()}`);
    if (!r.ok) return null;
    remote = (await r.json()) as Manifest;
    emit();
    return remote;
  } catch { return null; }
}

/** First launch (or a newer list on the server): install the vehicle / cut-sheet INDEX only — a small download —
 *  so search knows every NHTSA vehicle before any big pack is downloaded. Safe to call often; no-op offline. */
export async function ensureIndex(): Promise<void> {
  await loadPacks();
  if (USE_MOCKS || !BACKEND_READY) return;
  if (manifest && Date.now() - (lastIndexCheck || 0) < 6 * 3600_000) return;
  lastIndexCheck = Date.now();
  const m = await checkRemote();
  // Only install directly when no pack is mid-download; otherwise the pack's own update swaps the index.
  const busy = NHTSA.some((id) => getPackState(id).status === 'downloading');
  if (m && !busy && (!manifest || NHTSA.every((id) => getPackState(id).status === 'none'))) await installManifest(m);
}
let lastIndexCheck = 0;

/** Unique files a pack needs from a manifest, for this device. */
function packFiles(id: NhtsaPack, m: Manifest): { file: string; bytes: number }[] {
  const u = new Map<string, number>();
  for (const g of m.guides) {
    if (g.docType !== DOC[id]) continue;
    if (g.images) g.images[IMAGE_SET].pages.forEach((p) => u.set(p.file, p.bytes));
    else if (g.file) u.set(g.file, g.bytes || 0);
  }
  return [...u.entries()].map(([file, bytes]) => ({ file, bytes }));
}

export function updateAvailable(id: PackId): boolean {
  const s = getPackState(id);
  if (s.status !== 'done') return false;
  if (id === 'core') return s.version !== DATA_VERSION;
  if (isNhtsa(id)) return !!remote && remote.version !== s.version;
  return false;
}
/** Still to fetch: everything for a first install, only new / changed files for an update. */
export function pendingBytes(id: PackId): { bytes: number; files: number } | null {
  if (!isNhtsa(id)) return null;
  const m = remote ?? manifest;
  if (!m) return null;
  const todo = packFiles(id, m).filter((f) => !has(id, f.file));
  return { bytes: todo.reduce((a, f) => a + f.bytes, 0), files: todo.length };
}
/** Full size of a pack on this device. */
export function packSize(id: PackId): { bytes: number; files: number } | null {
  if (!isNhtsa(id)) return null;
  const m = remote ?? manifest;
  if (!m) return null;
  const f = packFiles(id, m);
  return { bytes: f.reduce((a, x) => a + x.bytes, 0), files: f.length };
}

export const freeSpace = () => FS.getFreeDiskStorageAsync().catch(() => NaN);

const running = new Set<PackId>();
const activeDl = new Map<PackId, Set<FS.DownloadResumable>>();
const pauseFlag = new Map<PackId, 'user' | 'auto'>();
// Parallel single files. Most rescue-sheet pages are ~200 KB, so round trips dominate, not bandwidth —
// Supabase storage sits behind a CDN that serves many requests at once, so more lanes = faster.
const CONCURRENCY = 12;
const BUNDLE_RETRIES = 2;

// Live speed: samples of bytes done per pack, last ~12 s.
const samples = new Map<PackId, { t: number; b: number }[]>();
function sample(id: PackId, bytes: number) {
  const now = Date.now();
  const list = samples.get(id) ?? [];
  const last = list[list.length - 1];
  if (last && now - last.t < 500) return;
  list.push({ t: now, b: bytes });
  while (list.length > 2 && now - list[0].t > 12_000) list.shift();
  samples.set(id, list);
}
/** Bytes per second over the last few seconds, or null before there's enough to tell. */
export function transferRate(id: PackId): number | null {
  const list = samples.get(id);
  if (!list || list.length < 3) return null;
  const a = list[0], b = list[list.length - 1];
  return b.t > a.t ? Math.max(0, ((b.b - a.b) * 1000) / (b.t - a.t)) : null;
}

/** A bundle download that runs in the foreground session while the app is on screen (full speed, starts at once)
 *  and is handed to iOS's background session when the app leaves the screen, so it keeps going. */
type BundleTask = { toBackground: () => void };
const fgBundles = new Set<BundleTask>();
type Job = { key: string; url: string; dest: string; bytes: number; check: 'pdf' | 'image' };

function jobsFor(id: PackId): { jobs: Job[]; bundles: Bundle[]; version: string; m?: Manifest } {
  if (id === 'core') {
    const have = getPackState('core').files;
    return { bundles: [], version: DATA_VERSION, jobs: VEHICLES.filter((v) => !have[v.id]).map((v) => ({ key: v.id, url: pdfUrl(v.erg_pdf_url), dest: `${packDir('core')}${v.id}.pdf`, bytes: 0, check: 'pdf' as const })) };
  }
  if (!isNhtsa(id)) throw new Error('Not published yet.');
  const m = remote ?? manifest;
  if (!m) throw new Error('Connect once to get the cut-sheet list.');
  const plan = planDownload(packFiles(id, m), (f) => has(id, f), m.bundles?.[bundleKey(DOC[id], IMAGE_SET)]);
  const jobs = plan.files
    .map((f) => ({ key: f.file, url: storageUrl(f.file), dest: localPath(id, f.file), bytes: f.bytes, check: f.file.endsWith('.webp') ? 'image' as const : 'pdf' as const }));
  return { jobs, bundles: plan.bundles, version: m.version, m };
}

async function installManifest(m: Manifest) {
  await FS.makeDirectoryAsync(MANIFEST_DIR, { intermediates: true }).catch(() => {});
  if (manifest && manifest.version !== m.version) {
    prev = manifest;
    if (!USE_MOCKS) await FS.writeAsStringAsync(PREV_FILE, JSON.stringify(prev));
  }
  manifest = m;
  if (!USE_MOCKS) await FS.writeAsStringAsync(MANIFEST_FILE, JSON.stringify(m));
  emit();
}

const restartPool = new Map<PackId, () => void>();
const stopPool = new Map<PackId, () => void>();

export async function startOrResume(id: PackId) {
  await loadPacks();
  if (id === 'maps') throw new Error('Offline maps are not published yet.');
  if (running.has(id)) { restartPool.get(id)?.(); return; }
  const { wifiOnly } = await getSettings();
  if (!USE_MOCKS && wifiOnly) {
    const net = await NetInfo.fetch();
    if (net.type !== 'wifi') throw new Error('Wi-Fi only is on. Connect to Wi-Fi, or turn it off below.');
  }
  if (isNhtsa(id) && !remote) await checkRemote();
  const s0 = getPackState(id);
  if (id === 'core' && s0.status === 'done' && s0.version !== DATA_VERSION) state[id] = { ...s0, files: {} }; // core update: refetch all

  const { jobs, bundles, version, m } = jobsFor(id);
  const needed = isNhtsa(id) && m ? new Set(packFiles(id, m).map((f) => f.file)) : null;
  running.add(id);
  pauseFlag.delete(id);
  activeDl.set(id, new Set());
  set(id, {
    status: 'downloading', error: undefined, interrupted: false, bytesDone: 0,
    bytesTotal: jobs.reduce((a, j) => a + j.bytes, 0) + bundles.reduce((a, b) => a + b.bytes, 0),
    filesDone: 0, filesTotal: jobs.length + bundles.reduce((a, b) => a + b.entries.filter((e) => needed?.has(e.file)).length, 0),
  });
  activateKeepAwakeAsync(`pack-${id}`).catch(() => {});
  await FS.makeDirectoryAsync(`${packDir(id)}bundles/`, { intermediates: true }).catch(() => {});
  // First install: index goes in now so search works at once. Updates: the old index stays until the end.
  if (isNhtsa(id) && m && !manifest) await installManifest(m);

  const queue = [...jobs];
  const failed: string[] = [];
  const retried = new Set<string>();
  const inflight = new Map<string, number>();
  let doneBytes = 0, doneFiles = 0;
  const files = getPackState(id).files; // mutated in place — no copying a 2,000-entry map per file
  samples.delete(id);
  const tick = () => {
    const bytesDone = doneBytes + [...inflight.values()].reduce((a, b) => a + b, 0);
    sample(id, bytesDone);
    setQuiet(id, { bytesDone, filesDone: doneFiles });
  };

  // 1) Bundles (~36 MB each). While the app is open they run in the normal (foreground) session: iOS gives
  //    background-session transfers lower priority and can hold them back, which made big packs crawl.
  //    When the app leaves the screen, each one is paused and resumed in the background session, so it keeps going.
  async function fetchBundle(b: Bundle) {
    const dest = `${packDir(id)}bundles/${b.file.split('/').pop()}`;
    const url = storageUrl(b.file);
    const progress = (p: FS.DownloadProgressData) => { inflight.set(b.file, p.totalBytesWritten); tick(); };
    const opts = (bg: boolean) => (bg ? { sessionType: FS.FileSystemSessionType.BACKGROUND } : {});
    let bg = AppState.currentState !== 'active';
    let dl = FS.createDownloadResumable(url, dest, opts(bg), progress);
    let run = () => dl.downloadAsync();
    let handoff: Promise<void> | null = null;
    const task: BundleTask = {
      toBackground: () => {
        if (bg || handoff) return;
        bg = true;
        fgBundles.delete(task);
        const old = dl;
        handoff = (async () => {
          let resume: string | undefined;
          try { resume = (await old.pauseAsync()).resumeData; } catch { /* finished or failed meanwhile */ }
          activeDl.get(id)?.delete(old);
          dl = FS.createDownloadResumable(url, dest, opts(true), progress, resume);
          activeDl.get(id)?.add(dl);
          run = resume ? () => dl.resumeAsync() : () => dl.downloadAsync();
        })();
      },
    };
    if (USE_MOCKS) return;
    activeDl.get(id)!.add(dl);
    if (!bg) fgBundles.add(task);
    let tries = 0;
    try {
      for (;;) {
        let res: FS.FileSystemDownloadResult | undefined;
        let threw = false;
        try { res = await run(); } catch { threw = true; }
        if (handoff) { await handoff; handoff = null; continue; } // now running in the background session
        if (pauseFlag.get(id) === 'user') { inflight.delete(b.file); return; }
        const info = res ? await FS.getInfoAsync(dest) : null;
        const ok = !threw && !!res && res.status === 200 && !!info?.exists && info.size === b.bytes;
        if (ok) break;
        // Dropped connection / bad file: start this bundle again (up to BUNDLE_RETRIES) instead of failing the pack.
        await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
        if (tries++ >= BUNDLE_RETRIES) { inflight.delete(b.file); failed.push(b.file); return; }
        inflight.delete(b.file);
        activeDl.get(id)?.delete(dl);
        await new Promise((r) => setTimeout(r, 1500 * tries));
        dl = FS.createDownloadResumable(url, dest, opts(bg), progress);
        activeDl.get(id)?.add(dl);
        run = () => dl.downloadAsync();
      }
      inflight.delete(b.file);
      for (const e of b.entries) if (!needed || needed.has(e.file)) { files[e.file] = { uri: dest, offset: e.offset, length: e.length }; doneFiles++; }
      doneBytes += b.bytes;
      tick();
    } finally { fgBundles.delete(task); activeDl.get(id)?.delete(dl); }
  }

  // 2) Single files (small updates): CONCURRENCY at a time while the app is open.
  async function worker() {
    while (queue.length && !pauseFlag.has(id)) {
      const j = queue.shift()!;
      try {
        if (USE_MOCKS) {
          await new Promise((r) => setTimeout(r, 15));
          files[j.key] = { uri: j.dest }; doneBytes += j.bytes || 2_000_000; doneFiles++; tick();
          continue;
        }
        const dl = FS.createDownloadResumable(j.url, j.dest, {}, j.bytes > 1_500_000 ? (p) => { inflight.set(j.key, p.totalBytesWritten); tick(); } : undefined);
        activeDl.get(id)!.add(dl);
        const res = await dl.downloadAsync();
        activeDl.get(id)!.delete(dl); inflight.delete(j.key);
        if (!res) { queue.unshift(j); return; } // paused mid-file: back on the queue
        const ct = res.headers['content-type'] ?? res.headers['Content-Type'] ?? '';
        const ok = res.status === 200 && (j.check === 'pdf' ? ct.includes('pdf') : ct.includes('image'));
        if (!ok) { failed.push(j.key); await FS.deleteAsync(j.dest, { idempotent: true }); continue; }
        files[j.key] = { uri: j.dest };
        doneBytes += j.bytes || (await FS.getInfoAsync(j.dest).then((i) => (i.exists ? i.size ?? 0 : 0)).catch(() => 0));
        doneFiles++;
        tick();
      } catch {
        inflight.delete(j.key);
        if (pauseFlag.has(id)) { queue.unshift(j); return; }
        // One quiet retry at the back of the queue — a dropped request shouldn't need a manual UPDATE.
        if (!retried.has(j.key)) { retried.add(j.key); queue.push(j); continue; }
        failed.push(j.key);
      }
    }
  }
  let workers = 0;
  let poolResolve: () => void = () => {};
  const poolDone = new Promise<void>((r) => { poolResolve = r; });
  const startPool = () => {
    if (pauseFlag.get(id) === 'auto') pauseFlag.delete(id);
    const n = Math.min(CONCURRENCY, queue.length) - workers;
    for (let i = 0; i < n; i++) {
      workers++;
      worker().finally(() => {
        workers--;
        // Finished, or the user paused. (Paused because the app went to background? Wait for it to come back.)
        if (workers === 0 && (queue.length === 0 || pauseFlag.get(id) === 'user')) poolResolve();
      });
    }
    if (workers === 0 && queue.length === 0) poolResolve();
  };
  restartPool.set(id, startPool);
  stopPool.set(id, () => { if (workers === 0) poolResolve(); });
  startPool();

  await Promise.all([poolDone, ...bundles.map(fetchBundle)]);
  restartPool.delete(id);
  stopPool.delete(id);
  running.delete(id);
  deactivateKeepAwake(`pack-${id}`);
  await save();

  if (pauseFlag.get(id) === 'user') { set(id, { status: 'paused', interrupted: false, bytesDone: doneBytes, filesDone: doneFiles }); return; }

  if (isNhtsa(id) && m) {
    // Swap to the new index, then remove this pack's files the new index no longer uses.
    // (The other NHTSA pack keeps its own files; until it updates, its sheets resolve through the previous index.)
    if (manifest?.version !== m.version) await installManifest(m);
    const keep = new Set(packFiles(id, m).map((f) => f.file));
    for (const k of Object.keys(files)) {
      if (keep.has(k)) continue;
      if (files[k].offset === undefined) await FS.deleteAsync(files[k].uri, { idempotent: true });
      delete files[k];
    }
    await pruneBundles(id);
  }
  set(id, {
    status: failed.length && doneFiles === 0 ? 'error' : 'done', version, updatedAt: Date.now(), bytesDone: doneBytes, filesDone: doneFiles,
    error: failed.length ? `${failed.length} download(s) failed — tap Update on Wi-Fi to retry.` : undefined,
  });
}

/** Get just these sheets onto the phone now (vehicle page "Download these") — seconds, not the whole pack.
 *  Files land in the same place the pack uses, so the pack later skips them. */
export async function downloadGuides(gs: Guide[], onProgress?: (done: number, total: number) => void): Promise<{ failed: number }> {
  await loadPacks();
  const jobs: { id: NhtsaPack; file: string }[] = [];
  for (const g of gs) {
    const id = packForDoc(g.docType);
    for (const f of guideFiles(g)) if (!has(id, f) && !jobs.some((j) => j.file === f)) jobs.push({ id, file: f });
  }
  let done = 0, failed = 0;
  onProgress?.(0, jobs.length);
  const q = [...jobs];
  async function worker() {
    while (q.length) {
      const j = q.shift()!;
      const dest = localPath(j.id, j.file);
      try {
        if (USE_MOCKS) await new Promise((r) => setTimeout(r, 120));
        else {
          await FS.makeDirectoryAsync(packDir(j.id), { intermediates: true }).catch(() => {});
          const res = await FS.downloadAsync(storageUrl(j.file), dest);
          const ct = res.headers['content-type'] ?? res.headers['Content-Type'] ?? '';
          if (res.status !== 200 || !(j.file.endsWith('.webp') ? ct.includes('image') : ct.includes('pdf'))) throw new Error('bad file');
        }
        getPackState(j.id).files[j.file] = { uri: dest };
        setQuiet(j.id, {});
      } catch { failed++; await FS.deleteAsync(dest, { idempotent: true }).catch(() => {}); }
      onProgress?.(++done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, worker));
  await save();
  emit();
  return { failed };
}

/** Delete bundles no file points into any more. */
async function pruneBundles(id: PackId) {
  const dir = `${packDir(id)}bundles/`;
  const used = new Set(Object.values(getPackState(id).files).filter((f) => f.offset !== undefined).map((f) => f.uri));
  const names = await FS.readDirectoryAsync(dir).catch(() => [] as string[]);
  for (const n of names) if (!used.has(`${dir}${n}`)) await FS.deleteAsync(`${dir}${n}`, { idempotent: true });
}

/** Pause. User pause stops everything; auto (app left the screen) stops only single files — bundles keep going. */
export async function pause(id: PackId, opts: { auto?: boolean } = {}) {
  if (!running.has(id)) return;
  if (opts.auto) { if (!pauseFlag.has(id)) pauseFlag.set(id, 'auto'); return; }
  pauseFlag.set(id, 'user');
  stopPool.get(id)?.();
  for (const dl of activeDl.get(id) ?? []) { try { await dl.pauseAsync(); } catch { /* ignore */ } }
}

/** After the app comes back (or restarts), carry on with downloads that were cut off — not ones the user paused. */
export async function resumeInterrupted() {
  await loadPacks();
  for (const id of ['core', ...NHTSA] as PackId[]) {
    const s = getPackState(id);
    if (s.status === 'paused' && s.interrupted && !running.has(id)) startOrResume(id).catch(() => {});
  }
}

export async function deletePack(id: PackId) {
  await FS.deleteAsync(packDir(id), { idempotent: true }).catch(() => {});
  state[id] = { ...EMPTY };
  await save(); emit();
}

export function usedBytes(): number {
  const core = getPackState('core').status === 'done' ? getPackState('core').bytesDone : 0;
  const m = manifest;
  if (!m) return core;
  return core + NHTSA.reduce((a, id) => a + packFiles(id, m).reduce((x, f) => x + (has(id, f.file) ? f.bytes : 0), 0), 0);
}

/** Mock: a manifest built from the seed vehicles so the whole flow is testable without a backend. */
function mockManifest(): Manifest {
  const guides: Guide[] = VEHICLES.flatMap((v) => (['rescue_sheet', 'erg'] as const).map((docType) => ({
    key: `mock-${docType}-${v.id}`, make: v.make, model: v.model, years: v.years, ...parseYears(v.years),
    powertrain: v.type.split(' ')[0], docType, sourceUrl: pdfUrl(v.erg_pdf_url),
    file: `pdfs/mock-${docType}-${v.id}.pdf`, bytes: docType === 'erg' ? 1_800_000 : 750_000, sha256: 'mock', vehicleId: v.id,
  })));
  return { version: 'mock-1', generatedAt: new Date().toISOString(), count: guides.length, guides };
}
