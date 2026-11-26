// Add approved photos, years and phone numbers to the cut-sheet list that's ALREADY on Supabase —
// for a PC that doesn't have the original out\ folder (no re-scrape, no 4 GB download).
//   $env:SUPABASE_URL=...; $env:SUPABASE_SERVICE_ROLE_KEY=...; npm run publish:extras
import { existsSync, readFileSync } from 'node:fs';
import { photoKey } from '../../src/lib/match-core.ts';
import { PUBLIC_BASE } from './guides-source.mjs';

const URL_ = (process.env.SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).'); process.exit(1); }
const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };

const r = await fetch(`${PUBLIC_BASE}/manifest.json?t=${Date.now()}`);
if (!r.ok) throw new Error(`Couldn't read the published list: HTTP ${r.status}`);
const m = await r.json();
const photos = existsSync('out/photos.json') ? JSON.parse(readFileSync('out/photos.json', 'utf8')).photos : {};
const ok = existsSync('out/contacts-approved.json') ? JSON.parse(readFileSync('out/contacts-approved.json', 'utf8')) : {};
const years = ok.__years ?? {};

let nP = 0, nC = 0, nY = 0;
const uploads = new Map();
for (const g of m.guides) {
  const k = g._pk ?? photoKey(g); // key as first listed — approvals use it
  g._pk = k;
  const p = photos[k];
  if (p) { g.photo = { file: p.file, w: p.w, h: p.h, bytes: p.bytes, credit: p.credit, license: p.license }; uploads.set(p.file, `out/${p.file}`); nP++; }
  if (ok[k]?.length) { g.contacts = ok[k]; nC++; }
  const y = years[k];
  if (y?.from) { g.yearFrom = y.from; g.yearTo = y.to ?? null; g.years = y.to ? (y.to === y.from ? `${y.from}` : `${y.from}–${y.to}`) : `${y.from}–present`; nY++; }
}
const now = new Date();
m.version = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
m.generatedAt = now.toISOString();
console.log(`Photos on ${nP} entries · contacts on ${nC} · years fixed on ${nY}. ${uploads.size} photo files to upload.`);

async function upload(path, body, type, upsert) {
  for (let i = 1; ; i++) {
    const res = await fetch(`${URL_}/storage/v1/object/packs/nhtsa/${path}`, {
      method: 'POST', headers: { ...H, 'Content-Type': type, 'x-upsert': upsert ? 'true' : 'false', 'cache-control': upsert ? 'max-age=60' : 'max-age=31536000' }, body,
    });
    if (res.ok || res.status === 409) return;
    const t = await res.text();
    if (/Duplicate|already exists/i.test(t)) return;
    if (i >= 5) throw new Error(`${path}: ${res.status} ${t}`);
    await new Promise((s) => setTimeout(s, 1000 * 2 ** i));
  }
}
let n = 0;
for (const [path, local] of uploads) {
  if (!existsSync(local)) { console.log(`  missing on this PC: ${local}`); continue; }
  await upload(path, readFileSync(local), 'image/webp', false);
  if (++n % 50 === 0) console.log(`${n}/${uploads.size}`);
}
await upload('manifest.json', JSON.stringify(m), 'application/json', true); // last: phones see it once photos are there
console.log(`Published list ${m.version}. Phones: Downloads → Update.`);
