// ISO 17840-3 sections of every full emergency response guide → the app's standard tabs, in on-scene order:
//   Disable · Cut · Fire · Water · Contacts · Battery · Tow   (+ Identification feeds "Is this the right car?")
//
// ISO 17840-3 gives every guide the same headings (Identification, Immobilisation / stabilisation / lifting,
// Disable direct hazards, Access to occupants, Stored energy, In case of fire, In case of submersion, Towing…).
// 1) Guides that print those headings: found by their words — fast, no AI.
// 2) Older / non-standard / scanned guides: Gemini sorts each page into a section.
// The key page(s) of each section become images (offline, in the rescue-sheet pack). You approve every page.
//
//   $env:GEMINI_API_KEY = "..."      (only used for guides without the standard headings)
//   npm run sections:scan            -> out/sections.json + out/img/sec-*/ + out/sections-review.html
//   click any wrong page to drop it, Save approvals, move sections-approved.json into out\
//   npm run publish:extras           (or npm run publish on the PC with the scraped out\ folder)
//
//   npm run sections:scan -- tesla   → one make only (quick test)
// Safe to re-run: guides already done are skipped; approvals are kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { loadGuides, PUBLIC_BASE } from './guides-source.mjs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const ONLY = process.argv.slice(2).join(' ').toLowerCase();

function findGhostscript() {
  if (process.env.GS) return process.env.GS;
  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
      if (!existsSync(root)) continue;
      for (const v of readdirSync(root).filter((d) => d.startsWith('gs')).sort().reverse())
        for (const exe of ['gswin64c.exe', 'gswin32c.exe']) { const p = join(root, v, 'bin', exe); if (existsSync(p)) return p; }
    }
    throw new Error('Ghostscript not found. Install the 64-bit AGPL release from ghostscript.com.');
  }
  return 'gs';
}
const GS = findGhostscript();
const gs = (args, timeout = 180_000) => spawnSync(GS, ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', ...args], { timeout });

// Section → its ISO heading words (and the usual older wording). Order = order in an ISO guide.
const SECTIONS = ['identify', 'disable', 'cut', 'battery', 'fire', 'water', 'tow'];
const HEAD = {
  identify: /\bidentification\b|\brecogni[sz]ing\b|\brecognition\b/i,
  disable: /immobili[sz]ation|stabili[sz]ation|disable direct hazards|disabling|disable the (high|hv|vehicle)|shut ?down procedure|power ?down/i,
  cut: /access to (the )?occupants|extrication|rescue cutting|cut zones?\b/i,
  battery: /stored energy|liquids,? gases|high[- ]voltage battery|traction battery|\bREESS\b/i,
  fire: /in case of fire|fire ?fighting|firefighting|vehicle fire/i,
  water: /submersion|submerged|in case of (water|flood)/i,
  tow: /\btowing\b|transportation/i, // not plain "storage": battery pages say "energy storage system"
};
// How many pages to keep per section (the key page; two where the drawing often spills over).
const KEEP = { identify: 1, disable: 2, cut: 2, battery: 2, fire: 1, water: 1, tow: 1 };

const { guides, from } = await loadGuides();
const LOCAL = from === 'out/downloaded.json';
mkdirSync('out/tmp-sec', { recursive: true });
const OUT = 'out/sections.json';
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const todo = guides.filter((g) => g.make && g.model && g.sha256 && g.docType !== 'rescue_sheet' && !g.fromErg &&
  (LOCAL ? g.pdfFile && existsSync(g.pdfFile) : g.file) && (!ONLY || `${g.make} ${g.model}`.toLowerCase().includes(ONLY)));
console.log(`${todo.length} full guides to sort into sections${ONLY ? ` (matching "${ONLY}")` : ''}.`);

async function pdfOf(g, tmp) {
  if (LOCAL) return g.pdfFile;
  const res = await fetch(`${PUBLIC_BASE}/${g.file}`, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`PDF: HTTP ${res.status}`);
  const p = `${tmp}/doc.pdf`;
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

/** Page texts (top lines + all), by page number. */
function readText(pdf, tmp) {
  const dir = `${tmp}/txt`; mkdirSync(dir, { recursive: true });
  gs(['-sDEVICE=txtwrite', `-sOutputFile=${dir}/t%d.txt`, pdf]);
  return readdirSync(dir).map((f) => {
    const t = readFileSync(join(dir, f), 'utf8');
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { page: Number(f.match(/\d+/)[0]), top: lines.slice(0, 8).join(' '), all: t };
  }).sort((a, b) => a.page - b.page);
}

/** Standard headings: a section starts on the page whose TOP lines carry its heading (contents pages skipped). */
function byHeadings(pages) {
  const found = {};
  for (const p of pages) {
    const hitsAll = SECTIONS.filter((s) => HEAD[s].test(p.all));
    if (hitsAll.length >= 5 || /table of contents|\bcontents\b/i.test(p.top)) continue; // contents / index page
    for (const s of SECTIONS) if (!found[s] && HEAD[s].test(p.top)) found[s] = p.page;
  }
  const starts = Object.entries(found).sort((a, b) => a[1] - b[1]);
  const out = {};
  for (const [i, [s, start]] of starts.entries()) {
    const next = starts[i + 1]?.[1] ?? pages.length + 1;
    const pagesOf = [];
    for (let n = start; n < next && pagesOf.length < KEEP[s]; n++) pagesOf.push(n);
    out[s] = pagesOf;
  }
  return out;
}

async function gemini(parts, schema) {
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 5000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const out = await r.json();
    return JSON.parse((out?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
  }
  throw new Error('Gemini busy — re-run later');
}

/** No standard headings: Gemini sorts every page (guides up to 60 pages; longer ones: first 60). */
async function byGemini(g, pdf, total, tmp) {
  if (!KEY) throw new Error('no standard headings and no GEMINI_API_KEY set');
  const pages = Array.from({ length: Math.min(total, 60) }, (_, i) => i + 1);
  const label = {};
  for (let b = 0; b < pages.length; b += 12) {
    const batch = pages.slice(b, b + 12), parts = [], ok = [];
    for (const p of batch) {
      const out = `${tmp}/lo${p}.png`;
      gs(['-sDEVICE=png16m', '-r80', `-dFirstPage=${p}`, `-dLastPage=${p}`, '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${out}`, pdf]);
      if (!existsSync(out)) continue;
      parts.push({ text: `Image = page ${p}` });
      parts.push({ inline_data: { mime_type: 'image/png', data: (await sharp(out).resize({ width: 900, withoutEnlargement: true }).png().toBuffer()).toString('base64') } });
      ok.push(p);
    }
    if (!ok.length) continue;
    parts.push({ text: `These are pages of the ${g.make} ${g.model} manufacturer emergency response guide. Sort each page into the ISO 17840-3
section it belongs to: identify (identification / recognising the vehicle), disable (immobilise, stabilise, lift, disable
direct hazards, shut down the high-voltage system), cut (access to occupants, cut zones, extrication), battery (stored energy:
high-voltage battery, fluids, gases), fire (in case of fire), water (in case of submersion), tow (towing, transport, storage),
or none (cover, contents, legal, glossary, anything else). Use the page labels.` });
    const a = await gemini(parts, { type: 'OBJECT', required: ['pages'], properties: { pages: { type: 'ARRAY', items: { type: 'OBJECT', required: ['page', 'section'], properties: { page: { type: 'INTEGER' }, section: { type: 'STRING', enum: [...SECTIONS, 'none'] } } } } } });
    for (const x of a.pages ?? []) if (ok.includes(x.page) && x.section !== 'none') label[x.page] = x.section;
  }
  const out = {};
  for (const s of SECTIONS) {
    const ps = Object.entries(label).filter(([, v]) => v === s).map(([p]) => Number(p)).sort((a, b) => a - b).slice(0, KEEP[s]);
    if (ps.length) out[s] = ps;
  }
  return out;
}

/** WebP per page, 300 dpi (iPad) + 200 dpi (iPhone) — same as the rescue sheets. */
async function render(pdf, id, sec, pages, tmp) {
  const sets = { 200: { pages: [], bytes: 0 }, 300: { pages: [], bytes: 0 } };
  for (const n of pages) {
    const png = `${tmp}/hi${n}.png`;
    if (!existsSync(png)) gs(['-sDEVICE=png16m', '-r300', `-dFirstPage=${n}`, `-dLastPage=${n}`, '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${png}`, pdf]);
    if (!existsSync(png)) continue;
    const meta = await sharp(png).metadata();
    for (const [dpi, scale] of [[300, 1], [200, 2 / 3]]) {
      const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
      const buf = await sharp(png).resize(w, h).flatten({ background: '#ffffff' }).webp({ quality: 80, effort: 6 }).toBuffer();
      const file = `img/${id}/${sec}/${dpi}/p${n}.webp`;
      mkdirSync(`out/img/${id}/${sec}/${dpi}`, { recursive: true });
      writeFileSync(`out/${file}`, buf);
      sets[dpi].pages.push({ file, w, h, bytes: buf.length });
      sets[dpi].bytes += buf.length;
    }
  }
  return sets;
}

let n = 0;
const failed = [];
for (const g of todo) {
  n++;
  if (done[g.key]?.src === g.sha256) continue;
  const label = `${g.make} ${g.model} ${g.years ?? ''}`.trim();
  const tmp = `out/tmp-sec/${n}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const pdf = await pdfOf(g, tmp);
    const pages = readText(pdf, tmp);
    let found = byHeadings(pages), method = 'headings';
    if (Object.keys(found).length < 4) { found = await byGemini(g, pdf, pages.length, tmp); method = 'gemini'; }
    const id = `sec-${g.sha256.slice(0, 32)}`;
    rmSync(`out/img/${id}`, { recursive: true, force: true });
    const sections = {};
    for (const [s, ps] of Object.entries(found)) { const sets = await render(pdf, id, s, ps, tmp); if (sets['200'].pages.length) sections[s] = { pages: ps, sets }; }
    done[g.key] = { src: g.sha256, label, method, total: pages.length, sections };
    console.log(`  ${label}: ${method} · ${SECTIONS.filter((s) => sections[s]).map((s) => `${s} p.${sections[s].pages.join('-')}`).join(' · ') || 'nothing found'}`);
  } catch (e) { failed.push(`${label}: ${String(e.message).slice(0, 100)}`); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  if (n % 10 === 0) { console.log(`${n}/${todo.length}`); writeFileSync(OUT, JSON.stringify(done, null, 1)); }
}
writeFileSync(OUT, JSON.stringify(done, null, 1));

// ---- review page: per guide, each section's page(s); click to drop a wrong one ----
const approved = existsSync('out/sections-approved.json') ? JSON.parse(readFileSync('out/sections-approved.json', 'utf8')) : null;
const NAME = { disable: 'Disable', cut: 'Cut (access)', fire: 'Fire', water: 'Water', battery: 'Battery', tow: 'Tow', identify: 'ID check' };
const ORDER = ['disable', 'cut', 'fire', 'water', 'battery', 'tow', 'identify'];
const rows = Object.entries(done).filter(([, d]) => Object.keys(d.sections ?? {}).length).sort((a, b) => a[1].label.localeCompare(b[1].label))
  .map(([k, d]) => [k, { label: d.label, method: d.method, secs: ORDER.filter((s) => d.sections[s]).map((s) => [s, d.sections[s].pages, d.sections[s].sets['200'].pages.map((p) => p.file)]) }]);
writeFileSync('out/sections-review.html', `<!doctype html><meta charset="utf-8"><title>Approve guide sections</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}h2{font-size:18px;margin:26px 0 4px}.s{display:inline-block;vertical-align:top;margin:4px 10px 4px 0}
.s b{display:block;color:#ffd60a;margin-bottom:3px}.pg{display:inline-block;margin:2px;border:4px solid #2ecc40;border-radius:6px;cursor:pointer;background:#fff}.pg.off{border-color:#555;opacity:.3}
.pg img{height:190px;display:block}.q{color:#999;font-size:13px}#bar{position:sticky;top:0;background:#111;padding:10px 0;z-index:2}button{font:15px system-ui;padding:6px 12px}</style>
<div id="bar"><button onclick="save()">Save approvals</button> Green = shown on that tab. Click a page that isn't that section to drop it. Move sections-approved.json into out\\, then npm run publish:extras.</div><div id="l"></div>
<script>const R=${JSON.stringify(rows)},N=${JSON.stringify(NAME)};
const A=${JSON.stringify(approved)}||Object.fromEntries(R.map(([k,d])=>[k,Object.fromEntries(d.secs.map(([s,p])=>[s,p.slice()]))]));const l=document.getElementById('l');
for(const [k,d] of R){const h=document.createElement('h2');h.textContent=d.label;l.appendChild(h);const q=document.createElement('div');q.className='q';q.textContent=d.method==='headings'?'found by ISO headings':'sorted by Gemini';l.appendChild(q);
for(const [s,pages,files] of d.secs){const box=document.createElement('div');box.className='s';box.innerHTML='<b>'+N[s]+'</b>';
pages.forEach((p,i)=>{const e=document.createElement('div');const on=(A[k]?.[s]||[]).includes(p);e.className='pg'+(on?'':' off');e.title='page '+p;e.innerHTML='<img loading=lazy src="'+files[i]+'">';
e.onclick=()=>{A[k]=A[k]||{};const st=new Set(A[k][s]||[]);st.has(p)?st.delete(p):st.add(p);A[k][s]=pages.filter(x=>st.has(x));e.className='pg'+(st.has(p)?'':' off');};box.appendChild(e);});l.appendChild(box);}}
function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(A,null,1)]));a.download='sections-approved.json';a.click();}</script>`);

const all = Object.values(done);
console.log(`\nSorted ${all.length} guides: ${all.filter((d) => d.method === 'headings').length} by ISO headings, ${all.filter((d) => d.method === 'gemini').length} by Gemini.`);
for (const s of ORDER) console.log(`  ${NAME[s]}: ${all.filter((d) => d.sections?.[s]).length}`);
console.log('Next: open out\\sections-review.html, drop wrong pages, Save approvals, move sections-approved.json into out\\, npm run publish:extras.');
if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.slice(0, 30).join('\n  ')}`);
