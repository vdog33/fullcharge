// Offline VIN decode from NHTSA's own vPIC data, trimmed on the PC (tools/nhtsa/vin-build.mjs) to the makes that
// have cut sheets. Same idea as NHTSA's decoder: WMI (chars 1–3) + model year → VIN schemas → patterns over
// chars 4–8 and 10–17. Where patterns disagree we return every model they name — the crew picks and confirms.
// Pure — no React Native imports, unit-tested in node.

export type VinDb = {
  version: string;
  models: string[];                       // "Make|Model"
  elec: string[];                         // electrification labels ("BEV (Battery Electric Vehicle)")
  wmi: Record<string, [schema: number, from: number, to: number | null][]>;
  // schema id → [keys, modelIdx | -1, elecIdx | -1]
  schemas: Record<string, [string, number, number][]>;
};

export type OfflineDecode = { make: string; models: string[]; electrification?: string; year: number | null };

/** NHTSA pattern keys → regex over the VIN descriptor "chars 4–8|chars 10–17". "*" = any one character. */
const cache = new Map<string, RegExp>();
export function keyRegex(keys: string): RegExp {
  let r = cache.get(keys);
  if (!r) {
    let src = '';
    for (let i = 0; i < keys.length; i++) {
      const c = keys[i];
      if (c === '*') src += '.';
      else if (c === '[') { const j = keys.indexOf(']', i); src += keys.slice(i, j + 1); i = j; }
      else src += c.replace(/[.+?^${}()|\\]/g, '\\$&');
    }
    r = new RegExp('^' + src);
    cache.set(keys, r);
  }
  return r;
}

export const descriptor = (vin: string) => `${vin.slice(3, 8)}|${vin.slice(9, 17)}`;
/** Small makers (<1,000 a year) use "xx9" and put the rest of their ID in chars 12–14. */
export const wmiOf = (vin: string) => (vin[2] === '9' ? vin.slice(0, 3) + vin.slice(11, 14) : vin.slice(0, 3));
const specificity = (k: string) => k.replace(/\*|\|/g, '').length;

export function decodeOffline(db: VinDb, vin: string, year: number | null): OfflineDecode | null {
  const v = vin.toUpperCase();
  const rows = db.wmi[wmiOf(v)] ?? db.wmi[v.slice(0, 3)];
  if (!rows) return null;
  const d = descriptor(v);
  const live = rows.filter(([, f, t]) => year == null || (year >= f && (t == null || year <= t)));
  const hits: { m: number; e: number; s: number }[] = [];
  for (const [id] of live) for (const [k, m, e] of db.schemas[id] ?? []) if (keyRegex(k).test(d)) hits.push({ m, e, s: specificity(k) });
  const ms = hits.filter((h) => h.m >= 0);
  if (!ms.length) {
    const any = live.length ? live : rows;
    const make = any.map(([id]) => db.schemas[id]?.find((p) => p[1] >= 0)).find(Boolean);
    return make ? { make: db.models[make[1]].split('|')[0], models: [], year } : null;
  }
  // Most specific pattern first, one entry per model.
  ms.sort((a, b) => b.s - a.s);
  const order = [...new Set(ms.map((h) => h.m))];
  const top = ms[0].s;
  const best = order.filter((m) => ms.some((h) => h.m === m && h.s === top));
  const e = hits.filter((h) => h.e >= 0).sort((a, b) => b.s - a.s)[0];
  return {
    make: db.models[best[0]].split('|')[0],
    models: best.map((m) => db.models[m].split('|')[1]),
    electrification: e ? db.elec[e.e] : undefined,
    year,
  };
}
