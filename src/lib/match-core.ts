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
  contacts?: Contact[];   // manufacturer phone lines read from this guide and approved on the PC (tools/nhtsa contacts)
  battery?: Battery;      // HV battery chemistry as printed on this sheet, approved on the PC (tools/nhtsa battery:scan)
  body?: Body;            // car / suv / truck / van / heavy (same pass)
  fromErg?: { key: string; pages: number[] }; // cut sheet taken from these pages of a full guide (tools/nhtsa erg:cutsheets)
  sections?: Partial<Record<SectionKey, GuideSection>>; // ISO 17840-3 sections of this full guide (tools/nhtsa sections:scan)
};

/** ISO 17840-3 emergency response guide sections, as FULLCHARGE uses them (tabs in on-scene order + the ID check).
 *  disable = Immobilisation + Disable direct hazards · cut = Access to occupants · battery = Stored energy ·
 *  fire = In case of fire · water = In case of submersion · tow = Towing / transport / storage · identify = Identification. */
export type SectionKey = 'disable' | 'cut' | 'fire' | 'water' | 'battery' | 'tow' | 'identify';
export const SECTION_ISO: Record<SectionKey, string> = {
  disable: 'Immobilisation / disable direct hazards', cut: 'Access to occupants', fire: 'In case of fire',
  water: 'In case of submersion', battery: 'Stored energy', tow: 'Towing / transport / storage', identify: 'Identification',
};
/** Key page(s) of one section, as images (offline, in the rescue-sheet pack). pages = page numbers in the guide. */
export type GuideSection = { pages: number[]; images: Record<'200' | '300', { bytes: number; pages: PageImage[] }> };
/** Every section image file a guide carries. */
export const sectionFiles = (g: Pick<Guide, 'sections'>, set: '200' | '300'): PageImage[] =>
  Object.values(g.sections ?? {}).flatMap((s) => s?.images[set].pages ?? []);

export type Body = 'car' | 'suv' | 'truck' | 'van' | 'heavy';
export const BODIES: { key: Body; label: string }[] = [
  { key: 'car', label: 'Cars' }, { key: 'suv', label: 'SUVs' }, { key: 'truck', label: 'Trucks' }, { key: 'van', label: 'Vans' }, { key: 'heavy', label: 'Heavy' },
];
/** Traction battery as the manufacturer printed it. chem decides the ERG guide (NiMH = 171). */
export type Battery = { chem: 'lithium-ion' | 'nimh' | 'sodium-ion' | 'lithium-metal'; text?: string; cell?: string; voltage?: string };
export const CHEM_LABEL: Record<Battery['chem'], string> = { 'lithium-ion': 'Lithium-ion', nimh: 'NiMH (nickel-metal hydride)', 'sodium-ion': 'Sodium-ion', 'lithium-metal': 'Lithium-metal' };

/** A phone line printed in the manufacturer's own guide. Only ever shown after a person approved it. */
export type Contact = { name: string; phone: string; note?: string; page?: number };

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

/** NHTSA lists some makes by division: "Cars EQE350 Sedan", "Vans EQS450…", "Cars XC40…". The division isn't the model. */
export const cleanModel = (m: string) => (m ?? '').replace(/^(cars|vans|trucks|truck|car|van)\s+/i, '');

/** Guess model matches catalog model. Guess may be MORE specific ("Model Y Long Range" -> "Model Y").
 *  A LESS specific guess ("F-150") only matches a longer EV name ("F-150 Lightning") if the guess isn't ICE. */
export function modelMatches(guessModel: string, catModel: string, powertrain?: string): boolean {
  const g = norm(cleanModel(guessModel)), c = norm(cleanModel(catModel));
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

export type MatchResult = { vehicleId?: string; guides: Guide[]; yearsLoose?: boolean };

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
  const modelHits = guides.filter((x) => normMake(x.make) === mk && modelMatches(g.model, x.model, g.powertrain));
  // Powertrain from a photo can be wrong (PHEV vs BEV look alike): if it rules out every sheet for this model,
  // keep the model's sheets rather than showing nothing — the ERG note on the page still flags hybrids / hydrogen.
  const ptHits = modelHits.filter((x) => ptCompatible(g.powertrain, x.powertrain));
  const sameModel = ptHits.length ? ptHits : modelHits;
  // NHTSA often lists a sheet only under its newest model year (EQE "2026") though it covers earlier cars of the same
  // generation. No sheet for the exact years → show the closest years, and say so (yearsLoose) — never nothing.
  let gs = sameModel.filter((x) => yearsOverlap(g.yearFrom, g.yearTo, x.yearFrom, x.yearTo));
  const yearsLoose = !gs.length && sameModel.length > 0;
  if (yearsLoose) {
    const y = g.yearFrom ?? g.yearTo ?? 0;
    const dist = (x: Guide) => Math.min(Math.abs((x.yearFrom ?? y) - y), Math.abs((x.yearTo ?? x.yearFrom ?? y) - y));
    gs = [...sameModel].sort((a, b) => dist(a) - dist(b));
  }
  gs = gs.sort((a, b) => (b.yearTo ?? 9999) - (a.yearTo ?? 9999) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0) || (a.docType === 'rescue_sheet' ? -1 : 1));
  return { vehicleId: seedHit?.id ?? gs.find((x) => x.vehicleId)?.vehicleId, guides: gs, yearsLoose };
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
  `${x.make} ${cleanModel(x.model)} ${x.years}${x.powertrain ? ' · ' + x.powertrain : ''} · ${x.docType === 'rescue_sheet' ? 'Rescue sheet' : 'ERG'}`;

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

// ---------- Forgiving search (gloves, panic, typos) ----------
/** Nicknames people actually say → the make as listed. Keys are normalized. */
const MAKE_NICKS: Record<string, string> = {
  chevy: 'chevrolet', chev: 'chevrolet', vw: 'volkswagen', vdub: 'volkswagen', merc: 'mercedesbenz', mercedes: 'mercedesbenz',
  benz: 'mercedesbenz', mb: 'mercedesbenz', amg: 'mercedesbenz', maybach: 'mercedesbenz', caddy: 'cadillac', caddie: 'cadillac',
  rangerover: 'landrover', rr: 'landrover', beemer: 'bmw', bimmer: 'bmw', beamer: 'bmw', lambo: 'lamborghini', alfa: 'alfaromeo',
  ih: 'international', navistar: 'international', freightliner: 'freightliner', gm: 'gmc', hummer: 'gmc', jag: 'jaguar',
};

/** Edit distance (small strings only). */
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
/** Typos allowed for a typed fragment of this length: none under 4 letters, 1 up to 6, 2 from 7. */
const slack = (n: number) => (n < 4 ? 0 : n < 7 ? 1 : 2);
/** Does a typed fragment start this word, allowing a typo or two ("hyundia" → hyundai, "mercedez" → mercedes)? */
export function fuzzyPrefix(typed: string, word: string): boolean {
  const t = norm(typed), w = norm(word);
  if (!t || !w) return false;
  if (w.startsWith(t)) return true;
  const k = slack(t.length);
  if (!k) return false;
  // compare against the word's prefixes around the typed length (letters can be missed or doubled)
  for (let n = Math.max(1, t.length - k); n <= Math.min(w.length, t.length + k); n++) if (lev(t, w.slice(0, n)) <= k) return true;
  return false;
}

/** Brands that fit what's typed so far, best first. One letter is enough to start narrowing. */
export function matchMakes(q: string, makes: string[]): string[] {
  const t = norm(q);
  if (!t) return makes;
  const nick = Object.entries(MAKE_NICKS).filter(([k]) => k.startsWith(t) || (t.length >= 4 && lev(t, k) <= 1)).map(([, v]) => v);
  const score = (m: string) => {
    const nm = norm(m), nk = normMake(m);
    if (nm === t || nk === t) return 0;
    if (nm.startsWith(t)) return 1;
    if (m.toLowerCase().split(/[\s-]+/).some((w) => norm(w).startsWith(t))) return 2;
    if (nick.includes(nk) || nick.includes(nm)) return 3;
    if (fuzzyPrefix(t, nm)) return 4;
    return 99;
  };
  return makes.map((m) => [m, score(m)] as const).filter(([, s]) => s < 99).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([m]) => m);
}
/** The one make the query names outright ("chevy", "tesla"), if any. */
export function namedMake(q: string, makes: string[]): string | undefined {
  const t = norm(q);
  if (!t) return undefined;
  const target = MAKE_NICKS[t] ?? t;
  return makes.find((m) => norm(m) === target || normMake(m) === target);
}

/** Forgiving text match: every typed word must fit (substring, spaces/dashes ignored, nickname, or small typo). */
export function looseMatch(q: string, hay: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = hay.toLowerCase();
  const hn = norm(hay);
  if (norm(q).length >= 3 && hn.includes(norm(q))) return true; // "mach e" → "Mustang Mach-E", "f150" → "F-150"
  const hw = h.split(/[\s/·,()-]+/).filter(Boolean);
  return words.every((w) => {
    const nw = norm(w);
    if (!nw) return true;
    const nick = MAKE_NICKS[nw];
    if (nick && hn.includes(nick)) return true;
    if (hn.includes(nw)) return true;
    return hw.some((x) => fuzzyPrefix(nw, x));
  });
}

/** Forgiving version of searchGuides. */
export function smartSearchGuides(q: string, guides: Guide[], make?: string, limit = 200): Guide[] {
  return guides
    .filter((x) => (!make || x.make === make) && looseMatch(q, `${x.make} ${x.model} ${x.years} ${x.powertrain}`))
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0))
    .slice(0, limit);
}
