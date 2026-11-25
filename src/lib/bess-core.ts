// Home battery (BESS) catalog logic: CEC Energy Storage System list -> brands / product families,
// chemistry from the listing text, wildcard model matching for label photos, and links to FULLCHARGE's
// verified shutdown cards. Pure — unit-tested in node; shared by tools/bess (PC) and the app.

export type CecRow = {
  manufacturer: string; model: string; description: string;
  kwh: number | null; kw: number | null; vac: number | null; ja12?: string; pcs?: string;
};
export type Chem = 'LFP' | 'NMC' | 'NCA' | 'LTO' | 'Na-ion' | 'Lead-acid' | 'Li-ion' | 'Unknown';
export type BessModel = { model: string; kwh: number | null; kw: number | null; vac: number | null; description: string };
export type BessFamily = {
  id: string; brand: string; manufacturer: string; family: string; chemistry: Chem;
  kwhMin: number | null; kwhMax: number | null; residential: boolean; models: BessModel[];
  curatedId?: string; // FULLCHARGE verified card (shutdown steps, contacts), if one exists
};
export type BessCatalog = { version: string; source: string; fetchedAt: string; count: number; families: BessFamily[] };

const BRAND_MAP: Record<string, string> = {
  'enphase energy': 'Enphase', 'solaredge technologies': 'SolarEdge', 'generac power systems': 'Generac',
  'lg energy solution': 'LG', 'lg chem': 'LG', 'franklinwh energy storage': 'FranklinWH', 'franklinwh': 'FranklinWH',
  'panasonic corporation of north america': 'Panasonic', 'sonnen': 'sonnen', 'tesla': 'Tesla',
  'fortress power': 'Fortress Power', 'eg4 electronics': 'EG4', 'sunpower': 'SunPower', 'electriq power': 'Electriq Power',
  'ford motor company': 'Ford', 'general motors': 'GM Energy', 'anker innovations': 'Anker SOLIX', 'ecoflow': 'EcoFlow',
};
const SUFFIX = /[,.]?\s+(inc|llc|l\.l\.c|ltd|limited|co|corp|corporation|company|gmbh|ag|s\.a|pty|plc|usa|us|america|north america|of america)\.?$/i;

/** "Enphase Energy, Inc." -> "Enphase"; "Tesla Inc." -> "Tesla". */
export function brandOf(manufacturer: string): string {
  let m = manufacturer.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i++) m = m.replace(SUFFIX, '').replace(/[,.]$/, '').trim();
  return BRAND_MAP[m.toLowerCase()] ?? m;
}

export function chemistryOf(text: string): Chem {
  const t = text.toLowerCase();
  if (/lithium[\s-]*(iron|ion)[\s-]*phosphate|lifepo4|\blfp\b/.test(t)) return 'LFP';
  if (/\bnmc\b|nickel[\s-]*manganese[\s-]*cobalt/.test(t)) return 'NMC';
  if (/\bnca\b|nickel[\s-]*cobalt[\s-]*alumin/.test(t)) return 'NCA';
  if (/titanate|\blto\b/.test(t)) return 'LTO';
  if (/sodium[\s-]*ion/.test(t)) return 'Na-ion';
  if (/lead[\s-]*acid|\bagm\b/.test(t)) return 'Lead-acid';
  if (/lithium/.test(t)) return 'Li-ion';
  return 'Unknown';
}

/** Product family: the name in parentheses ("(Powerwall 3)"), else the model number without wildcards / variants. */
export function familyOf(model: string, description: string): string {
  const paren = description.match(/\(([^)]{2,40})\)/);
  if (paren && !/^where\b/i.test(paren[1])) return paren[1].trim();
  return model.replace(/\{[^}]*\}/g, '').replace(/[-_ ](x{1,4}|y{1,2})(?=[-_ ]|$)/gi, '').replace(/[-_ ]+$/, '').trim() || model.trim();
}

const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9*]/g, '');
/** CEC model numbers use wildcards: XX = digits, Y = a letter, * = anything; {…} = a variant note. */
export function modelRegex(model: string): RegExp {
  const core = squash(model.replace(/\{[^}]*\}/g, ''));
  let re = '';
  for (let i = 0; i < core.length; i++) {
    const c = core[i];
    if (c === '*') re += '[A-Z0-9]*';
    else if ((c === 'X' || c === 'Y') && isWildRun(core, i)) re += '[A-Z0-9]';
    else re += c;
  }
  return new RegExp(re);
}
// Treat X / Y as wildcards only when they sit in a run of X/Y at the end of a segment (e.g. -XX-Y), not inside words like "FLEX".
function isWildRun(core: string, i: number): boolean {
  let a = i, b = i;
  while (a > 0 && /[XY]/.test(core[a - 1])) a--;
  while (b < core.length - 1 && /[XY]/.test(core[b + 1])) b++;
  const before = a > 0 ? core[a - 1] : '';
  return b - a + 1 <= 3 && (before === '' || /[0-9]/.test(before));
}
export const modelMatchesLabel = (model: string, labelText: string) => modelRegex(model).test(squash(labelText));

export const isResidential = (r: { kwh: number | null; vac: number | null }) =>
  r.kwh !== null && r.kwh <= 20.5 && (r.vac === null || r.vac <= 277);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** FULLCHARGE verified cards (ids in fullcharge-data.json "bess") and how to recognise their listings. */
const CURATED: { id: string; brand: string; test: RegExp }[] = [
  { id: 'powerwall-3', brand: 'Tesla', test: /powerwall\s*3|^1707000/i },
  { id: 'powerwall-2', brand: 'Tesla', test: /powerwall\s*(2|\+)|ac powerwall|^(1092170|2012170|3012170)/i },
  { id: 'enphase-5p', brand: 'Enphase', test: /iq\s*battery[-\s]*5p|IQBATTERY-5P/i },
  { id: 'franklinwh-apower-2', brand: 'FranklinWH', test: /apower\s*2|aPower2/i },
  { id: 'solaredge-home-battery', brand: 'SolarEdge', test: /home battery|BAT-10K/i },
  { id: 'lg-resu-prime', brand: 'LG', test: /resu\s*(10h|16h)?\s*prime|RESU1[06]H\s*PRIME/i },
  { id: 'generac-pwrcell', brand: 'Generac', test: /pwrcell/i },
  { id: 'panasonic-evervolt', brand: 'Panasonic', test: /evervolt/i },
];
export function curatedFor(brand: string, family: string, models: string[]): string | undefined {
  return CURATED.find((c) => c.brand === brand && [family, ...models].some((s) => c.test.test(s)))?.id;
}

/** Raw CEC rows -> product families (one card per brand + family). */
export function buildFamilies(rows: CecRow[]): BessFamily[] {
  const map = new Map<string, BessFamily>();
  for (const r of rows) {
    if (!r.manufacturer || !r.model) continue;
    const brand = brandOf(r.manufacturer);
    const family = familyOf(r.model, r.description);
    const id = slug(`${brand}-${family}`);
    const f = map.get(id) ?? { id, brand, manufacturer: r.manufacturer, family, chemistry: 'Unknown' as Chem, kwhMin: null, kwhMax: null, residential: false, models: [] };
    f.models.push({ model: r.model, kwh: r.kwh, kw: r.kw, vac: r.vac, description: r.description });
    const chem = chemistryOf(r.description);
    if (f.chemistry === 'Unknown' || (f.chemistry === 'Li-ion' && chem !== 'Unknown' && chem !== 'Li-ion')) f.chemistry = chem;
    if (r.kwh !== null) { f.kwhMin = Math.min(f.kwhMin ?? r.kwh, r.kwh); f.kwhMax = Math.max(f.kwhMax ?? r.kwh, r.kwh); }
    if (isResidential(r)) f.residential = true;
    map.set(id, f);
  }
  const out = [...map.values()];
  for (const f of out) f.curatedId = curatedFor(f.brand, f.family, f.models.map((m) => m.model));
  return out.sort((a, b) => a.brand.localeCompare(b.brand) || a.family.localeCompare(b.family));
}

/** What the camera / label read says about a unit. */
export type BessGuess = { brand?: string; product?: string; modelNumbers?: string[]; kwh?: number | null; confidence?: number; cues?: string[] };
export type BessMatch = { family: BessFamily; how: 'model-number' | 'product' | 'brand'; model?: string };

/** Best catalog matches for a guess: exact model number from the label first, then brand + product name, then brand. */
export function matchBess(g: BessGuess, families: BessFamily[]): BessMatch[] {
  const out: BessMatch[] = [];
  const seen = new Set<string>();
  const push = (m: BessMatch) => { if (!seen.has(m.family.id)) { seen.add(m.family.id); out.push(m); } };
  for (const label of g.modelNumbers ?? []) {
    if (squash(label).length < 4) continue;
    for (const f of families) { const m = f.models.find((x) => modelMatchesLabel(x.model, label)); if (m) push({ family: f, how: 'model-number', model: m.model }); }
  }
  const brand = g.brand ? brandOf(g.brand).toLowerCase() : '';
  const words = (g.product ?? '').toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 0);
  const ofBrand = families.filter((f) => brand && (f.brand.toLowerCase() === brand || f.brand.toLowerCase().startsWith(brand) || brand.startsWith(f.brand.toLowerCase())));
  if (words.length) {
    const hay = (f: BessFamily) => `${f.family} ${f.models.map((m) => `${m.model} ${m.description}`).join(' ')}`.toLowerCase();
    ofBrand.filter((f) => words.every((w) => hay(f).includes(w))).forEach((f) => push({ family: f, how: 'product' }));
  }
  ofBrand.filter((f) => f.residential).forEach((f) => push({ family: f, how: 'brand' }));
  return out.slice(0, 8);
}
