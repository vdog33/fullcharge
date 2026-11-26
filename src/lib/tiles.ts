// Offline map areas on the phone: up to 3 boxes drawn in setup, aerial tiles saved to the device.
// Tiles are shared between overlapping areas; deleting an area removes only tiles no other area uses.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { Area, BBox, countTiles, MAX_AREA_TILES, MAX_AREAS, TILE_URL, tilesIn } from './tiles-core';

const KEY = 'fullcharge.mapAreas.v1';
const ROOT = `${FS.documentDirectory}tiles/`;
/** For <LocalTile pathTemplate>: a plain file path, not a file:// URL. */
export const TILE_PATH_TEMPLATE = `${ROOT.replace(/^file:\/\//, '')}{z}/{x}/{y}.jpg`;
const tilePath = (z: number, x: number, y: number) => `${ROOT}${z}/${x}/${y}.jpg`;

let areas: Area[] = [];
let loaded = false;
const subs = new Set<() => void>();
export const subscribeAreas = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const emit = () => subs.forEach((f) => f());
const save = () => AsyncStorage.setItem(KEY, JSON.stringify(areas)).catch(() => {});

export async function loadAreas(): Promise<Area[]> {
  if (!loaded) {
    loaded = true;
    try { areas = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { areas = []; }
  }
  return areas;
}
export const getAreas = () => areas;
export const hasOfflineTiles = () => areas.some((a) => a.done && a.done >= a.tiles);

export async function addArea(name: string, box: BBox): Promise<Area | string> {
  await loadAreas();
  if (areas.length >= MAX_AREAS) return `Up to ${MAX_AREAS} areas — delete one first.`;
  const tiles = countTiles(box);
  if (tiles > MAX_AREA_TILES) return 'That area is too big — zoom in and try again.';
  const a: Area = { id: String(Date.now()), name: name.trim() || `Area ${areas.length + 1}`, box, tiles, done: 0 };
  areas = [...areas, a]; await save(); emit();
  return a;
}

const running = new Map<string, { stop: boolean }>();
export const isDownloading = (id: string) => running.has(id);

/** Download (or finish) an area. Re-running skips tiles already on the phone. */
export async function downloadArea(id: string, onProgress?: (done: number, total: number) => void): Promise<{ failed: number }> {
  await loadAreas();
  const a = areas.find((x) => x.id === id);
  if (!a || running.has(id)) return { failed: 0 };
  const flag = { stop: false };
  running.set(id, flag); emit();
  const list = [...tilesIn(a.box)];
  const madeDirs = new Set<string>();
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (!flag.stop && i < list.length) {
      const [z, x, y] = list[i++];
      const dest = tilePath(z, x, y);
      try {
        if (!(await FS.getInfoAsync(dest)).exists) {
          const dir = `${ROOT}${z}/${x}/`;
          if (!madeDirs.has(dir)) { await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {}); madeDirs.add(dir); }
          const r = await FS.downloadAsync(TILE_URL(z, x, y), dest);
          // Outside imagery coverage the server answers with an error or a tiny blank — don't keep those.
          if (r.status !== 200) { await FS.deleteAsync(dest, { idempotent: true }); if (r.status !== 404) failed++; }
        }
      } catch { failed++; }
      done++;
      if (done % 25 === 0 || done === list.length) { a.done = done - failed; onProgress?.(done, list.length); emit(); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  a.done = done - failed; a.at = Date.now();
  running.delete(id); await save(); emit();
  return { failed };
}
export const stopArea = (id: string) => { const f = running.get(id); if (f) f.stop = true; };

export async function deleteArea(id: string) {
  await loadAreas();
  stopArea(id);
  const gone = areas.find((a) => a.id === id);
  areas = areas.filter((a) => a.id !== id);
  await save(); emit();
  if (!gone) return;
  const keep = new Set<string>();
  for (const a of areas) for (const [z, x, y] of tilesIn(a.box)) keep.add(`${z}/${x}/${y}`);
  for (const [z, x, y] of tilesIn(gone.box)) if (!keep.has(`${z}/${x}/${y}`)) await FS.deleteAsync(tilePath(z, x, y), { idempotent: true }).catch(() => {});
}

/** Airplane-mode test: a sample of tiles really are files on the phone. */
export async function spotCheckTiles(): Promise<boolean> {
  await loadAreas();
  const ready = areas.filter((a) => a.done && a.done >= a.tiles * 0.95);
  if (!ready.length) return false;
  for (const a of ready) {
    const all = [...tilesIn(a.box, 16, 16)];
    const pick = [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]];
    let have = 0; // edge tiles can be open water with no imagery
    for (const [z, x, y] of pick) if ((await FS.getInfoAsync(tilePath(z, x, y))).exists) have++;
    if (have < 2) return false;
  }
  return true;
}
