// Add approved photos, years, phone numbers, battery chemistry / body type and cut sheets found inside full guides
// to the cut-sheet list that's ALREADY on Supabase —
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
// Battery chemistry + body type (npm run battery:scan → battery-approved.json).
const bat = existsSync('out/battery-approved.json') ? JSON.parse(readFileSync('out/battery-approved.json', 'utf8')) : {};
const bodyByModel = new Map();
for (const [k, b] of Object.entries(bat)) if (b?.body) bodyByModel.set(k.split('|').slice(0, 2).join('|'), b.body);
let nB = 0, nBody = 0;
for (const g of m.guides) {
  const b = bat[g._pk];
  if (b?.chem && b.chem !== 'not-stated') { g.battery = { chem: b.chem, ...(b.text ? { text: b.text } : {}), ...(b.cell ? { cell: b.cell } : {}), ...(b.voltage ? { voltage: b.voltage } : {}) }; nB++; }
  const body = b?.body ?? bodyByModel.get(g._pk.split('|').slice(0, 2).join('|'));
  if (body) { g.body = body; nBody++; }
}
// Cut sheets found INSIDE full guides (npm run erg:cutsheets → erg-cut-approved.json): each becomes a normal
// rescue-sheet entry with page images. Re-running replaces the earlier ones.
const ergCut = existsSync('out/erg-cut.json') ? JSON.parse(readFileSync('out/erg-cut.json', 'utf8')) : {};
const ergCutOk = existsSync('out/erg-cut-approved.json') ? JSON.parse(readFileSync('out/erg-cut-approved.json', 'utf8')) : {};
m.guides = m.guides.filter((g) => !g.fromErg);
let nCut = 0;
for (const g of [...m.guides]) {
  if (g.docType === 'rescue_sheet') continue;
  const d = ergCut[g.key], keep = ergCutOk[g.key];
  if (!d?.sets || d.src !== g.sha256 || !keep?.length) continue;
  const idx = d.pages.map((p, i) => (keep.includes(p) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) continue;
  const images = {};
  for (const dpi of ['200', '300']) {
    const pages = idx.map((i) => d.sets[dpi].pages[i]);
    images[dpi] = { bytes: pages.reduce((a, x) => a + x.bytes, 0), pages };
    pages.forEach((x) => uploads.set(x.file, `out/${x.file}`));
  }
  const pagesUsed = idx.map((i) => d.pages[i]);
  m.guides.push({ ...g, key: `${g.key}~cut`, docType: 'rescue_sheet', file: '', sha256: `${d.id}-p${pagesUsed.join('-')}`,
    bytes: images['200'].bytes, pages: idx.length, images, fromErg: { key: g.key, pages: pagesUsed } });
  nCut++;
}
m.count = m.guides.length;
console.log(`Battery chemistry on ${nB} entries · body type on ${nBody} · ${nCut} cut sheets from inside full guides.`);
const now = new Date();
m.version = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
m.generatedAt = now.toISOString();
console.log(`Photos on ${nP} entries · contacts on ${nC} · years fixed on ${nY}. ${uploads.size} image files to upload.`);

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
