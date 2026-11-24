// Bundles: many small cut-sheet files packed into ~48 MB blobs, so iOS's background downloader
// (built for a few big files, not thousands of small ones) can fetch a whole pack with the app closed.
// Pure logic shared by the publish script (PC) and the app. No React Native imports — unit-tested in node.

export type BundleEntry = { file: string; offset: number; length: number };
export type Bundle = { file: string; bytes: number; sha256: string; entries: BundleEntry[] };

export const BUNDLE_TARGET = 36_000_000;
/** Supabase caps each upload at 50 MB on this project, so no bundle may pass this. */
export const BUNDLE_MAX = 44_000_000;

/** Stable 32-bit FNV-1a hash — the same file always lands in the same bundle, so an update
 *  only changes the bundles whose contents changed (unchanged bundles keep their name and aren't refetched). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const bundleCount = (totalBytes: number) => Math.max(1, Math.ceil(totalBytes / BUNDLE_TARGET));
export const bucketOf = (file: string, n: number) => fnv1a(file) % n;

/** Group files into n buckets; inside a bucket, files are in path order (deterministic). */
export function groupForBundles<T extends { file: string; bytes: number }>(files: T[]): T[][] {
  const n = bundleCount(files.reduce((a, f) => a + f.bytes, 0));
  const buckets: T[][] = Array.from({ length: n }, () => []);
  for (const f of files) buckets[bucketOf(f.file, n)].push(f);
  // Any bucket that came out too big is split in path order, so no bundle exceeds BUNDLE_MAX.
  const out: T[][] = [];
  for (const b of buckets.filter((x) => x.length).map((x) => x.sort((p, q) => (p.file < q.file ? -1 : 1)))) {
    let cur: T[] = [], size = 0;
    for (const f of b) {
      if (cur.length && size + f.bytes > BUNDLE_MAX) { out.push(cur); cur = []; size = 0; }
      cur.push(f); size += f.bytes;
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

/** Byte layout of one bundle (files back to back). */
export function layout(files: { file: string; bytes: number }[]): BundleEntry[] {
  let offset = 0;
  return files.map((f) => { const e = { file: f.file, offset, length: f.bytes }; offset += f.bytes; return e; });
}

/** Decide how to fetch what's missing: a whole bundle when at least `share` of its bytes are missing
 *  (first install), single files otherwise (small updates). */
export function planDownload(
  needed: { file: string; bytes: number }[],
  have: (file: string) => boolean,
  bundles: Bundle[] | undefined,
  share = 0.5,
): { bundles: Bundle[]; files: { file: string; bytes: number }[] } {
  const missing = needed.filter((f) => !have(f.file));
  if (!bundles?.length) return { bundles: [], files: missing };
  const missingSet = new Set(missing.map((f) => f.file));
  const take: Bundle[] = [];
  const covered = new Set<string>();
  for (const b of bundles) {
    const miss = b.entries.filter((e) => missingSet.has(e.file));
    const missBytes = miss.reduce((a, e) => a + e.length, 0);
    if (miss.length && missBytes >= share * b.bytes) { take.push(b); miss.forEach((e) => covered.add(e.file)); }
  }
  return { bundles: take, files: missing.filter((f) => !covered.has(f.file)) };
}

/** Manifest key for a pack's bundle list on this device. */
export const bundleKey = (docType: string, set: '200' | '300') => (docType === 'rescue_sheet' ? `rescue_sheet:${set}` : 'erg');
