// NHTSA portal format: "<MANUFACTURER> <PT> <MAKE> <MODEL> Guide|Rescue Sheet <id>", years in the file name.
const PT_RE = /\s(BEV|PHEV|HEV|MHEV|FCEV|FCHEV|EREV)\s/;
const MULTI = ['NEW FLYER', 'SEA ELECTRIC', 'LAND ROVER', 'RANGE ROVER', 'ALFA ROMEO', 'ROLLS ROYCE', 'ROLLS-ROYCE', 'MERCEDES BENZ', 'MERCEDES-BENZ',
  'MERCEDES-AMG', 'MERCEDES AMG', 'ASTON MARTIN', 'BLUE BIRD', 'THOMAS BUILT', 'LION ELECTRIC', 'GREEN POWER', 'GREENPOWER MOTOR', 'FARADAY FUTURE',
  'HARLEY-DAVIDSON', 'MOTOR COACH', 'LYNK & CO', 'WESTERN STAR', 'BRIGHT DROP', 'VAN HOOL', 'NEW HOLLAND', 'ORANGE EV', 'BATTLE MOTORS',
  'MICRO BIRD', 'MCNEILUS TRUCK & MANUFACTURING', 'PIERCE MANUFACTURING', 'NOVA BUS'];
const CANON = { 'MERCEDES BENZ': 'Mercedes-Benz', 'MERCEDES-BENZ': 'Mercedes-Benz', 'MERCEDES-AMG': 'Mercedes-Benz', 'MERCEDES AMG': 'Mercedes-Benz',
  BMW: 'BMW', GMC: 'GMC', MINI: 'MINI', KIA: 'Kia', 'ROLLS ROYCE': 'Rolls-Royce', 'RANGE ROVER': 'Land Rover', CHEVY: 'Chevrolet', VW: 'Volkswagen',
  'BRIGHT DROP': 'BrightDrop', BRIGHTDROP: 'BrightDrop', MCLAREN: 'McLaren', BYD: 'BYD', IC: 'IC Bus', SRT: 'SRT', RAM: 'Ram',
  VINFAST: 'VinFast', GREENPOWER: 'GreenPower', 'GREEN POWER': 'GreenPower', 'GREENPOWER MOTOR': 'GreenPower', MCNEILUS: 'McNeilus',
  'MCNEILUS TRUCK & MANUFACTURING': 'McNeilus', 'PIERCE MANUFACTURING': 'Pierce', 'NEW FLYER': 'New Flyer', 'VAN HOOL': 'Van Hool',
  'NEW HOLLAND': 'New Holland', 'ORANGE EV': 'Orange EV', 'BATTLE MOTORS': 'Battle Motors', 'MICRO BIRD': 'Micro Bird',
  LIGHTNING: 'Lightning eMotors', NOVA: 'Nova Bus', 'NOVA BUS': 'Nova Bus', 'SEA ELECTRIC': 'SEA Electric', 'E-ONE': 'E-ONE' };
const WORDS = new Set(['VAN', 'BUS', 'ONE', 'VUE', 'NEW', 'MAX', 'AIR', 'PRO', 'CAB', 'BOX', 'FOR', 'AND', 'THE', 'TOP', 'BAY', 'SKY', 'FIT', 'GEN', 'DUO', 'KEY', 'TWO', 'SUN', 'ZOE', 'SUB', 'LOW', 'BED']);

export function smartCase(s) {
  return s.split(' ').map((w) => {
    if (!w) return w;
    if (/\d/.test(w) || (/^[A-Z&.]{1,3}[+]?$/.test(w) && !WORDS.has(w.replace('+', ''))) || (/^[(\[]/.test(w) && w.length <= 6)) return w;
    return w.split('-').map((p) => (p.length <= 2 && /^[A-Z]+$/.test(p) ? p : p[0] + p.slice(1).toLowerCase())).join('-');
  }).join(' ');
}

export function yearsFromFile(name) {
  const n = name.replace(/\.pdf$/i, '');
  let m;
  if ((m = n.match(/(?<!\d)((?:19|20)\d{2})\s*[-_]\s*((?:19|20)\d{2})(?!\d)/))) return [+m[1], +m[2]];
  if ((m = n.match(/(?<!\d)((?:19|20)\d{2})\s*(?:-\s*(?:present|current|newer)|plus|\+|-(?=[_.]|$)|-\s*$)/i))) return [+m[1], null];
  if ((m = n.match(/MY\s*((?:19|20)\d{2})(?!\d)/i))) return [+m[1], +m[1]];
  if ((m = n.match(/(?<![\dA-Z])((?:19|20)\d{2})(?!\d)/i))) return [+m[1], +m[1]];
  return [null, null];
}

export function parseNhtsa(context, url) {
  const ctx = String(context ?? '').replace(/\s+/g, ' ').trim();
  const file = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  const docType = /Rescue\s*Sheet\s*\d*$/i.test(ctx) || /^RescueSheet/i.test(file) ? 'rescue_sheet' : 'erg';
  const pm = (' ' + ctx + ' ').match(PT_RE);
  if (!pm) return null;
  const manufacturer = ctx.slice(0, pm.index).trim();
  let rest = ctx.slice(pm.index + pm[0].length - 1).replace(/\s*(Guide|Rescue Sheet)\s*\d*\s*$/i, '').trim();
  const up = rest.toUpperCase();
  let makeRaw = MULTI.find((m) => up.startsWith(m + ' ')) ?? up.split(' ')[0];
  let model = rest.slice(makeRaw.length).trim();
  // "ZOOX ZOOX SEDAN", "ZEEKR ZEEKR RT": drop a repeated make
  if (model.toUpperCase().startsWith(makeRaw + ' ')) model = model.slice(makeRaw.length).trim();
  // "MERCEDES-BENZ CARS EQE350", "VOLVO CARS XC40": the division word isn't part of the model.
  model = model.replace(/^(CARS|VANS|TRUCKS?)\s+/i, '');
  const make = CANON[makeRaw] ?? smartCase(makeRaw);
  if (make === 'Nova Bus') model = model.replace(/^BUS\s+/i, '');
  const [yearFrom, yearTo] = yearsFromFile(file);
  const years = yearFrom ? (yearTo === yearFrom ? `${yearFrom}` : `${yearFrom}–${yearTo ?? 'present'}`) : '';
  return {
    manufacturer: smartCase(manufacturer), make, model: smartCase(model), years, yearFrom, yearTo,
    powertrain: pm[1] === 'FCHEV' ? 'FCEV' : pm[1] === 'EREV' ? 'PHEV' : pm[1], docType,
    needs_review: !make || !model, review_flags: [...(!make ? ['make'] : []), ...(!model ? ['model'] : [])],
  };
}

export const fileKey = (u) => decodeURIComponent(new URL(u).pathname.split('/').pop() ?? '').toLowerCase();

// ---- fallback for anything not in the portal's usual format ----
// Turn the text around an NHTSA PDF link (and its file name) into make / model / years / powertrain / doc type.
// Heuristic: everything it is unsure about is flagged for review (needs_review=true) — never silently guessed.

const MAKES = [
  'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Range Rover', 'Rolls-Royce', 'Mercedes-Benz', 'Mercedes-AMG', 'Mercedes-Maybach',
  'Faraday Future', 'Blue Bird', 'Thomas Built', 'Lion Electric', 'New Flyer', 'Harley-Davidson',
  'Acura', 'Audi', 'Bentley', 'BMW', 'BrightDrop', 'Buick', 'BYD', 'Cadillac', 'Canoo', 'Chevrolet', 'Chrysler', 'Dodge',
  'Ferrari', 'Fiat', 'Fisker', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Ineos', 'Infiniti', 'Jaguar', 'Jeep', 'Karma',
  'Kia', 'Lamborghini', 'Lexus', 'Lincoln', 'Lotus', 'Lucid', 'Maserati', 'Mazda', 'McLaren', 'MINI', 'Mitsubishi', 'Nissan',
  'Polestar', 'Porsche', 'Ram', 'Rivian', 'Scout', 'Smart', 'Subaru', 'Tesla', 'Toyota', 'VinFast', 'Volkswagen', 'Volvo',
  'Freightliner', 'International', 'Navistar', 'Peterbilt', 'Kenworth', 'Mack', 'Proterra', 'Gillig', 'Workhorse', 'Xos',
  'Nikola', 'Hyzon', 'Zeekr', 'Lynk & Co', 'Maybach', 'Chevy', 'VW', 'Mercedes',
];
const LOOSE_CANON = { Chevy: 'Chevrolet', VW: 'Volkswagen', Mercedes: 'Mercedes-Benz', 'Range Rover': 'Land Rover', Maybach: 'Mercedes-Benz', 'Mercedes-Maybach': 'Mercedes-Benz', 'Mercedes-AMG': 'Mercedes-Benz' };

const lesc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOOSE_MAKE_RE = new RegExp(`\\b(${[...MAKES].sort((a, b) => b.length - a.length).map((m) => lesc(m).replace(/[-\s]/g, '[-\\s_]?')).join('|')})\\b`, 'i');

const LOOSE_YEARS_RE = /\b((?:19|20)\d{2})(?:\s*(?:-|–|—|to|thru|through)\s*((?:19|20)\d{2}|present|current|newer))?\b(\+)?/i;
const LOOSE_STOP_RE = /\b(?:(?:19|20)\d{2}|BEV|PHEV|HEV|MHEV|FCEV|EV|plug-?in|hybrid|electric|fuel\s*cell|emergency|response|guide|rescue|sheet|ERG|ISO|17840|pdf|rev(?:ision)?|version|v\d|en|us|usa|english)\b/i;

function fileText(url) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return name.replace(/\.pdf$/i, '').replace(/[_+]+/g, ' ').replace(/(?<=[a-z])-(?=[A-Z0-9])/g, ' ').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

function parseLoose(context, url) {
  const ctx = String(context ?? '').replace(/\s+/g, ' ').trim();
  const file = fileText(url);
  const text = `${ctx} | ${file}`;
  const flags = [];

  const docType = /rescue\s*sheet|rescuesheet|rescue[-_\s]?card/i.test(text) ? 'rescue_sheet'
    : /emergency\s*response|\bERG\b|responder/i.test(text) ? 'erg' : 'erg';
  if (!/rescue|emergency|\bERG\b|responder/i.test(text)) flags.push('doc_type');

  const powertrain =
    /\bFCEV\b|fuel[\s-]*cell/i.test(text) ? 'FCEV'
    : /\bPHEV\b|plug[\s-]*in/i.test(text) ? 'PHEV'
    : /\bMHEV\b|mild[\s-]*hybrid/i.test(text) ? 'MHEV'
    : /\bHEV\b|hybrid/i.test(text) ? 'HEV'
    : /\bBEV\b|\bEV\b|electric/i.test(text) ? 'BEV' : '';
  if (!powertrain) flags.push('powertrain');

  // Make: prefer the visible text, fall back to the file name.
  const mm = ctx.match(LOOSE_MAKE_RE) ?? file.match(LOOSE_MAKE_RE);
  let make = mm ? MAKES.find((m) => m.toLowerCase().replace(/[-\s]/g, '') === mm[1].toLowerCase().replace(/[-\s_]/g, '')) ?? mm[1] : '';
  make = LOOSE_CANON[make] ?? make;
  if (!make) flags.push('make');

  // Model: words after the make, up to the first year / powertrain / doc word.
  let model = '';
  for (const src of [ctx, file]) {
    const m = src.match(LOOSE_MAKE_RE);
    if (!m) continue;
    let rest = src.slice((m.index ?? 0) + m[0].length).replace(/^[\s:–—|-]+/, '');
    const stop = rest.search(LOOSE_STOP_RE);
    if (stop >= 0) rest = rest.slice(0, stop);
    rest = rest.replace(/[|,;()]+.*$/, '').replace(/[\s–—-]+$/, '').trim();
    if (rest && rest.length <= 40) { model = rest; break; }
  }
  if (!model) flags.push('model');

  const ym = ctx.match(LOOSE_YEARS_RE) ?? file.match(LOOSE_YEARS_RE);
  let yearFrom = null, yearTo = null, years = '';
  if (ym) {
    yearFrom = Number(ym[1]);
    if (ym[2] && /^\d/.test(ym[2])) yearTo = Number(ym[2]);
    else if (ym[2] || ym[3]) yearTo = null;
    else yearTo = yearFrom;
    years = yearTo === yearFrom ? String(yearFrom) : `${yearFrom}–${yearTo ?? 'present'}`;
  } else flags.push('years');

  const vm = text.match(/\b(?:rev(?:ision)?|version|ver|v)\.?\s*([0-9][\w.]*)/i);
  return { make, model, years, yearFrom, yearTo, powertrain, docType, version: vm?.[1], needs_review: flags.length > 0, review_flags: flags };
}

/** Portal format first; loose heuristics only if that fails. */
export function parseEntry(context, url) {
  return parseNhtsa(context, url) ?? { manufacturer: '', ...parseLoose(context, url) };
}
/** The size NHTSA lists after "Guide" / "Rescue Sheet" (bytes). */
export const listedBytes = (context) => Number(String(context ?? '').match(/(?:Guide|Rescue Sheet)\s+(\d+)\s*$/i)?.[1]) || 0;
