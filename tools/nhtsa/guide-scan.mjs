// Read every manufacturer guide's first pages once, on the PC:
//   1) the car picture on the cover / intro page (e.g. the Acura MDX photo) → cropped, offered as that model's ID photo
//   2) phone numbers printed there (e.g. "Acura Client Relations (800) 382-2238") → offered for the Contacts tab
// Nothing ships until you approve it: crops go into photos-review.html (npm run photos:find), numbers into
// out/contacts-review.html.
//
//   $env:GEMINI_API_KEY = "..."      (same key the app's server uses)
//   npm run guide:scan               -> out/guide-pics/, out/guide-pics.json, out/contacts-candidates.json, out/contacts-review.html
//
// Safe to re-run: guides already scanned are skipped.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { photoKey } from '../../src/lib/match-core.ts';

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

const { guides } = JSON.parse(readFileSync('out/downloaded.json', 'utf8'));
['out/guide-pics', 'out/tmp-scan'].forEach((d) => mkdirSync(d, { recursive: true }));
const pics = existsSync('out/guide-pics.json') ? JSON.parse(readFileSync('out/guide-pics.json', 'utf8')) : {};
const contacts = existsSync('out/contacts-candidates.json') ? JSON.parse(readFileSync('out/contacts-candidates.json', 'utf8')) : {};

// One scan per make + model + years: prefer the full ERG (cover photo), else the rescue sheet.
const groups = new Map();
for (const g of guides.filter((x) => x.make && x.model && x.pdfFile && existsSync(x.pdfFile))) {
  const k = photoKey(g);
  const cur = groups.get(k);
  if (!cur || (cur.docType === 'rescue_sheet' && g.docType !== 'rescue_sheet')) groups.set(k, g);
}

const PROMPT = `These are the first pages of a vehicle manufacturer's emergency response guide or rescue sheet.
1) Find the single best picture of the WHOLE vehicle for identifying it at a scene: a photo or realistic colour rendering
   (like a press photo of the car), not a line drawing, diagram, logo or icon. Give the page number (1-based, as sent)
   and box_2d = [ymin, xmin, ymax, xmax] on 0-1000 scale, tight around the vehicle only (no text).
   kind = "photo" for a photo / realistic rendering, "drawing" if only line drawings exist, "none" if no vehicle picture.
3) The model years this document says it covers, from its title (e.g. "EQS Model 297 sedan as of 2021" → from 2021, to null;
   "2017–20 Acura MDX" → 2017 to 2020). years_from / years_to as 4-digit years; years_to null if open-ended; omit both if not stated.
   years_text = the exact words you read them from.
2) List EVERY phone number printed on these pages, exactly as printed, with the name it belongs to (e.g. "Acura Client Relations")
   and a short note of what it is for (max 8 words). Don't invent numbers.`;

async function ask(pngs) {
  const body = {
    contents: [{ role: 'user', parts: [...pngs.map((b) => ({ inline_data: { mime_type: 'image/png', data: b.toString('base64') } })), { text: PROMPT }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT', required: ['kind', 'phones'],
        properties: {
          kind: { type: 'STRING', enum: ['photo', 'drawing', 'none'] }, page: { type: 'INTEGER' },
          years_from: { type: 'INTEGER' }, years_to: { type: 'INTEGER' }, years_text: { type: 'STRING' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
          phones: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, phone: { type: 'STRING' }, note: { type: 'STRING' }, page: { type: 'INTEGER' } }, required: ['name', 'phone'] } },
        },
      },
    },
  };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 4000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const out = await r.json();
    const text = (out?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('');
    return JSON.parse(text);
  }
  throw new Error('Gemini busy — re-run later');
}

let n = 0, made = 0;
const failed = [];
for (const [k, g] of groups) {
  n++;
  if (pics[k]?.src === g.sha256 && contacts[k]) continue;
  const tmp = `out/tmp-scan/${g.sha256}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  try {
    const r = spawnSync(GS, ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-sDEVICE=png16m', '-r150', '-dFirstPage=1', '-dLastPage=2',
      '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${tmp}/p%d.png`, g.pdfFile], { timeout: 120_000 });
    if (r.status !== 0) throw new Error('Ghostscript could not render');
    const files = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
    // Smaller copies for Gemini (it doesn't need 150 dpi to find the car); crop from the full render.
    const small = await Promise.all(files.map((f) => sharp(join(tmp, f)).resize({ width: 900 }).png().toBuffer()));
    const a = await ask(small);
    const label = `${g.make} ${g.model} ${g.years}`;
    contacts[k] = { label, phones: (a.phones ?? []).filter((p) => /\d{3}.*\d{4}/.test(p.phone)).slice(0, 6) };
    // Years the sheet says it covers (NHTSA files many under their newest year only: EQS "2026" is really 2021+).
    if (a.years_from >= 1990 && a.years_from <= 2100) contacts[k].years = { from: a.years_from, to: a.years_to || null, text: String(a.years_text ?? '').slice(0, 80), listed: g.years };
    if (a.kind !== 'none' && a.page >= 1 && a.page <= files.length && a.box_2d?.length === 4) {
      const src = join(tmp, files[a.page - 1]);
      const meta = await sharp(src).metadata();
      const [y0, x0, y1, x1] = a.box_2d.map((v) => Math.max(0, Math.min(1000, v)) / 1000);
      const pad = 0.02;
      const left = Math.max(0, Math.round((x0 - pad) * meta.width)), top = Math.max(0, Math.round((y0 - pad) * meta.height));
      const width = Math.min(meta.width - left, Math.round((x1 - x0 + 2 * pad) * meta.width));
      const height = Math.min(meta.height - top, Math.round((y1 - y0 + 2 * pad) * meta.height));
      if (width > 120 && height > 80) {
        const file = `guide-pics/${g.sha256.slice(0, 24)}.jpg`;
        await sharp(src).extract({ left, top, width, height }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toFile(`out/${file}`);
        pics[k] = { file, kind: a.kind, page: a.page, src: g.sha256, label, docType: g.docType };
        made++;
      }
    } else pics[k] = { kind: 'none', src: g.sha256, label };
  } catch (e) { failed.push(`${g.make} ${g.model}: ${String(e.message).slice(0, 100)}`); }
  rmSync(tmp, { recursive: true, force: true });
  if (n % 20 === 0) {
    console.log(`${n}/${groups.size} (${made} pictures)`);
    writeFileSync('out/guide-pics.json', JSON.stringify(pics, null, 1));
    writeFileSync('out/contacts-candidates.json', JSON.stringify(contacts, null, 1));
  }
}
writeFileSync('out/guide-pics.json', JSON.stringify(pics, null, 1));
writeFileSync('out/contacts-candidates.json', JSON.stringify(contacts, null, 1));

// ---- contacts review page ----
const approved = existsSync('out/contacts-approved.json') ? JSON.parse(readFileSync('out/contacts-approved.json', 'utf8')) : {};
writeFileSync('out/contacts-review.html', `<!doctype html><meta charset="utf-8"><title>Approve contact numbers</title>
<style>body{font:16px system-ui;background:#111;color:#eee;margin:20px}h2{font-size:17px;margin:22px 0 6px}label{display:block;padding:8px;border:2px solid #444;border-radius:8px;margin:4px 0;cursor:pointer}
label.on{border-color:#2ecc40}input{transform:scale(1.4);margin-right:10px}#bar{position:sticky;top:0;background:#111;padding:10px 0;z-index:2}.m{color:#aaa}</style>
<div id="bar"><button onclick="save()">Save approvals</button> — tick the YEARS the sheet really covers, and only numbers a responder should call (emergency / technical / client line). Move the saved contacts-approved.json into out\\, then npm run publish.</div><div id="l"></div>
<script>const G=${JSON.stringify(contacts)},A=${JSON.stringify(approved)},l=document.getElementById('l');
const Y=A.__years||(A.__years={});
for(const [k,g] of Object.entries(G)){if(!g.phones.length&&!g.years)continue;const h=document.createElement('h2');h.textContent=g.label;l.appendChild(h);
if(g.years){const y=g.years,lb=document.createElement('label');const on=!!Y[k];if(on)lb.className='on';
lb.innerHTML='<input type=checkbox '+(on?'checked':'')+'><b>Years: '+y.from+'–'+(y.to||'present')+'</b> <span class=m>sheet says "'+y.text+'" · NHTSA lists '+(y.listed||'?')+'</span>';
lb.querySelector('input').onchange=e=>{if(e.target.checked)Y[k]={from:y.from,to:y.to};else delete Y[k];lb.className=e.target.checked?'on':'';};l.appendChild(lb);}
for(const p of g.phones){const lb=document.createElement('label');const on=(A[k]||[]).some(x=>x.phone===p.phone);if(on)lb.className='on';
lb.innerHTML='<input type=checkbox '+(on?'checked':'')+'><b>'+p.name+'</b> '+p.phone+' <span class=m>'+(p.note||'')+(p.page?' · p.'+p.page:'')+'</span>';
lb.querySelector('input').onchange=e=>{A[k]=(A[k]||[]).filter(x=>x.phone!==p.phone);if(e.target.checked)A[k].push({name:p.name,phone:p.phone,note:p.note||''});lb.className=e.target.checked?'on':'';};
l.appendChild(lb);}}
function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(A,null,1)]));a.download='contacts-approved.json';a.click();}</script>`);

const photos = Object.values(pics).filter((p) => p.kind === 'photo').length;
console.log(`\nScanned ${groups.size} models: ${photos} cover photos, ${Object.values(pics).filter((p) => p.kind === 'drawing').length} drawings only.`);
console.log(`Phone numbers found for ${Object.values(contacts).filter((c) => c.phones.length).length} models → open out\\contacts-review.html.`);
console.log('Next: npm run photos:find — the guide pictures show first on the review page.');
if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.slice(0, 30).join('\n  ')}`);
