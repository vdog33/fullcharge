// Pure matching: a make/model/year (from Gemini or a VIN decode) -> FULLCHARGE pages + NHTSA cut sheets.
// No React Native imports — unit-tested in node. Runs on the phone, so it works offline.

export type PageImage = { file: string; w: number; h: number; bytes: number };

export type Guide = {
  key: string;
  make: string;
  model: string;
  years: string;          // as listed by NHTSA, e.g. "2021-2024"
  yearFrom: number | null;
  yearTo: number | null;  // null = open / unknown
  powertrain: string;     // BEV | HEV | PHEV | FCEV | ''
  docType: 'erg' | 'rescue_sheet' | string;
  version?: string;
  date?: string;
  sourceUrl: string;
  file: string;           // PDF path in storage (pdfs/<sha>.pdf); '' when the sheet ships as images
  bytes: number;
  sha256?: string;
  vehicleId?: string;     // FULLCHARGE seed page, if one exists
  pages?: number;
  images?: Record<'200' | '300', { bytes: number; pages: PageImage[] }>; // rescue sheets ship as page images
  photo?: VehiclePhoto;   // approved real photo of this model (tools/nhtsa photos:*) — ships with the rescue-sheet pack
};

/** A real photo of the vehicle, picked and approved by a person on the PC. Never a live web lookup. */
export type VehiclePhoto = { file: string; w: number; h: number; bytes: number; credit: string; license?: string };

/** One photo per make + model + year range ("generation"). Shared by the PC tools and the publish step. */
export const photoKey = (g: { make: string; model: string; years?: string }) => `${normMake(g.make)}|${norm(g.model)}|${g.years ?? ''}`;

/** Guides that go in the "All rescue sheets" pack: every rescue sheet, PLUS the full ERG of any vehicle that has
 *  no rescue sheet (trucks, buses — e.g. Autocar), so every NHTSA vehicle has its cut info on the phone. */
export function rescuePackGuides<T extends Pick<Guide, 'make' | 'model' | 'docType' | 'yearFrom' | 'yearTo'>>(guides: T[]): T[] {
  const sheets = guides.filter((g) => g.docType === 'rescue_sheet');
  const byMake = new Map<string, T[]>();
  for (const s of sheets) { const k = normMake(s.make); byMake.set(k, [...(byMake.get(k) ?? []), s]); }
  const covered = (g: T) => (byMake.get(normMake(g.make)) ?? [])
    .some((s) => norm(s.model) === norm(g.model) && yearsOverlap(g.yearFrom, g.yearTo, s.yearFrom, s.yearTo));
  return guides.filter((g) => g.docType === 'rescue_sheet' || !covered(g));
}

export type Guess = {
  make: string;
  model: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  powertrain?: string;    // BEV | PHEV | HEV | FCEV | ICE | unknown
  trim?: string;
};

const MAKE_ALIASES: Record<string, string> = {
  mercedes: 'mercedesbenz', benz: 'mercedesbenz', mb: 'mercedesbenz',
  vw: 'volkswagen', chevy: 'chevrolet', landrover: 'landrover', rangerover: 'landrover',
  mini: 'mini', ram: 'ram', polestar: 'polestar',
};

export const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const normMake = (s?: string | null) => { const n = norm(s); return MAKE_ALIASES[n] ?? n; };

/** Guess model matches catalog model. Guess may be MORE specific ("Model Y Long Range" -> "Model Y").
 *  A LESS specific guess ("F-150") only matches a longer EV name ("F-150 Lightning") if the guess isn't ICE. */
export function modelMatches(guessModel: string, catModel: string, powertrain?: string): boolean {
  const g = norm(guessModel), c = norm(catModel);
  if (!g || !c) return false;
  if (g === c) return true;
  if (g.startsWith(c) && c.length >= 2) return true;
  if (c.startsWith(g) && g.length >= 3) return powertrain?.toUpperCase() !== 'ICE';
  // "Mach-E" vs "Mustang Mach-E", "Hummer EV Pickup" vs "Hummer EV"
  if (g.length >= 4 && c.includes(g)) return powertrain?.toUpperCase() !== 'ICE';
  return false;
}

export function yearsOverlap(aFrom?: number | null, aTo?: number | null, bFrom?: number | null, bTo?: number | null): boolean {
  if (!aFrom && !aTo) return true;
  if (!bFrom && !bTo) return true;
  const a0 = aFrom ?? 1990, a1 = aTo ?? aFrom ?? 2100;
  const b0 = bFrom ?? 1990, b1 = bTo ?? 2100;
  return a0 <= b1 + 1 && b0 <= a1 + 1; // ±1 yr slack: model years straddle calendar years
}

export function parseYears(s: string): { yearFrom: number | null; yearTo: number | null } {
  const ys = (s.match(/(19|20)\d{2}/g) ?? []).map(Number);
  if (!ys.length) return { yearFrom: null, yearTo: null };
  const open = /present|current|\+|–\s*$|-\s*$/i.test(s);
  return { yearFrom: Math.min(...ys), yearTo: open ? null : Math.max(...ys) };
}

/** "BEV (Battery Electric Vehicle)" -> BEV. Unknown -> ''. */
export function ptCode(s?: string | null): string {
  const m = (s ?? '').toUpperCase().match(/\b(PHEV|MHEV|FCEV|HEV|BEV|ICE)\b/);
  if (m) return m[1];
  if (/PLUG-?IN/i.test(s ?? '')) return 'PHEV';
  if (/FUEL\s*CELL/i.test(s ?? '')) return 'FCEV';
  if (/HYBRID/i.test(s ?? '')) return 'HEV';
  return '';
}
/** Two known, different powertrains never match (Prius HEV sheet ≠ Prius Prime PHEV). Unknown on either side = OK. */
export function ptCompatible(guess?: string | null, doc?: string | null): boolean {
  const a = ptCode(guess), b = ptCode(doc);
  if (!a || !b || a === 'ICE') return true;
  if (a === 'MHEV' || b === 'MHEV') return a === b || a === 'HEV' || b === 'HEV';
  return a === b;
}

export type SeedLite = { id: string; make: string; model: string; years: string; type?: string };

export type MatchResult = { vehicleId?: string; guides: Guide[] };

/** Best FULLCHARGE page + every NHTSA cut sheet that fits the guess, newest first. */
export function matchGuess(g: Guess, seed: SeedLite[], guides: Guide[]): MatchResult {
  const mk = normMake(g.make);
  if (!mk) return { guides: [] };
  const seedHit = seed
    .filter((v) => normMake(v.make) === mk)
    // split "bZ4X / Prius Prime" style names
    .find((v) => v.model.split('/').some((m) => modelMatches(g.model, m.trim(), g.powertrain)) &&
      (!v.type || v.type.includes('/') || ptCompatible(g.powertrain, v.type)) &&
      (() => { const y = parseYears(v.years); return yearsOverlap(g.yearFrom, g.yearTo, y.yearFrom, y.yearTo); })());
  const gs = guides
    .filter((x) => normMake(x.make) === mk && modelMatches(g.model, x.model, g.powertrain) && ptCompatible(g.powertrain, x.powertrain) && yearsOverlap(g.yearFrom, g.yearTo, x.yearFrom, x.yearTo))
    .sort((a, b) => (b.yearTo ?? 9999) - (a.yearTo ?? 9999) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0) || (a.docType === 'rescue_sheet' ? -1 : 1));
  return { vehicleId: seedHit?.id ?? gs.find((x) => x.vehicleId)?.vehicleId, guides: gs };
}

/** Free-text search over the offline cut-sheet index. */
export function searchGuides(q: string, guides: Guide[], make?: string, limit = 60): Guide[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return guides
    .filter((x) => (!make || x.make === make) && terms.every((t) => `${x.make} ${x.model} ${x.years} ${x.powertrain}`.toLowerCase().includes(t)))
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0))
    .slice(0, limit);
}

export const guideLabel = (x: Guide) =>
  `${x.make} ${x.model} ${x.years}${x.powertrain ? ' · ' + x.powertrain : ''} · ${x.docType === 'rescue_sheet' ? 'Rescue sheet' : 'ERG'}`;

/** Files a guide needs for an image set ('200' iPhone / '300' iPad). */
export const filesFor = (g: Guide, set: '200' | '300'): string[] =>
  g.images ? g.images[set].pages.map((p) => p.file) : g.file ? [g.file] : [];

/** Which version of a guide is usable offline: the current one if all its files are on the device,
 *  else the previous version (mid-update), else none. Never leaves a gap while an update downloads. */
export function resolveLocal(g: Guide, prevGuides: Guide[] | undefined, has: (file: string) => boolean, set: '200' | '300'): Guide | null {
  const fs = filesFor(g, set);
  if (fs.length && fs.every(has)) return g;
  const old = prevGuides?.find((x) => x.key === g.key);
  if (old) { const ofs = filesFor(old, set); if (ofs.length && ofs.every(has)) return old; }
  return null;
}
