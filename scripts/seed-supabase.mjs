// Upserts the 19 seed vehicles + 8 BESS into Supabase. No dependencies.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.mjs
import { readFileSync } from 'node:fs';

const url = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '') || undefined;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const data = JSON.parse(readFileSync(new URL('../src/data/fullcharge-data.json', import.meta.url)));
const yr = (s) => { const m = String(s).match(/(\d{4})/); return m ? Number(m[1]) : null; };

const vehicles = data.vehicles.map((v) => ({
  id: v.id, make: v.make, model: v.model, years: v.years, year_from: yr(v.years), year_to: /present/.test(v.years) ? null : yr(v.years.split('–')[1] ?? ''),
  powertrain: v.type, erg_pdf_url: v.erg_pdf_url, erg_pdf_label: v.erg_pdf_label, erg_verified_note: v.erg_verified_note,
  source: 'seed', verification_status: 'verify-before-shipping', chemistry: v.chemistry, chemistry_verified: String(v.chemistry_verified),
  pack: v.pack, pack_kwh: v.id === 'wrangler-4xe' ? 17.3 : null, pack_voltage: null,
  cut_loop: v.cut_loop, lv_location: v.lv_location, no_cut_zones: v.no_cut_zones, airbag_hv: v.airbag_hv, tow_notes: v.tow,
  release: v.release, id_cues: v.id_cues, watch_for: v.watch_for ?? null, warning: v.warning ?? null,
}));
const bess = data.bess.map((b) => ({ ...b, shutdown_steps: b.shutdown_steps }));

async function upsert(table, rows) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(table, r.status, r.ok ? 'ok' : await r.text());
}

await upsert('vehicles', vehicles);
await upsert('bess', bess);
await upsert('data_packs', [{ id: 'core', name: 'Core', version: data.data_version, required: true, published: true }]);
await upsert('data_meta', [{ key: 'data_version', value: { version: data.data_version, source: data.source } }]);
