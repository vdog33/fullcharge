// Cut sheets that live INSIDE a full emergency response guide (E-ONE Vector, Nissan Leaf, buses, work trucks…).
// 88+ models have no separate rescue sheet on NHTSA, so the app showed nothing on their Cut tab. This finds the
// page(s) in each guide that ARE the cut sheet — the drawing of the vehicle with HV parts, cables, batteries,
// airbags, cut zones / loops, disconnects — and turns them into a normal cut sheet (same images as a rescue sheet).
//
//   $env:GEMINI_API_KEY = "..."
//   npm run erg:cutsheets        -> out/erg-cut.json + out/img/cut-*/ + out/erg-cut-review.html (open in Chrome)
//   untick any page that isn't a cut sheet, Save approvals, move erg-cut-approved.json into out\
//   npm run publish              -> phones get them as cut sheets ("from the manufacturer's guide, p. N")
//
// Safe to re-run: guides already done are skipped; your approvals are kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { photoKey } from '../../src/lib/match-core.ts';
import { loadGuides, PUBLIC_BASE } from './guides-source.mjs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
if (!KEY) { console.error('Set GEMINI_API_KEY first (PowerShell: $env:GEMINI_API_KEY = "...").'); process.exit(1); }
const ONLY = process.argv.slice(2).join(' ').toLowerCase(); // e.g. npm run erg:cutsheets -- e-one

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

const { guides, from } = await loadGuides();
const LOCAL = from === 'out/downloaded.json';
mkdirSync('out/tmp-cut', { recursive: true });
const OUT = 'out/erg-cut.json';
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

// Models (make + model + years) with NO rescue sheet but a full guide → find the cut pages in that guide.
const groups = new Map();
for (const g of guides) {
  if (!g.make || !g.model || !g.sha256) continue;
  const k = photoKey(g);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(g);
}
const todo = [];
for (const gs_ of groups.values()) {
  if (gs_.some((g) => g.docType === 'rescue_sheet')) continue;
  for (const g of gs_.filter((x) => x.docType !== 'rescue_sheet')) {
    if (LOCAL ? !(g.pdfFile && existsSync(g.pdfFile)) : !g.file) continue;
    if (ONLY && !`${g.make} ${g.model}`.toLowerCase().includes(ONLY)) continue;
    todo.push(g);
  }
}
console.log(`${todo.length} guides for models with no separate rescue sheet${ONLY ? ` matching "${ONLY}"` : ''}.`);
if (!todo.length) console.log(LOCAL ? '  (none found: check out\\downloaded.json lists it and its PDF is in out\\pdfs)' : '  (using the published list)');
// A re-run redoes models that found nothing last time (the search got wider), not ones already found.
for (const k of Object.keys(done)) if (!done[k].pages?.length) delete done[k];

// Words on a cut-sheet / rescue-diagram page.
const CUT_RE = /\bcut\b|do not cut|cut zone|cut loop|cutting|rescue sheet|high[- ]voltage (component|cable|battery|wiring)|HV (component|cable|battery)|component location|disconnect|service plug|airbag|inflator|reinforce|ultra[- ]high[- ]strength|12 ?v battery/gi;

async function pdfOf(g, tmp) {
  if (LOCAL) return g.pdfFile;
  const res = await fetch(`${PUBLIC_BASE}/${g.file}`, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`PDF: HTTP ${res.status}`);
  const p = `${tmp}/doc.pdf`;
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

/** Pages to look at. Up to 60 pages: all of them (drawings are often pictures with no searchable words).
 *  Longer guides: pages with cut words + picture-heavy pages (few words), max 36. */
function candidatePages(pdf, tmp) {
  const dir = `${tmp}/txt`; mkdirSync(dir, { recursive: true });
  gs(['-sDEVICE=txtwrite', `-sOutputFile=${dir}/t%d.txt`, pdf]);
  let pages = readdirSync(dir).map((f) => {
    const t = readFileSync(join(dir, f), 'utf8');
    const words = (t.match(/[A-Za-z]{3,}/g) ?? []).length;
    return { page: Number(f.match(/\d+/)[0]), hits: (t.match(CUT_RE) ?? []).length, words };
  });
  if (!pages.length) { // no text layer at all: count pages instead
    const r = spawnSync(GS, ['-q', '-dNODISPLAY', '-dNOSAFER', '-c', `(${pdf.replace(/\\/g, '/')}) (r) file runpdfbegin pdfpagecount = quit`], { encoding: 'utf8', timeout: 60_000 });
    const n = parseInt(String(r.stdout).trim(), 10) || 0;
    pages = Array.from({ length: n }, (_, i) => ({ page: i + 1, hits: 0, words: 0 }));
  }
  if (pages.length <= 60) return { total: pages.length, pages: pages.map((p) => p.page).sort((a, b) => a - b) };
  const score = (p) => p.hits * 3 + (p.words < 120 ? 4 : 0) - Math.max(0, p.words - 250) / 60;
  return { total: pages.length, pages: pages.filter((p) => p.hits > 0 || p.words < 120).sort((a, b) => score(b) - score(a)).slice(0, 36).map((p) => p.page).sort((a, b) => a - b) };
}

async function pick(g, imgs, pages) {
  const parts = [];
  imgs.forEach((b, i) => { parts.push({ text: `Image ${i + 1} = page ${pages[i]}` }); parts.push({ inline_data: { mime_type: 'image/png', data: b.toString('base64') } }); });
  parts.push({ text: `These pages are from the ${g.make} ${g.model} manufacturer's emergency response guide.
Which pages are the vehicle's CUT SHEET / RESCUE DIAGRAM: a drawing or photo of THIS vehicle showing WHERE things are —
high-voltage battery, orange HV cables, HV components, disconnects / service plugs / cut loops, 12 V battery, airbags or
inflators, reinforced or no-cut zones? Not a page of text instructions, not a cover page, not a generic symbol legend alone.
Return up to 3 page numbers (the "page N" labels), best first. Return an empty list if none of these pages is such a diagram.` });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['pages'], properties: { pages: { type: 'ARRAY', items: { type: 'INTEGER' } }, why: { type: 'STRING' } } } },
  };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 5000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const out = await r.json();
    const a = JSON.parse((out?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
    return { pages: (a.pages ?? []).filter((p) => pages.includes(p)).slice(0, 3), why: String(a.why ?? '').slice(0, 160) };
  }
  throw new Error('Gemini busy — re-run later');
}

/** Same output as compress.mjs makes for a rescue sheet: WebP per page, 300 dpi (iPad) + 200 dpi (iPhone). */
async function renderSets(pdf, pages, id, tmp) {
  const sets = { 200: { pages: [], bytes: 0 }, 300: { pages: [], bytes: 0 } };
  for (const [i, n] of pages.entries()) {
    const png = `${tmp}/hi${n}.png`;
    gs(['-sDEVICE=png16m', '-r300', `-dFirstPage=${n}`, `-dLastPage=${n}`, '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${png}`, pdf]);
    if (!existsSync(png)) throw new Error(`could not render page ${n}`);
    const meta = await sharp(png).metadata();
    for (const [dpi, scale] of [[300, 1], [200, 2 / 3]]) {
      const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
      const buf = await sharp(png).resize(w, h).flatten({ background: '#ffffff' }).webp({ quality: 80, effort: 6 }).toBuffer();
      const file = `img/${id}/${dpi}/p${i + 1}.webp`;
      mkdirSync(`out/img/${id}/${dpi}`, { recursive: true });
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
  const tmp = `out/tmp-cut/${n}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const label = `${g.make} ${g.model} ${g.years ?? ''}`.trim();
  try {
    const pdf = await pdfOf(g, tmp);
    const { total, pages: cands } = candidatePages(pdf, tmp);
    console.log(`  ${label}: ${total} pages, looking at ${cands.length}`);
    if (!cands.length) { done[g.key] = { src: g.sha256, label, pages: [], why: `could not read the guide (${total} pages)` }; continue; }
    // Look in batches of 12 pages; keep every page Gemini calls a cut sheet (max 4).
    const found = [], whys = [];
    for (let b = 0; b < cands.length; b += 12) {
      const batch = cands.slice(b, b + 12), imgs = [], ok = [];
      for (const p of batch) {
        const out = `${tmp}/lo${p}.png`;
        gs(['-sDEVICE=png16m', '-r100', `-dFirstPage=${p}`, `-dLastPage=${p}`, '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${out}`, pdf]);
        if (existsSync(out)) { imgs.push(await sharp(out).resize({ width: 1100, withoutEnlargement: true }).png().toBuffer()); ok.push(p); }
      }
      if (!imgs.length) continue;
      const a = await pick(g, imgs, ok);
      found.push(...a.pages); if (a.why) whys.push(a.why);
    }
    const a = { pages: [...new Set(found)].sort((x, y) => x - y).slice(0, 4), why: whys.join(' / ').slice(0, 200) };
    if (!a.pages.length) { console.log(`    none found — ${a.why || 'no diagram page'}`); done[g.key] = { src: g.sha256, label, pages: [], why: a.why || 'no diagram page found' }; continue; }
    const id = `cut-${g.sha256.slice(0, 32)}`;
    rmSync(`out/img/${id}`, { recursive: true, force: true });
    const sets = await renderSets(pdf, a.pages, id, tmp);
    done[g.key] = { src: g.sha256, label, make: g.make, model: g.model, pages: a.pages, why: a.why, id, sets };
    console.log(`  ${label}: page ${a.pages.join(', ')}`);
  } catch (e) { failed.push(`${label}: ${String(e.message).slice(0, 100)}`); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
  if (n % 10 === 0) { console.log(`${n}/${todo.length}`); writeFileSync(OUT, JSON.stringify(done, null, 1)); }
}
writeFileSync(OUT, JSON.stringify(done, null, 1));

// ---- review page: each found page with a tick (pre-ticked); untick any that isn't the cut sheet ----
const approved = existsSync('out/erg-cut-approved.json') ? JSON.parse(readFileSync('out/erg-cut-approved.json', 'utf8')) : null;
const rows = Object.entries(done).filter(([, d]) => d.pages?.length).sort((a, b) => a[1].label.localeCompare(b[1].label));
const none = Object.values(done).filter((d) => !d.pages?.length).map((d) => `${d.label} — ${d.why}`).sort();
writeFileSync('out/erg-cut-review.html', `<!doctype html><meta charset="utf-8"><title>Approve cut sheets found inside guides</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}h2{font-size:18px;margin:26px 0 6px}.pg{display:inline-block;margin:6px;border:4px solid #2ecc40;border-radius:8px;cursor:pointer;vertical-align:top;background:#fff}
.pg.off{border-color:#555;opacity:.35}.pg img{height:300px;display:block}.pg div{background:#111;color:#eee;padding:4px 8px}.q{color:#aaa;font-size:13px}#bar{position:sticky;top:0;background:#111;padding:10px 0;z-index:2}button{font:15px system-ui;padding:6px 12px}</style>
<div id="bar"><button onclick="save()">Save approvals</button> Green = goes in the app as this vehicle's cut sheet. Click a page to drop it (grey). Move erg-cut-approved.json into out\\, then npm run publish.</div><div id="l"></div>
<details style="margin-top:30px"><summary>${none.length} guides with no cut-sheet page found</summary><pre class="q">${none.join('\n').replace(/</g, '&lt;')}</pre></details>
<script>const R=${JSON.stringify(rows.map(([k, d]) => [k, { label: d.label, why: d.why, pages: d.pages, files: d.sets['200'].pages.map((p) => p.file) }]))};
const A=${JSON.stringify(approved)}||Object.fromEntries(R.map(([k,d])=>[k,d.pages.slice()]));const l=document.getElementById('l');
for(const [k,d] of R){const h=document.createElement('h2');h.textContent=d.label;l.appendChild(h);const q=document.createElement('div');q.className='q';q.textContent=d.why||'';l.appendChild(q);
d.pages.forEach((p,i)=>{const e=document.createElement('div');e.className='pg'+((A[k]||[]).includes(p)?'':' off');e.innerHTML='<img src="'+d.files[i]+'"><div>Page '+p+' of the guide</div>';
e.onclick=()=>{const s=new Set(A[k]||[]);s.has(p)?s.delete(p):s.add(p);A[k]=d.pages.filter(x=>s.has(x));e.className='pg'+(s.has(p)?'':' off');};l.appendChild(e);});}
function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(A,null,1)]));a.download='erg-cut-approved.json';a.click();}</script>`);

console.log(`\nFound cut-sheet pages for ${rows.length} guides; none for ${none.length}.`);
console.log('Next: open out\\erg-cut-review.html, drop any wrong page, Save approvals, move erg-cut-approved.json into out\\, npm run publish.');
if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.slice(0, 30).join('\n  ')}`);
