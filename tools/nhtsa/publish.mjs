// Step 3 — upload the shrunk cut sheets + manifest to Supabase Storage (bucket "packs"), and record the list in the database.
// The app downloads packs/nhtsa/manifest.json, then only the files that are new or changed.
//
//   $env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run publish
//   npm run publish -- --dry-run      (build the manifest + print sizes, upload nothing)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { matchGuess, photoKey, rescuePackGuides } from '../../src/lib/match-core.ts';
import { groupForBundles, layout } from '../../src/lib/bundle-core.ts';

const DRY = process.argv.includes('--dry-run');
// Accept the URL however it was copied: strip /rest/v1, /storage/v1 and trailing slashes.
const URL_ = (process.env.SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '') || undefined;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!URL_ || !KEY)) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).'); process.exit(1); }

const { guides } = JSON.parse(readFileSync('out/downloaded.json', 'utf8'));
// Shrunk versions from `npm run compress` (rescue sheets -> page images, ERGs -> ebook PDFs). Without it, originals ship.
const comp = existsSync('out/compressed.json') ? JSON.parse(readFileSync('out/compressed.json', 'utf8')).files : {};
if (!Object.keys(comp).length) console.log('⚠ No out/compressed.json — publishing ORIGINAL PDFs (4+ GB). Run `npm run compress` first.');

const seed = JSON.parse(readFileSync(new URL('../../src/data/fullcharge-data.json', import.meta.url))).vehicles
  .map((v) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));

// Only ship entries a crew can find: make + model required, and a downloaded file.
const ready = guides.filter((g) => g.make && g.model && g.sha256);
const held = guides.filter((g) => !(g.make && g.model && g.sha256));
if (held.length) writeFileSync('out/held-back.json', JSON.stringify(held, null, 1));

const now = new Date();
const version = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');

const localFile = new Map(); // storage path -> file on this PC
// Approved vehicle photos from `npm run photos:build` (one per make + model + years). Optional.
const photos = existsSync('out/photos.json') ? JSON.parse(readFileSync('out/photos.json', 'utf8')).photos : {};
// Phone lines you approved in out/contacts-review.html (npm run guide:scan).
const contactsOk = existsSync('out/contacts-approved.json') ? JSON.parse(readFileSync('out/contacts-approved.json', 'utf8')) : {};
const pk = (g) => g._pk ?? photoKey(g); // approvals are keyed by the years as first listed
const contactsOf = (g) => { const c = contactsOk[pk(g)]; return c?.length ? c : undefined; };
// Battery chemistry + body type you approved in out/battery-review.html (npm run battery:scan).
const batteryOk = existsSync('out/battery-approved.json') ? JSON.parse(readFileSync('out/battery-approved.json', 'utf8')) : {};
const batteryOf = (g) => {
  const b = batteryOk[pk(g)];
  if (!b || !b.chem || b.chem === 'not-stated') return undefined;
  return { chem: b.chem, ...(b.text ? { text: b.text } : {}), ...(b.cell ? { cell: b.cell } : {}), ...(b.voltage ? { voltage: b.voltage } : {}) };
};
// Body type is the same for every year of a model: any approved row for this make + model counts.
const bodyByModel = new Map();
for (const [k, b] of Object.entries(batteryOk)) if (b?.body) bodyByModel.set(k.split('|').slice(0, 2).join('|'), b.body);
const bodyOf = (g) => batteryOk[pk(g)]?.body ?? bodyByModel.get(pk(g).split('|').slice(0, 2).join('|'));
// Years read off the sheet's own title and approved by you ("as of 2021") replace NHTSA's newest-year-only label.
const yearsOk = contactsOk.__years ?? {};
for (const g of guides) {
  g._pk = photoKey(g);
  const y = yearsOk[g._pk];
  if (y?.from) { g.yearFrom = y.from; g.yearTo = y.to ?? null; g.years = y.to ? (y.to === y.from ? `${y.from}` : `${y.from}–${y.to}`) : `${y.from}–present`; }
}
// Cut sheets found INSIDE full guides (npm run erg:cutsheets) — only the pages you approved. Each becomes a normal
// rescue-sheet entry (page images, offline, cut tab) for models NHTSA lists with no separate rescue sheet.
const ergCut = existsSync('out/erg-cut.json') ? JSON.parse(readFileSync('out/erg-cut.json', 'utf8')) : {};
const ergCutOk = existsSync('out/erg-cut-approved.json') ? JSON.parse(readFileSync('out/erg-cut-approved.json', 'utf8')) : {};
let ergCutCount = 0;
for (const g of [...ready]) {
  const d = ergCut[g.key], keep = ergCutOk[g.key];
  if (!d?.sets || d.src !== g.sha256 || !keep?.length) continue;
  const idx = d.pages.map((p, i) => (keep.includes(p) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) continue;
  const sha = `${d.id}-p${idx.map((i) => d.pages[i]).join('-')}`;
  const sets = {};
  for (const dpi of ['200', '300']) { const pages = idx.map((i) => d.sets[dpi].pages[i]); sets[dpi] = { pages, bytes: pages.reduce((a, x) => a + x.bytes, 0) }; }
  comp[sha] = { kind: 'images', pages: idx.length, sets };
  ready.push({ ...g, key: `${g.key}~cut`, docType: 'rescue_sheet', sha256: sha, fromErg: { key: g.key, pages: idx.map((i) => d.pages[i]) } });
  ergCutCount++;
}
const photoOf = (g) => { const p = photos[pk(g)]; if (p) localFile.set(p.file, `out/${p.file}`); return p; };
const items = ready.map((g) => {
  const r = comp[g.sha256];
  const base = {
    key: g.key, make: g.make, model: g.model, years: g.years || '', yearFrom: g.yearFrom ?? null, yearTo: g.yearTo ?? null,
    powertrain: g.powertrain || '', docType: g.docType, version: g.version, sourceUrl: g.sourceUrl, sha256: g.sha256,
    photo: photoOf(g),
    contacts: contactsOf(g),
    battery: batteryOf(g),
    body: bodyOf(g),
    ...(g.fromErg ? { fromErg: g.fromErg } : {}),
    vehicleId: matchGuess({ make: g.make, model: g.model, yearFrom: g.yearFrom, yearTo: g.yearTo, powertrain: g.powertrain }, seed, []).vehicleId,
  };
  if (r?.kind === 'images') {
    const images = {};
    for (const [dpi, set] of Object.entries(r.sets)) {
      images[dpi] = { bytes: set.bytes, pages: set.pages.map((p) => ({ file: p.file, w: p.w, h: p.h, bytes: p.bytes })) };
      set.pages.forEach((p) => localFile.set(p.file, `out/${p.file}`));
    }
    return { ...base, file: '', bytes: r.sets['200'].bytes, pages: r.pages, images };
  }
  const file = `pdfs/${r?.sha256 ?? g.sha256}.pdf`;
  localFile.set(file, r?.file ?? g.pdfFile);
  return { ...base, file, bytes: r?.bytes ?? g.bytes };
});

// ---- Bundles: ~48 MB blobs so phones can fetch a whole pack in the background (app closed) ----
// Same files always land in the same bundle, and a bundle's name is the hash of its contents,
// so after an update only the bundles that actually changed are new.
function buildBundles(key, files) {
  const out = [];
  for (const group of groupForBundles(files)) {
    const bufs = group.map((f) => readFileSync(f.local));
    group.forEach((f, i) => { f.bytes = bufs[i].length; }); // exact on-disk size
    const blob = Buffer.concat(bufs);
    const sha = createHash('sha256').update(blob).digest('hex');
    const path = `bundles/${key.replace(':', '-')}/${sha}.bin`;
    const local = `out/${path}`;
    if (!existsSync(local)) { mkdirSync(local.slice(0, local.lastIndexOf('/')), { recursive: true }); writeFileSync(local, blob); }
    localFile.set(path, local);
    out.push({ file: path, bytes: blob.length, sha256: sha, entries: layout(group) });
  }
  return out;
}
const setFiles = (pred, pick) => {
  const u = new Map();
  for (const g of (typeof pred === 'function' ? items.filter(pred) : pred)) for (const f of pick(g)) if (f.file && !u.has(f.file)) u.set(f.file, { file: f.file, bytes: f.bytes, local: localFile.get(f.file) });
  const ok = [...u.values()].filter((f) => f.local && existsSync(f.local));
  const missing = u.size - ok.length;
  if (missing) console.log(`  ⚠ ${missing} file(s) not found on this PC — left out of bundles (phones fetch them one by one).`);
  return ok.map((f) => ({ ...f, bytes: statSync(f.local).size }));
};
// A sheet listed as BOTH an ERG and a rescue sheet becomes page images, so either pack may hold images.
const pickFiles = (dpi) => (g) => (g.images ? g.images[dpi].pages : [{ file: g.file, bytes: g.bytes }]);
// Rescue pack = rescue sheets + the ERG of vehicles with no rescue sheet + vehicle photos (same rule as the app).
const rescueItems = rescuePackGuides(items);
const withPhoto = (pick) => (g) => [...pick(g), ...(g.photo ? [{ file: g.photo.file, bytes: g.photo.bytes }] : [])];
const orphans = rescueItems.filter((g) => g.docType !== 'rescue_sheet');
console.log(`  ${orphans.length} vehicle entries have no rescue sheet — their full ERG goes in the rescue pack too.`);
console.log(`  ${items.filter((g) => g.photo).length} entries have an approved photo.`);
console.log(`  ${ergCutCount} cut sheets taken from inside full guides.`);
console.log(`  ${items.filter((g) => g.battery).length} entries have approved battery chemistry, ${items.filter((g) => g.body).length} a body type.`);
const bundles = {
  'rescue_sheet:200': buildBundles('rescue_sheet:200', setFiles(items.filter((g) => g.photo || rescueItems.includes(g)), (g) => (rescueItems.includes(g) ? withPhoto(pickFiles('200'))(g) : [g.photo]))),
  'rescue_sheet:300': buildBundles('rescue_sheet:300', setFiles(items.filter((g) => g.photo || rescueItems.includes(g)), (g) => (rescueItems.includes(g) ? withPhoto(pickFiles('300'))(g) : [g.photo]))),
  erg: buildBundles('erg', setFiles((g) => g.docType !== 'rescue_sheet', pickFiles('200'))), // iPad fetches its few 300-dpi pages singly
};

const sum = (a) => a.reduce((x, y) => x + y, 0);
const packBytes = (t, dpi) => {
  const u = new Map();
  for (const g of items.filter((x) => x.docType === t)) {
    if (g.images) g.images[dpi].pages.forEach((p) => u.set(p.file, p.bytes));
    else u.set(g.file, g.bytes);
  }
  return { files: u.size, bytes: sum([...u.values()]) };
};
const manifest = {
  version, generatedAt: now.toISOString(), count: items.length,
  byType: {
    rescue_sheet: { iphone: packBytes('rescue_sheet', '200'), ipad: packBytes('rescue_sheet', '300') },
    erg: { iphone: packBytes('erg', '200'), ipad: packBytes('erg', '300') },
  },
  guides: items,
  bundles,
};
manifest.totalBytes = manifest.byType.rescue_sheet.iphone.bytes + manifest.byType.erg.iphone.bytes;
writeFileSync('out/manifest.json', JSON.stringify(manifest));

const G = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const bt = manifest.byType;
console.log(`Manifest ${version}: ${items.length} vehicle entries, ${items.filter((g) => g.vehicleId).length} linked to FULLCHARGE pages, ${held.length} held back.`);
console.log(`  Rescue sheets: iPhone ${G(bt.rescue_sheet.iphone.bytes)} · iPad ${G(bt.rescue_sheet.ipad.bytes)}`);
console.log(`  Full ERGs:     ${G(bt.erg.iphone.bytes)}`);
console.log(`  Bundles for background download: ${Object.entries(bundles).map(([k, b]) => `${k} ${b.length}`).join(' · ')}`);
if (DRY) process.exit(0);

// New keys (sb_secret_...) go on the apikey header ONLY; legacy service_role JWTs also need Authorization.
// Supabase rate-limits bursts (HTTP/2 "ENHANCE_YOUR_CALM", 429, 5xx). Retry with backoff instead of crashing.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rfetch(url, opts = {}, tries = 6) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, opts);
      if ((r.status === 429 || r.status >= 500) && i < tries) { await sleep(1000 * 2 ** i); continue; }
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1000 * 2 ** i); // network hiccup or "slow down": wait 2s, 4s, 8s…
    }
  }
}

const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const pub = (p) => `${URL_}/storage/v1/object/public/packs/nhtsa/${p}`;
async function upload(path, body, type, upsert) {
  const r = await rfetch(`${URL_}/storage/v1/object/packs/nhtsa/${path}`, {
    method: 'POST', headers: { ...H, 'Content-Type': type, 'x-upsert': upsert ? 'true' : 'false', 'cache-control': upsert ? 'max-age=60' : 'max-age=31536000' }, body,
  });
  if (r.ok || r.status === 409) return;
  const text = await r.text();
  // Storage sometimes answers "already exists" as HTTP 400 with statusCode "409" — the file is safely there.
  if (/Duplicate|KeyAlreadyExists|already exists/i.test(text)) return;
  throw new Error(`${path}: ${r.status} ${text}`);
}

// Everything is content-addressed (the path includes a hash), so unchanged files are never re-uploaded.
let up = 0, had = 0;
const todo = [...localFile.entries()];
const type = (p) => (p.endsWith('.webp') ? 'image/webp' : p.endsWith('.bin') ? 'application/octet-stream' : 'application/pdf');
await Promise.all(Array.from({ length: 3 }, async () => {
  while (todo.length) {
    const [path, local] = todo.shift();
    const head = await rfetch(pub(path), { method: 'HEAD' });
    if (head.ok) had++;
    else { await upload(path, readFileSync(local), type(path), false); up++; await sleep(50); }
    if ((up + had) % 200 === 0) console.log(`${up + had}/${localFile.size} files (uploaded ${up}, already there ${had})`);
  }
}));
// Manifest last — phones only see the new list once every file is in place.
await upload('manifest.json', JSON.stringify(manifest), 'application/json', true);

async function rest(table, rows) {
  const r = await rfetch(`${URL_}/rest/v1/${table}${table === 'nhtsa_guides' ? '?on_conflict=key' : table === 'data_meta' ? '?on_conflict=key' : ''}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
}
for (let i = 0; i < items.length; i += 200) {
  await rest('nhtsa_guides', items.slice(i, i + 200).map((g) => ({
    key: g.key, make: g.make, model: g.model, model_years: g.years, year_from: g.yearFrom, year_to: g.yearTo,
    powertrain: g.powertrain, doc_type: g.docType, version: g.version ?? null, pdf_url: g.sourceUrl,
    sha256: g.sha256, bytes: g.bytes, storage_path: g.file ? `nhtsa/${g.file}` : `nhtsa/img/${g.sha256}/`, vehicle_id: g.vehicleId ?? null,
    last_seen: now.toISOString(), verification_status: 'listed',
  })));
}
await rest('data_meta', [{ key: 'nhtsa_count', value: { count: items.length, held_back: held.length, counted_at: now.toISOString(), manifest: version } }]);
console.log(`\nPublished: ${up} uploaded, ${had} unchanged. Phones get it next time they open Downloads.`);
