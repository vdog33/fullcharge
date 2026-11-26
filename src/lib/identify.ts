import * as ImageManipulator from 'expo-image-manipulator';
import { USE_MOCKS, BACKEND_READY } from '../config';
import { VEHICLES } from '../data/catalog';
import { callFunction } from './supabase';
import { Guess, Guide, matchGuess } from './match-core';
import { extractVin } from './vin-core';
import { BessGuess, BessMatch, matchBess } from './bess-core';
import { bessFamilies, loadBessCatalog } from './bess-catalog';
import { guideIndex, loadPacks } from './packs';

// Camera ID = Gemini's own general knowledge of cars (no per-car training).
// It names make / model / years; the PHONE matches that name to the cut sheets stored on it.
export type Photo = { url: string; credit: string; page: string };
export type RawGuess = Guess & { confidence: number; cues: string[]; checks?: string[]; photo?: Photo | null };
export type Candidate = {
  label: string; guess: Guess; confidence: number; cues: string[];
  checks: string[];      // look at these on the car to confirm the model
  photo: Photo | null;   // reference photo of the model (needs signal — so does camera ID)
  exact?: boolean;       // from a VIN decode: the car is known, so no likelihood is shown
  vehicleId?: string;  // FULLCHARGE page
  guides: Guide[];     // NHTSA cut sheets on this phone (or listed, if the pack isn't downloaded)
  yearsLoose?: boolean; // no sheet for these exact years — closest years shown, crew must check
};
export type IdResult = { candidates: Candidate[]; notes: string; attemptId?: string; feedbackToken?: string };

export const NO_SIGNAL_MSG =
  'Photo ID needs signal — it could not run. Search manually below; every downloaded cut sheet works offline.';

export const guessLabel = (g: Guess) => {
  const y = g.yearFrom && g.yearTo && g.yearFrom !== g.yearTo ? `${g.yearFrom}–${g.yearTo}` : g.yearFrom ?? g.yearTo ?? '';
  return `${y} ${g.make} ${g.model}`.trim();
};

/** Clamp, sort, dedupe, max 5, then match each guess against the local catalog + cut-sheet index. */
export function toCandidates(raw: RawGuess[]): Candidate[] {
  const seen = new Set<string>();
  const seed = VEHICLES.map((v) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));
  return (raw ?? [])
    .filter((g) => g && g.make && g.model)
    .map((g) => ({ ...g, confidence: Math.max(0, Math.min(100, Math.round(Number(g.confidence) || 0))) }))
    .sort((a, b) => b.confidence - a.confidence)
    .filter((g) => { const k = `${g.make}|${g.model}`.toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); })
    .slice(0, 5)
    .map((g) => {
      const m = matchGuess(g, seed, guideIndex());
      return {
        label: guessLabel(g), guess: g, confidence: g.confidence, cues: (g.cues ?? []).slice(0, 6),
        checks: (g.checks ?? []).slice(0, 5), photo: g.photo ?? null, vehicleId: m.vehicleId, guides: m.guides, yearsLoose: m.yearsLoose,
      };
    });
}

/** After the crew accepts: straight to the rescue sheet itself. Then the cut-sheet page, then the FULLCHARGE page. */
export function destination(c: Candidate): { href: string; id: string } | null {
  const sheet = c.guides.find((g) => g.docType === 'rescue_sheet' && g.images) ?? c.guides.find((g) => g.docType === 'rescue_sheet');
  if (sheet) return { href: sheet.images ? `/sheet?key=${sheet.key}` : `/erg-pdf?kind=guide&id=${sheet.key}`, id: c.vehicleId ?? `guide:${sheet.key}` };
  if (c.vehicleId) return { href: `/vehicle/${c.vehicleId}`, id: c.vehicleId };
  if (c.guides.length) return { href: `/guide?keys=${c.guides.map((g) => g.key).join(',')}&title=${encodeURIComponent(c.label)}`, id: `guide:${c.guides[0].key}` };
  return null;
}

const MOCK_RAW: RawGuess[] = [
  { make: 'Tesla', model: 'Model Y', yearFrom: 2020, yearTo: 2024, powertrain: 'BEV', confidence: 92, cues: ['coupe-SUV roofline', 'flush door handles', 'grille-less front', 'fender camera housing'], checks: ['No grille — smooth nose', 'Flush door handles', 'Tall hatchback, taller than Model 3'] },
  { make: 'Ford', model: 'Mustang Mach-E', yearFrom: 2021, yearTo: 2024, powertrain: 'BEV', confidence: 32, cues: ['coupe-SUV profile'] },
  { make: 'Kia', model: 'EV6', yearFrom: 2022, yearTo: 2024, powertrain: 'BEV', confidence: 22, cues: ['sloping rear'] },
  { make: 'Tesla', model: 'Model X', yearFrom: 2016, yearTo: 2024, powertrain: 'BEV', confidence: 15, cues: ['Tesla front fascia'] },
];

/** Tell the crew WHY photo ID failed — "no signal" for everything hid server problems (#18). */
function idError(e: unknown): string {
  const m = String((e as Error)?.message ?? '');
  if ((e as Error)?.name === 'AbortError' || /abort/i.test(m)) return 'Photo ID took too long (weak signal?). Search manually below — downloaded cut sheets work offline.';
  if (/network request failed|failed to fetch|network/i.test(m)) return NO_SIGNAL_MSG;
  if (/Gemini (503|500|429)|high demand|overloaded|UNAVAILABLE|quota/i.test(m)) return 'Photo ID is busy right now (Google\'s AI is overloaded). Try again in a few seconds, or search manually below.';
  if (/HTTP 40[13]|JWT|apikey|unauthor/i.test(m)) return `Photo ID couldn't sign in to the server (${m.slice(0, 80)}). Search manually below.`;
  if (/HTTP 404|not found/i.test(m)) return 'Photo ID server not found — the identify-vehicle function may not be deployed. Search manually below.';
  return `Photo ID failed on the server: ${m.slice(0, 140)}. Search manually below.`;
}

export async function identifyPhoto(uri: string, opts: { sharePhoto: boolean }): Promise<IdResult> {
  await loadPacks();
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 900));
    return { candidates: toCandidates(MOCK_RAW), notes: 'MOCK result. No match is certain from one photo — confirm with badge / ERG.', attemptId: 'mock-attempt', feedbackToken: 'mock' };
  }
  if (!BACKEND_READY) throw new Error(NO_SIGNAL_MSG);
  // 1024 px / q0.65 ≈ half the upload of 1280 / q0.75 — the slowest part on one bar of LTE. Badges still read fine.
  const t0 = Date.now();
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
    compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  try {
    const t1 = Date.now();
    const r = await callFunction<{ guesses: RawGuess[]; notes: string; attemptId?: string; feedbackToken?: string; timing?: { geminiMs: number; serverMs: number; imageKB: number } }>('identify-vehicle', {
      action: 'identify', imageBase64: img.base64, mimeType: 'image/jpeg', sharePhoto: opts.sharePhoto,
    }, 45000);
    const t2 = Date.now();
    // Where the time went: phone resize · network (upload + reply) · Gemini · total.
    console.log(`[ID timing] resize ${t1 - t0} ms · network ${t2 - t1 - (r.timing?.serverMs ?? 0)} ms · Gemini ${r.timing?.geminiMs ?? '?'} ms · total ${t2 - t0} ms · ${r.timing?.imageKB ?? '?'} KB`);
    return { candidates: toCandidates(r.guesses), notes: r.notes, attemptId: r.attemptId, feedbackToken: r.feedbackToken };
  } catch (e) {
    throw new Error(idError(e));
  }
}

/** VIN path: the decode names the car; ask the server for a reference photo + checks (needs signal; empty without). */
export async function describeModel(g: Guess): Promise<{ photo: Photo | null; checks: string[] }> {
  if (USE_MOCKS || !BACKEND_READY) return { photo: null, checks: USE_MOCKS ? ['MOCK — checks come from the server'] : [] };
  try {
    const r = await callFunction<{ photo: Photo | null; checks: string[] }>('identify-vehicle', {
      action: 'describe_model', make: g.make, model: g.model, year: g.yearFrom ?? null, powertrain: g.powertrain ?? '',
    }, 8000);
    return { photo: r.photo ?? null, checks: (r.checks ?? []).slice(0, 5) };
  } catch { return { photo: null, checks: [] }; }
}

/** VIN decode → one exact candidate for the same pick / check / accept screen as camera ID. */
export function vinCandidate(d: { make?: string; model?: string; year?: number | null; electrification?: string }, guides: Guide[], vehicleId?: string): Candidate | null {
  if (!d.make || !d.model) return null;
  const e = (d.electrification ?? '').toUpperCase();
  const powertrain = e.startsWith('BEV') ? 'BEV' : e.startsWith('PHEV') ? 'PHEV' : e.startsWith('FCEV') ? 'FCEV' : e.includes('HEV') ? 'HEV' : e ? 'UNKNOWN' : 'ICE';
  const guess: Guess = { make: d.make, model: d.model, yearFrom: d.year ?? null, yearTo: d.year ?? null, powertrain };
  const v = vehicleId ? VEHICLES.find((x) => x.id === vehicleId) : undefined;
  return {
    label: guessLabel(guess), guess, confidence: 100, cues: [], exact: true, photo: null,
    checks: v ? v.id_cues.slice(0, 5) : [], vehicleId, guides,
  };
}

/** Learning loop — measures accuracy; nothing has to be "taught" for ID to work. */
export async function sendFeedback(p: { attemptId?: string; feedbackToken?: string; confirmed: string | null; correction?: string }) {
  if (USE_MOCKS || !BACKEND_READY || !p.attemptId) return;
  try {
    await callFunction('identify-vehicle', { action: 'feedback', attemptId: p.attemptId, feedbackToken: p.feedbackToken, confirmedId: p.confirmed, correction: p.correction }, 10000);
  } catch { /* offline — stays in local ID history */ }
}

/** Read the VIN off a photo of the dash plate / door label (Gemini, needs signal). Validated on the phone. */
export async function readVinFromPhoto(uri: string): Promise<{ vin: string; checked: boolean } | null> {
  if (USE_MOCKS) { await new Promise((r) => setTimeout(r, 700)); return { vin: '7SAYGDEEXPF000001', checked: true }; }
  if (!BACKEND_READY) throw new Error('Reading a VIN from a photo needs signal. Scan the door-jamb barcode or type it.');
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  try {
    const r = await callFunction<{ vin?: string; candidates?: string[] }>('identify-vehicle', { action: 'read_vin', imageBase64: img.base64, mimeType: 'image/jpeg' }, 20000);
    return extractVin([r.vin, ...(r.candidates ?? [])].filter(Boolean).join(' '));
  } catch {
    throw new Error('Could not read the VIN — likely no signal. Scan the barcode or type it.');
  }
}

// ---- Home batteries ----

export type BessIdResult = { guesses: (BessGuess & { label: string })[]; matches: BessMatch[]; notes: string };

/** Photo of a home battery / its label -> Gemini reads brand, product, model numbers -> matched to the CEC catalog on the phone. */
export async function identifyBessPhoto(uri: string): Promise<BessIdResult> {
  await loadBessCatalog();
  let guesses: (BessGuess & { label: string })[];
  let notes = '';
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 800));
    guesses = [{ brand: 'Tesla', product: 'Powerwall 3', modelNumbers: ['1707000-25-K'], confidence: 90, cues: ['white flat wall unit', 'Tesla logo', 'label P/N 1707000'], label: 'Tesla Powerwall 3' }];
    notes = 'MOCK result. Confirm on the unit label.';
  } else {
    if (!BACKEND_READY) throw new Error('Photo ID needs signal. Browse by brand below.');
    const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    try {
      const r = await callFunction<{ guesses: BessGuess[]; notes: string }>('identify-vehicle', { action: 'identify_bess', imageBase64: img.base64, mimeType: 'image/jpeg' }, 25000);
      guesses = (r.guesses ?? []).map((g) => ({ ...g, label: [g.brand, g.product].filter(Boolean).join(' ') || 'Unknown unit' }));
      notes = r.notes ?? '';
    } catch {
      throw new Error('Photo ID couldn\'t run — likely no signal. Browse by brand below.');
    }
  }
  const fams = bessFamilies();
  const seen = new Set<string>();
  const matches = guesses.flatMap((g) => matchBess(g, fams)).filter((m) => (seen.has(m.family.id) ? false : (seen.add(m.family.id), true))).slice(0, 6);
  return { guesses, matches, notes };
}
