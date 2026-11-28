// Battery chemistry + body type for every model, read off the manufacturer's OWN sheet (never a guess).
//
//   $env:GEMINI_API_KEY = "..."      (same key as the app's server)
//   npm run battery:scan             -> out/battery-candidates.json + out/battery-review.html (open in Chrome)
//   tick each row that's right (fix the dropdowns if not), Save approvals, move battery-approved.json into out\
//   npm run publish                  -> phones get chemistry + Cars / SUVs / Trucks / Vans / Heavy
//
// Chemistry matters for the ERG guide: lithium-ion / sodium-ion = 147, NiMH = 171, lithium-metal = 138.
// Re-running is safe: models already read (same sheets) are skipped; your approvals are kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { photoKey } from '../../src/lib/match-core.ts';
import { loadGuides, PUBLIC_BASE } from './guides-source.mjs';
import { geminiJSON, QuotaError } from './gemini.mjs';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
if (!KEY) { console.error('Set GEMINI_API_KEY first (PowerShell: $env:GEMINI_API_KEY = "...").'); process.exit(1); }

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

const { guides, from } = await loadGuides();
const LOCAL = from === 'out/downloaded.json';
mkdirSync('out/tmp-battery', { recursive: true });
const CAND = 'out/battery-candidates.json';
const cand = existsSync(CAND) ? JSON.parse(readFileSync(CAND, 'utf8')) : {};

// One read per make + model + years, using every sheet for it (rescue sheet + full guide).
const usable = (x) => x.make && x.model && (LOCAL ? x.pdfFile && existsSync(x.pdfFile) : (x.file || x.images));
const groups = new Map();
for (const g of guides.filter(usable)) {
  const k = photoKey(g);
  if (!groups.has(k)) groups.set(k, { key: k, label: `${g.make} ${g.model} ${g.years}`.trim(), make: g.make, model: g.model, years: g.years, powertrain: g.powertrain, docs: [] });
  groups.get(k).docs.push(g);
}

// Words that mark the battery page of a long guide.
const CHEM_RE = /lithium|li-ion|li ion|nickel[- ]metal|ni-?mh|iron phosphate|\bLFP\b|\bNMC\b|\bNCA\b|sodium[- ]ion|high[- ]voltage battery|traction battery|HV battery/gi;

const render = (pdf, page, out, dpi = 120) => {
  const r = spawnSync(GS, ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=png16m', `-r${dpi}`, `-dFirstPage=${page}`, `-dLastPage=${page}`,
    '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${out}`, pdf], { timeout: 120_000 });
  return r.status === 0 && existsSync(out);
};
async function pdfOf(g, tmp) {
  if (LOCAL) return g.pdfFile;
  if (!g.file) return null;
  const res = await fetch(`${PUBLIC_BASE}/${g.file}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`PDF: HTTP ${res.status}`);
  const p = `${tmp}/${g.sha256.slice(0, 12)}.pdf`;
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}
/** Pages of the full guide that talk about the battery (by text), best first. */
function batteryPages(pdf, tmp) {
  const dir = `${tmp}/txt`; mkdirSync(dir, { recursive: true });
  spawnSync(GS, ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=txtwrite', `-sOutputFile=${dir}/t%d.txt`, pdf], { timeout: 180_000 });
  return readdirSync(dir).map((f) => ({ page: Number(f.match(/\d+/)[0]), hits: (readFileSync(join(dir, f), 'utf8').match(CHEM_RE) ?? []).length }))
    .filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits || a.page - b.page).slice(0, 2).map((x) => x.page);
}

/** Up to 5 page images: rescue sheet pages 1–2, then the full guide's battery pages (else its pages 1–2). */
async function pagesFor(gr, tmp) {
  const out = [];
  const rescue = gr.docs.find((d) => d.docType === 'rescue_sheet');
  const erg = gr.docs.find((d) => d.docType !== 'rescue_sheet');
  if (rescue) {
    if (!LOCAL && rescue.images) {
      for (const p of rescue.images['300'].pages.slice(0, 2)) {
        const res = await fetch(`${PUBLIC_BASE}/${p.file}`, { signal: AbortSignal.timeout(60000) });
        if (res.ok) out.push(await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1100 }).png().toBuffer());
      }
    } else {
      const pdf = await pdfOf(rescue, tmp);
      for (const n of [1, 2]) if (pdf && render(pdf, n, `${tmp}/r${n}.png`, 150)) out.push(await sharp(`${tmp}/r${n}.png`).resize({ width: 1100 }).png().toBuffer());
    }
  }
  if (erg) {
    const pdf = await pdfOf(erg, tmp);
    if (pdf) {
      let pages = batteryPages(pdf, tmp);
      if (!pages.length && !out.length) pages = [1, 2];
      for (const n of pages) if (render(pdf, n, `${tmp}/e${n}.png`)) out.push(await sharp(`${tmp}/e${n}.png`).resize({ width: 1100 }).png().toBuffer());
    }
  }
  return out.slice(0, 5);
}

const prompt = (gr) => `Vehicle: ${gr.make} ${gr.model} ${gr.years ?? ''} (${gr.powertrain || 'powertrain not listed'}).
These pages are from the manufacturer's own emergency response guide and/or rescue sheet.
1) The HIGH-VOLTAGE (traction) battery chemistry, ONLY as printed on these pages — never from your own knowledge.
   chemistry: "lithium-ion" (Li-ion, lithium-ion polymer, LFP / lithium iron phosphate, NMC, NCA all count),
   "nimh" (nickel-metal hydride), "sodium-ion", "lithium-metal", or "not-stated" if these pages don't say.
   chemistry_text = the exact printed words (max 12). chemistry_page = page number as sent (1-based).
   cell_type = LFP / NMC / NCA etc. ONLY if printed, else "".
   Ignore the 12 V battery (lead-acid / 12 V lithium) — traction battery only.
2) voltage_text = the high-voltage system/battery voltage as printed (e.g. "400 V", "up to 800 V"), else "".
3) body: "car" (sedan, hatchback, coupe, wagon), "suv" (SUV or crossover), "truck" (pickup), "van" (minivan,
   passenger or cargo van), "heavy" (bus, box truck, semi, refuse truck, any medium / heavy commercial vehicle).
   Use the vehicle drawings and the model name.`;

async function ask(gr, pngs) {
  const body = {
    contents: [{ role: 'user', parts: [...pngs.map((b) => ({ inline_data: { mime_type: 'image/png', data: b.toString('base64') } })), { text: prompt(gr) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT', required: ['chemistry', 'body'],
        properties: {
          chemistry: { type: 'STRING', enum: ['lithium-ion', 'nimh', 'sodium-ion', 'lithium-metal', 'not-stated'] },
          chemistry_text: { type: 'STRING' }, chemistry_page: { type: 'INTEGER' }, cell_type: { type: 'STRING' },
          voltage_text: { type: 'STRING' },
          body: { type: 'STRING', enum: ['car', 'suv', 'truck', 'van', 'heavy'] },
        },
      },
    },
  };
  return geminiJSON({ key: KEY, model: MODEL, parts: body.contents[0].parts, schema: body.generationConfig.responseSchema });
}

let n = 0;
const failed = [];
for (const [k, gr] of groups) {
  n++;
  const src = gr.docs.map((d) => d.sha256).sort().join(',');
  if (cand[k]?.src === src) continue;
  const tmp = `out/tmp-battery/${n}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const pngs = await pagesFor(gr, tmp);
    if (!pngs.length) throw new Error('no pages');
    const a = await ask(gr, pngs);
    cand[k] = {
      src, label: gr.label, make: gr.make, model: gr.model, powertrain: gr.powertrain || '',
      chem: a.chemistry, text: String(a.chemistry_text ?? '').slice(0, 100), page: a.chemistry_page ?? null,
      cell: String(a.cell_type ?? '').slice(0, 20), voltage: String(a.voltage_text ?? '').slice(0, 30), body: a.body,
    };
  } catch (e) {
    if (e instanceof QuotaError) { console.log(`\n⚠ ${e.message}`); rmSync(tmp, { recursive: true, force: true }); break; }
    failed.push(`${gr.label}: ${String(e.message).slice(0, 100)}`);
  }
  rmSync(tmp, { recursive: true, force: true });
  if (n % 20 === 0) { console.log(`${n}/${groups.size}`); writeFileSync(CAND, JSON.stringify(cand, null, 1)); }
}
writeFileSync(CAND, JSON.stringify(cand, null, 1));

// ---- review page: one row per model; tick what's right (fix the dropdowns first if not) ----
const approved = existsSync('out/battery-approved.json') ? JSON.parse(readFileSync('out/battery-approved.json', 'utf8')) : {};
const rows = Object.entries(cand).sort((a, b) => a[1].label.localeCompare(b[1].label));
writeFileSync('out/battery-review.html', `<!doctype html><meta charset="utf-8"><title>Approve battery chemistry + body type</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #333;text-align:left;vertical-align:top}
tr.on{background:#0f2a1a}select{font:14px system-ui;padding:3px}.q{color:#bbb;font-size:13px}.w{color:#ffd60a}input[type=checkbox]{transform:scale(1.5)}#bar{position:sticky;top:0;background:#111;padding:10px 0;z-index:2}button{font:15px system-ui;padding:6px 10px;margin-right:6px}</style>
<div id="bar"><button onclick="save()">Save approvals</button><button onclick="tickQuoted()">Tick every row that quotes the sheet</button>
 Check the chemistry against the printed words (yellow = sheet doesn't say). Fix a dropdown before ticking. Move battery-approved.json into out\\, then npm run publish.</div>
<table><thead><tr><th>OK</th><th>Model</th><th>Battery (as printed)</th><th>Voltage</th><th>Body</th></tr></thead><tbody id="t"></tbody></table>
<script>const R=${JSON.stringify(rows)},A=${JSON.stringify(approved)},t=document.getElementById('t');
const CH=['lithium-ion','nimh','sodium-ion','lithium-metal','not-stated'],BO=['car','suv','truck','van','heavy'];
const sel=(opts,v)=>'<select>'+opts.map(o=>'<option'+(o===v?' selected':'')+'>'+o+'</option>').join('')+'</select>';
const rowsEl={};
for(const [k,c] of R){const a=A[k]||c,tr=document.createElement('tr');rowsEl[k]=tr;if(A[k])tr.className='on';
tr.innerHTML='<td><input type=checkbox '+(A[k]?'checked':'')+'></td><td><b>'+c.label+'</b><div class=q>'+(c.powertrain||'')+'</div></td>'
+'<td>'+sel(CH,a.chem)+(a.chem==='not-stated'?' <span class=w>not stated</span>':'')+'<div class=q>'+(c.text?'"'+c.text+'"':'')+(c.page?' · p.'+c.page:'')+(c.cell?' · '+c.cell:'')+'</div></td>'
+'<td><input value="'+(a.voltage||'').replace(/"/g,'')+'" size=10></td><td>'+sel(BO,a.body)+'</td>';
const [cb]=tr.querySelectorAll('input[type=checkbox]'),[sc,sb]=tr.querySelectorAll('select'),vi=tr.querySelector('input:not([type])');
const put=()=>{if(cb.checked){A[k]={chem:sc.value,text:c.text,cell:c.cell,voltage:vi.value.trim(),body:sb.value};tr.className='on';}else{delete A[k];tr.className='';}};
cb.onchange=put;sc.onchange=sb.onchange=vi.oninput=()=>{if(cb.checked)put();};tr._tick=()=>{cb.checked=true;put();};tr._quoted=c.chem!=='not-stated'&&!!c.text;t.appendChild(tr);}
function tickQuoted(){for(const tr of Object.values(rowsEl))if(tr._quoted)tr._tick();}
function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(A,null,1)]));a.download='battery-approved.json';a.click();}</script>`);

const c = Object.values(cand);
const count = (f) => c.filter(f).length;
console.log(`\nRead ${c.length} models: ${count((x) => x.chem === 'lithium-ion')} lithium-ion, ${count((x) => x.chem === 'nimh')} NiMH, ${count((x) => x.chem === 'not-stated')} not stated.`);
console.log(`Body: ${['car', 'suv', 'truck', 'van', 'heavy'].map((b) => `${count((x) => x.body === b)} ${b}`).join(' · ')}`);
console.log('Next: open out\\battery-review.html, tick, Save approvals, move battery-approved.json into out\\, npm run publish.');
if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.slice(0, 30).join('\n  ')}`);
