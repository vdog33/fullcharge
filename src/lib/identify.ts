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
export type RawGuess = Guess & { confidence: number; cues: string[] };
export type Candidate = {
  label: string; guess: Guess; confidence: number; cues: string[];
  vehicleId?: string;  // FULLCHARGE page
  guides: Guide[];     // NHTSA cut sheets on this phone (or listed, if the pack isn't downloaded)
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
      return { label: guessLabel(g), guess: g, confidence: g.confidence, cues: (g.cues ?? []).slice(0, 6), vehicleId: m.vehicleId, guides: m.guides };
    });
}

/** Where "Yes" goes: FULLCHARGE page > NHTSA cut sheet(s) > nothing on file. */
export function destination(c: Candidate): { href: string; id: string } | null {
  if (c.vehicleId) return { href: `/vehicle/${c.vehicleId}`, id: c.vehicleId };
  if (c.guides.length) return { href: `/guide?keys=${c.guides.map((g) => g.key).join(',')}&title=${encodeURIComponent(c.label)}`, id: `guide:${c.guides[0].key}` };
  return null;
}

const MOCK_RAW: RawGuess[] = [
  { make: 'Tesla', model: 'Model Y', yearFrom: 2020, yearTo: 2024, powertrain: 'BEV', confidence: 92, cues: ['coupe-SUV roofline', 'flush door handles', 'grille-less front', 'fender camera housing'] },
  { make: 'Ford', model: 'Mustang Mach-E', yearFrom: 2021, yearTo: 2024, powertrain: 'BEV', confidence: 32, cues: ['coupe-SUV profile'] },
  { make: 'Kia', model: 'EV6', yearFrom: 2022, yearTo: 2024, powertrain: 'BEV', confidence: 22, cues: ['sloping rear'] },
  { make: 'Tesla', model: 'Model X', yearFrom: 2016, yearTo: 2024, powertrain: 'BEV', confidence: 15, cues: ['Tesla front fascia'] },
];

export async function identifyPhoto(uri: string, opts: { sharePhoto: boolean }): Promise<IdResult> {
  await loadPacks();
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 900));
    return { candidates: toCandidates(MOCK_RAW), notes: 'MOCK result. No match is certain from one photo — confirm with badge / ERG.', attemptId: 'mock-attempt', feedbackToken: 'mock' };
  }
  if (!BACKEND_READY) throw new Error(NO_SIGNAL_MSG);
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1280 } }], {
    compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  try {
    const r = await callFunction<{ guesses: RawGuess[]; notes: string; attemptId?: string; feedbackToken?: string }>('identify-vehicle', {
      action: 'identify', imageBase64: img.base64, mimeType: 'image/jpeg', sharePhoto: opts.sharePhoto,
    });
    return { candidates: toCandidates(r.guesses), notes: r.notes, attemptId: r.attemptId, feedbackToken: r.feedbackToken };
  } catch {
    throw new Error(NO_SIGNAL_MSG);
  }
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
