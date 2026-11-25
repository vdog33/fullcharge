// Camera ID: photo -> Gemini vision (general car knowledge) -> up to 5 ranked make/model/year guesses. Client ALWAYS confirms.
// Also records the learning-loop feedback ("Was this right? Yes / No, it was ___").
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
const MOCK = Deno.env.get('IDENTIFY_MOCK') === 'true' || !GEMINI_KEY;
const URL_ = Deno.env.get('SUPABASE_URL')!;
// Server key: a SERVICE_KEY secret if you set one, else the legacy service_role key, else the project's new secret key.
function serverKey(): string {
  const direct = Deno.env.get('SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;
  try { const all = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); return String(Object.values(all)[0] ?? ''); } catch { return ''; }
}
const admin = createClient(URL_, serverKey());

// Open-world: Gemini names the vehicle from its own general knowledge. No catalog list, no per-car training.
// The phone matches the name to the cut sheets it has stored.
type Photo = { url: string; credit: string; page: string };
type RawGuess = {
  make: string; model: string; yearFrom?: number | null; yearTo?: number | null; powertrain?: string; trim?: string;
  confidence: number; cues: string[];
  checks?: string[];   // visible features a crew can check on the car to confirm THIS model vs look-alikes
  photo?: Photo | null; // reference photo of the model (Wikipedia lead image) — for the crew to compare
};

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

function clean(list: RawGuess[]): RawGuess[] {
  return (list ?? [])
    .filter((g) => g && g.make && g.model)
    .map((g) => ({
      make: String(g.make).slice(0, 40), model: String(g.model).slice(0, 60),
      yearFrom: Number(g.yearFrom) || null, yearTo: Number(g.yearTo) || null,
      powertrain: String(g.powertrain ?? 'unknown').toUpperCase(), trim: g.trim ? String(g.trim).slice(0, 40) : undefined,
      confidence: Math.max(0, Math.min(100, Math.round(Number(g.confidence) || 0))),
      cues: (g.cues ?? []).map(String).slice(0, 6),
      checks: (g.checks ?? []).map((c) => String(c).slice(0, 90)).slice(0, 5),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

async function userId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
    let pub = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!pub) { try { pub = String(Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))[0] ?? ''); } catch { /* none */ } }
  const c = createClient(URL_, pub, { global: { headers: { Authorization: auth } } });
  const { data } = await c.auth.getUser();
  return data.user?.id ?? null;
}

async function gemini(imageBase64: string, mimeType: string) {
  const prompt = `You help firefighters identify a vehicle at a crash or fire, so they can pull its manufacturer emergency response guide.
Identify the vehicle in the photo from your own knowledge of vehicles: make, model (official name, e.g. "Mustang Mach-E", "Model Y", "F-150 Lightning"),
likely model-year range, and powertrain: BEV, PHEV, HEV, FCEV, ICE or UNKNOWN. Look for EV cues: charge-port door, no exhaust, closed grille, EV badges
("e-tron", "EQ", "Lightning", "4xe", "Prime", "Recharge", "Hybrid").
Return up to 5 guesses, most likely first, each with confidence 0-100 and up to 6 short visible cues you used.
For each guess also give "checks": 3 to 5 short features a firefighter can look at on the car in seconds to confirm it is
THIS model and not a look-alike (badge text and where it is, light shape, door handles, charge-port side, roofline, grille).
Only features that are true for that model and year range; plain words, max 10 words each.
Similar-looking vehicles that differ in powertrain (e.g. F-150 vs F-150 Lightning, Wrangler vs Wrangler 4xe) MUST be separate guesses.
In "notes", say what limits certainty (damage, angle, lighting, missing badge). Never claim certainty from one photo.`;
  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          guesses: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            make: { type: 'STRING' }, model: { type: 'STRING' }, trim: { type: 'STRING' },
            yearFrom: { type: 'INTEGER' }, yearTo: { type: 'INTEGER' },
            powertrain: { type: 'STRING', enum: ['BEV', 'PHEV', 'HEV', 'FCEV', 'ICE', 'UNKNOWN'] },
            confidence: { type: 'INTEGER' }, cues: { type: 'ARRAY', items: { type: 'STRING' } },
            checks: { type: 'ARRAY', items: { type: 'STRING' } },
          }, required: ['make', 'model', 'powertrain', 'confidence', 'cues', 'checks'] } },
          notes: { type: 'STRING' },
        },
        required: ['guesses', 'notes'],
      },
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
  const parsed = JSON.parse(text);
  return { guesses: parsed.guesses as RawGuess[], notes: String(parsed.notes ?? '') };
}

/** Reference photo of a model: the lead image of its Wikipedia article. Best effort — 2.5 s, never blocks the ID. */
async function modelPhoto(make: string, model: string): Promise<Photo | null> {
  const q = encodeURIComponent(`${make} ${model} automobile`);
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q}&gsrlimit=1` +
    `&prop=pageimages|info&piprop=thumbnail&pithumbsize=800&inprop=url`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'FULLCHARGE/1.0 (first-responder app; vehicle reference photos)' } });
    clearTimeout(t);
    if (!r.ok) return null;
    const pages = Object.values((await r.json())?.query?.pages ?? {}) as { title?: string; fullurl?: string; thumbnail?: { source?: string } }[];
    const p = pages[0];
    if (!p?.thumbnail?.source || !p.title) return null;
    // The article must actually be about this make — a search can drift to a different car.
    if (!p.title.toLowerCase().includes(make.toLowerCase().split(' ')[0])) return null;
    return { url: p.thumbnail.source, credit: `Wikipedia: ${p.title}`, page: p.fullurl ?? '' };
  } catch { return null; }
}
const withPhotos = (gs: RawGuess[]) => Promise.all(gs.map(async (g) => ({ ...g, photo: await modelPhoto(g.make, g.model) })));

/** VIN path: the VIN already names the car — just get checks a crew can confirm on it. Text only, no photo sent. */
async function geminiChecks(make: string, model: string, year: number | null, powertrain: string): Promise<string[]> {
  const prompt = `A firefighter has a ${year ?? ''} ${make} ${model} (${powertrain || 'unknown powertrain'}) from a VIN decode.
Give 3 to 5 short features they can look at on the car in seconds to confirm it is THIS model and year range and not a look-alike
(badge text and where it is, light shape, door handles, charge-port side, roofline, grille). Only features true for this model and year.
Plain words, max 10 words each.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { checks: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['checks'] } },
    }),
  });
  if (!res.ok) return [];
  const out = await res.json();
  try {
    const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
    return ((JSON.parse(text).checks ?? []) as unknown[]).map((c) => String(c).slice(0, 90)).slice(0, 5);
  } catch { return []; }
}

/** Home battery / ESS from a photo of the unit or its label. The phone matches the answer to the CEC listing. */
async function geminiBess(imageBase64: string, mimeType: string) {
  const prompt = `You help firefighters identify a home battery energy storage system (BESS / ESS) from a photo of the unit or its label.
Read the brand, the product name (e.g. "Powerwall 3", "IQ Battery 5P", "aPower 2", "PWRcell", "Home Battery"), and copy EVERY model,
part or catalog number printed on the label exactly as printed (e.g. "1707000-25-K", "IQBATTERY-5P-1P-NA"). Also read the kWh rating
and battery chemistry if printed (e.g. LFP / lithium iron phosphate, NMC). Do not invent numbers you cannot read.
Return up to 3 guesses, most likely first, each with confidence 0-100 and up to 6 short visible cues.
In "notes", say what limits certainty (no label visible, glare, damage, cover closed).`;
  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          guesses: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            brand: { type: 'STRING' }, product: { type: 'STRING' },
            modelNumbers: { type: 'ARRAY', items: { type: 'STRING' } },
            kwh: { type: 'NUMBER' }, chemistry: { type: 'STRING' },
            confidence: { type: 'INTEGER' }, cues: { type: 'ARRAY', items: { type: 'STRING' } },
          }, required: ['brand', 'confidence'] } },
          notes: { type: 'STRING' },
        },
        required: ['guesses', 'notes'],
      },
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
  const parsed = JSON.parse(text);
  const guesses = (parsed.guesses ?? []).slice(0, 3).map((g: Record<string, unknown>) => ({
    brand: String(g.brand ?? '').slice(0, 40), product: String(g.product ?? '').slice(0, 60),
    modelNumbers: ((g.modelNumbers as unknown[]) ?? []).map((m) => String(m).slice(0, 40)).slice(0, 8),
    kwh: Number(g.kwh) || null, chemistry: g.chemistry ? String(g.chemistry).slice(0, 30) : undefined,
    confidence: Math.max(0, Math.min(100, Math.round(Number(g.confidence) || 0))), cues: ((g.cues as unknown[]) ?? []).map(String).slice(0, 6),
  }));
  return { guesses, notes: String(parsed.notes ?? '') };
}

/** Read a VIN off a photo (dash plate through the windshield, or the door-jamb label). */
async function geminiVin(imageBase64: string, mimeType: string) {
  const prompt = `Read the vehicle identification number (VIN) in this photo. It may be on a metal plate seen through the windshield,
or on the door-jamb certification label. A VIN is exactly 17 characters, letters and digits, and never contains I, O or Q.
Copy the characters exactly as printed; do not guess hidden characters. If several 17-character strings are visible, list them all.`;
  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { vin: { type: 'STRING' }, candidates: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['vin'] },
    },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}';
  const parsed = JSON.parse(text);
  const clean = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { vin: clean(parsed.vin), candidates: (parsed.candidates ?? []).map(clean).filter((v: string) => v.length >= 17).slice(0, 5) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();

    if (body.action === 'feedback') {
      const { attemptId, feedbackToken, confirmedId, correction } = body;
      if (!attemptId || !feedbackToken) return json({ error: 'missing attempt' }, 400);
      const { data: row } = await admin.from('id_attempts').select('feedback_token_hash').eq('id', attemptId).single();
      if (!row || row.feedback_token_hash !== (await sha256(feedbackToken))) return json({ error: 'forbidden' }, 403);
      await admin.from('id_attempts').update({
        confirmed_id: confirmedId ?? null, correction: correction ? String(correction).slice(0, 120) : null, feedback_at: new Date().toISOString(),
      }).eq('id', attemptId);
      return json({ ok: true });
    }

    if (body.action === 'identify_bess') {
      const { imageBase64, mimeType = 'image/jpeg' } = body;
      if (!/^image\/(jpeg|png)$/.test(mimeType)) return json({ error: 'JPEG or PNG only' }, 400);
      if (!imageBase64 || imageBase64.length > 8_000_000) return json({ error: 'image missing or too large' }, 400);
      if (MOCK) return json({ guesses: [{ brand: 'Tesla', product: 'Powerwall 3', modelNumbers: ['1707000-25-K'], confidence: 90, cues: ['SERVER MOCK'] }], notes: 'SERVER MOCK — no Gemini key set.' });
      return json(await geminiBess(imageBase64, mimeType));
    }

    if (body.action === 'describe_model') {
      const make = String(body.make ?? '').slice(0, 40), model = String(body.model ?? '').slice(0, 60);
      if (!make || !model) return json({ error: 'make and model required' }, 400);
      const year = Number(body.year) || null, powertrain = String(body.powertrain ?? '').slice(0, 20);
      if (MOCK) return json({ photo: await modelPhoto(make, model), checks: ['SERVER MOCK — no Gemini key set.'] });
      const [photo, checks] = await Promise.all([modelPhoto(make, model), geminiChecks(make, model, year, powertrain)]);
      return json({ photo, checks });
    }

    if (body.action === 'read_vin') {
      const { imageBase64, mimeType = 'image/jpeg' } = body;
      if (!/^image\/(jpeg|png)$/.test(mimeType)) return json({ error: 'JPEG or PNG only' }, 400);
      if (!imageBase64 || imageBase64.length > 8_000_000) return json({ error: 'image missing or too large' }, 400);
      if (MOCK) return json({ vin: '7SAYGDEEXPF000001', candidates: [] });
      return json(await geminiVin(imageBase64, mimeType)); // not stored: a VIN photo is not training data
    }

    // identify
    const { imageBase64, mimeType = 'image/jpeg', sharePhoto = false } = body;
    if (!/^image\/(jpeg|png)$/.test(mimeType)) return json({ error: 'JPEG or PNG only' }, 400);
    if (!imageBase64 || imageBase64.length > 8_000_000) return json({ error: 'image missing or too large' }, 400);

    const raw = MOCK
      ? { guesses: [
          { make: 'Tesla', model: 'Model Y', yearFrom: 2020, yearTo: 2024, powertrain: 'BEV', confidence: 92, cues: ['coupe-SUV roofline', 'flush door handles', 'grille-less front'], checks: ['No grille, smooth nose', 'Tall hatchback, taller than Model 3'] },
          { make: 'Ford', model: 'Mustang Mach-E', yearFrom: 2021, yearTo: 2024, powertrain: 'BEV', confidence: 32, cues: ['coupe-SUV profile'], checks: ['Pony badge on the nose', 'Tri-bar tail lights'] },
        ], notes: 'SERVER MOCK — no Gemini key set.' }
      : await gemini(imageBase64, mimeType);
    const guesses = await withPhotos(clean(raw.guesses));
    const top = guesses[0] ? `${guesses[0].yearFrom ?? ''} ${guesses[0].make} ${guesses[0].model}`.trim() : null;

    const uid = await userId(req);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const { data: row } = await admin.from('id_attempts').insert({
      user_id: uid, source: 'camera', model: MOCK ? 'mock' : GEMINI_MODEL, top_match: top,
      candidates: guesses, notes: raw.notes, feedback_token_hash: await sha256(token),
    }).select('id').single();

    if (sharePhoto && row?.id) {
      const path = `${uid ?? 'anon'}/${row.id}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
      const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      const up = await admin.storage.from('id-photos').upload(path, bytes, { contentType: mimeType });
      if (!up.error) await admin.from('id_attempts').update({ photo_path: path }).eq('id', row.id);
    }

    return json({ guesses, notes: raw.notes, attemptId: row?.id, feedbackToken: token });
  } catch (e) {
    console.error(e);
    return json({ error: 'identify failed' }, 500);
  }
});
