// Break each rescue sheet down into the items a crew looks for — Cut loop, HV disconnect, 12V, No-cut — as boxes
// on the sheet's OWN picture. Runs on your PC. Nothing proposed here is shown on scene until you check it.
//
//   $env:GEMINI_API_KEY = "..."
//   npm run callouts:propose          # the 20 Test vehicles (add -- --all for every rescue sheet)
//       -> out/callouts-proposed.json, out/callouts-review.html
//   open out\callouts-review.html     # drag / resize boxes, fix labels, type your name, "Checked" per sheet, Save
//       -> move the downloaded callouts-approved.json into out\
//   $env:SUPABASE_URL=...; $env:SUPABASE_SERVICE_ROLE_KEY=...
//   npm run callouts:publish          # uploads packs/callouts/callouts.json — phones pick it up with signal
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fromBox2d, KINDS } from '../../src/lib/callouts-core.ts';
import { isTestMatch, TEST_VEHICLES } from '../../src/data/test-vehicles.ts';
import { PUBLIC_BASE } from './guides-source.mjs';

const cmd = process.argv[2];
const ALL = process.argv.includes('--all');
mkdirSync('out', { recursive: true });
const read = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

async function publishedSheets() {
  const r = await fetch(`${PUBLIC_BASE}/manifest.json?t=${Date.now()}`);
  if (!r.ok) throw new Error(`Couldn't read the published list: HTTP ${r.status}`);
  const m = await r.json();
  return m.guides.filter((g) => g.docType === 'rescue_sheet' && g.images?.['300']?.pages?.length)
    .filter((g) => ALL || TEST_VEHICLES.some((t) => isTestMatch(t, g)));
}

const PROMPT = `This is a vehicle manufacturer's rescue sheet (pages in order, page numbers 0-based as sent).
Find ONLY these items, where the sheet itself marks them (a label, symbol or callout on the drawing):
- cut_loop: first-responder cut loop / cut point for the 12V or HV control circuit
- hv_disconnect: high-voltage service disconnect / service plug / HV interlock
- lv_battery: 12V / low-voltage battery
- do_not_cut: areas the sheet marks as do-not-cut (HV cables, gas inflators, ultra-high-strength steel ...)
For each, give the page and box_2d = [ymin, xmin, ymax, xmax] on a 0-1000 scale around THAT item on the drawing
(not the legend), and note = the sheet's own words for it, max 8 words. If an item is not shown, leave it out.
Never guess a location the sheet doesn't show.`;

async function ask(key, model, pngs) {
  const body = {
    contents: [{ role: 'user', parts: [...pngs.map((b) => ({ inline_data: { mime_type: 'image/png', data: b.toString('base64') } })), { text: PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['items'], properties: { items: { type: 'ARRAY', items: {
      type: 'OBJECT', required: ['kind', 'page', 'box_2d'],
      properties: { kind: { type: 'STRING', enum: Object.keys(KINDS) }, page: { type: 'INTEGER' }, box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } }, note: { type: 'STRING' } },
    } } } } },
  };
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 5000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const out = await r.json();
    return JSON.parse((out?.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
  }
  throw new Error('Gemini busy — re-run later');
}

async function propose() {
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  if (!key) { console.error('Set GEMINI_API_KEY first.'); process.exit(1); }
  const sharp = (await import('sharp')).default;
  const sheets = await publishedSheets();
  const proposed = read('out/callouts-proposed.json', {});
  const approved = read('out/callouts-approved.json', {});
  let n = 0;
  for (const g of sheets) {
    n++;
    if (proposed[g.key]?.src === g.sha256 || approved[g.key]?.status === 'confirmed') continue;
    try {
      const pages = g.images['300'].pages.slice(0, 4);
      const pngs = [];
      for (const p of pages) {
        const res = await fetch(`${PUBLIC_BASE}/${p.file}`, { signal: AbortSignal.timeout(60000) });
        if (!res.ok) throw new Error(`page: HTTP ${res.status}`);
        pngs.push(await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1600, withoutEnlargement: true }).png().toBuffer());
      }
      const a = await ask(key, model, pngs);
      const boxes = (a.items ?? []).map((it) => {
        const b = fromBox2d(it.box_2d);
        return b && it.page >= 0 && it.page < pages.length && KINDS[it.kind] ? { kind: it.kind, page: it.page, ...b, note: String(it.note ?? '').slice(0, 60) } : null;
      }).filter(Boolean);
      proposed[g.key] = { guideKey: g.key, title: `${g.make} ${g.model} ${g.years}`, status: 'proposed', src: g.sha256,
        pages: pages.map((p) => ({ file: p.file, w: p.w, h: p.h })), boxes };
      console.log(`${n}/${sheets.length} ${g.make} ${g.model}: ${boxes.length} items`);
    } catch (e) { console.log(`${n}/${sheets.length} ${g.make} ${g.model}: FAILED ${String(e.message).slice(0, 100)}`); }
    writeFileSync('out/callouts-proposed.json', JSON.stringify(proposed, null, 1));
  }
  review();
}

function review() {
  const proposed = read('out/callouts-proposed.json', {});
  const approved = read('out/callouts-approved.json', {});
  // Your checked work always wins over a fresh proposal.
  const all = { ...proposed };
  for (const [k, v] of Object.entries(approved)) all[k] = { ...proposed[k], ...v };
  writeFileSync('out/callouts-review.html', `<!doctype html><meta charset="utf-8"><title>Check cut-sheet items</title>
<style>
body{font:16px system-ui;background:#111;color:#eee;margin:0}#bar{position:sticky;top:0;z-index:9;background:#000;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:2px solid #444}
input,select,button{font:inherit}button{padding:6px 14px;border-radius:8px;border:2px solid #888;background:#222;color:#fff;cursor:pointer}button.go{background:#2ecc40;color:#000;border-color:#2ecc40}
.sheet{padding:16px;border-bottom:4px solid #333}.sheet.ok{background:#0d1f12}.pages{display:flex;gap:12px;flex-wrap:wrap}.pg{position:relative;width:min(48vw,900px);background:#fff;user-select:none}
.pg img{width:100%;display:block;pointer-events:none}.bx{position:absolute;border:3px solid;box-sizing:border-box;cursor:move}.bx b{position:absolute;top:-24px;left:-3px;padding:1px 6px;font:bold 13px system-ui;color:#000;white-space:nowrap}
.bx i{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;background:inherit;border:2px solid #000;cursor:nwse-resize}
.items{margin:10px 0;display:grid;gap:6px}.it{display:flex;gap:8px;align-items:center}.it input{flex:1;min-width:200px}
.cut_loop{border-color:#ff3b30}.cut_loop b,.cut_loop i{background:#ff3b30}.hv_disconnect{border-color:#ff9500}.hv_disconnect b,.hv_disconnect i{background:#ff9500}
.lv_battery{border-color:#0a84ff}.lv_battery b,.lv_battery i{background:#0a84ff}.do_not_cut{border-color:#bf5af2}.do_not_cut b,.do_not_cut i{background:#bf5af2}
.m{color:#aaa}
</style>
<div id="bar"><b>Check every box against the sheet.</b> Your name: <input id="who" placeholder="e.g. Vince" size="12">
<button class="go" onclick="save()">Save checked work</button><span class="m">Drag a box to move, corner to resize. Drag on the sheet to draw a new box. Move the saved callouts-approved.json into out\\ then npm run callouts:publish.</span></div>
<div id="l"></div>
<script>
const K=${JSON.stringify(Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])))};
const D=${JSON.stringify(all)};const BASE=${JSON.stringify(PUBLIC_BASE)};
const who=document.getElementById('who');who.value=localStorage.getItem('who')||'';who.oninput=()=>localStorage.setItem('who',who.value);
function draw(){const l=document.getElementById('l');l.innerHTML='';
for(const [k,s] of Object.entries(D)){const d=document.createElement('div');d.className='sheet'+(s.status==='confirmed'?' ok':'');
d.innerHTML='<h2>'+s.title+'</h2><div class=m>'+(s.status==='confirmed'?'Checked by '+s.confirmedBy+' on '+s.confirmedAt.slice(0,10):'Proposed by the script — NOT checked')+'</div>';
const pages=document.createElement('div');pages.className='pages';
(s.pages||[]).forEach((p,pi)=>{const pg=document.createElement('div');pg.className='pg';pg.innerHTML='<img src="'+BASE+'/'+p.file+'">';
 s.boxes.forEach((b,bi)=>{if(b.page!==pi)return;const e=document.createElement('div');e.className='bx '+b.kind;place(e,b);e.innerHTML='<b>'+(bi+1)+' '+K[b.kind]+'</b><i></i>';
  e.onmousedown=ev=>{ev.stopPropagation();const r=pg.getBoundingClientRect(),sx=ev.clientX,sy=ev.clientY,o={...b},rs=ev.target.tagName==='I';
   onmousemove=m=>{const dx=(m.clientX-sx)/r.width,dy=(m.clientY-sy)/r.height;if(rs){b.w=Math.max(.01,Math.min(1-b.x,o.w+dx));b.h=Math.max(.01,Math.min(1-b.y,o.h+dy));}else{b.x=Math.max(0,Math.min(1-b.w,o.x+dx));b.y=Math.max(0,Math.min(1-b.h,o.y+dy));}place(e,b);unconfirm(s,d);};
   onmouseup=()=>{onmousemove=null;onmouseup=null;};};pg.appendChild(e);});
 pg.onmousedown=ev=>{const r=pg.getBoundingClientRect(),x0=(ev.clientX-r.left)/r.width,y0=(ev.clientY-r.top)/r.height;
  onmouseup=m=>{onmouseup=null;const x1=(m.clientX-r.left)/r.width,y1=(m.clientY-r.top)/r.height;if(Math.abs(x1-x0)<.01||Math.abs(y1-y0)<.01)return;
   s.boxes.push({kind:'cut_loop',page:pi,x:Math.min(x0,x1),y:Math.min(y0,y1),w:Math.abs(x1-x0),h:Math.abs(y1-y0),note:''});unconfirm(s);draw();};};
 pages.appendChild(pg);});
d.appendChild(pages);const it=document.createElement('div');it.className='items';
s.boxes.forEach((b,bi)=>{const row=document.createElement('div');row.className='it';
 row.innerHTML='<b>'+(bi+1)+'</b><select>'+Object.entries(K).map(([v,t])=>'<option value='+v+(v===b.kind?' selected':'')+'>'+t+'</option>').join('')+'</select><input placeholder="Sheet\\'s own words (max 8)" value="'+(b.note||'').replace(/"/g,'&quot;')+'"><button>Remove</button>';
 const [sel,inp,rm]=row.querySelectorAll('select,input,button');sel.onchange=()=>{b.kind=sel.value;unconfirm(s);draw();};inp.oninput=()=>{b.note=inp.value;unconfirm(s,d);};rm.onclick=()=>{s.boxes.splice(bi,1);unconfirm(s);draw();};it.appendChild(row);});
d.appendChild(it);
const ok=document.createElement('button');ok.className=s.status==='confirmed'?'':'go';ok.textContent=s.status==='confirmed'?'Checked ✓ (click to undo)':'Checked — every box matches the sheet';
ok.onclick=()=>{if(s.status==='confirmed'){unconfirm(s);}else{if(!who.value.trim())return alert('Type your name first.');if(!s.boxes.length&&!confirm('No items on this sheet — mark checked anyway?'))return;s.status='confirmed';s.confirmedBy=who.value.trim();s.confirmedAt=new Date().toISOString();}draw();};
d.appendChild(ok);l.appendChild(d);}}
function place(e,b){e.style.left=b.x*100+'%';e.style.top=b.y*100+'%';e.style.width=b.w*100+'%';e.style.height=b.h*100+'%';}
function unconfirm(s,d){if(s.status==='confirmed'){s.status='proposed';delete s.confirmedBy;delete s.confirmedAt;if(d)d.className='sheet';else draw();}}
function save(){const out={};for(const [k,s] of Object.entries(D))out[k]=s;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)]));a.download='callouts-approved.json';a.click();}
draw();
</script>`);
  console.log(`Review page: out\\callouts-review.html (${Object.keys(all).length} sheets, ${Object.values(all).filter((s) => s.status === 'confirmed').length} checked).`);
}

async function publish() {
  const URL_ = (process.env.SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '');
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
  const approved = read('out/callouts-approved.json', null);
  if (!approved) { console.error('No out\\callouts-approved.json yet — check sheets in callouts-review.html and Save first.'); process.exit(1); }
  const sheets = {};
  for (const [k, s] of Object.entries(approved)) {
    // Only checked sheets carry boxes to the phone; unchecked ones ship as "waiting" for the Test list.
    sheets[k] = s.status === 'confirmed' && s.confirmedBy
      ? { guideKey: k, title: s.title, status: 'confirmed', confirmedBy: s.confirmedBy, confirmedAt: s.confirmedAt, boxes: s.boxes }
      : { guideKey: k, title: s.title, status: 'proposed', boxes: [] };
  }
  const now = new Date();
  const file = { version: now.toISOString().slice(0, 16), sheets };
  const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const res = await fetch(`${URL_}/storage/v1/object/packs/callouts/callouts.json`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=60' }, body: JSON.stringify(file),
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const n = Object.values(sheets).filter((s) => s.status === 'confirmed').length;
  console.log(`Published ${n} checked sheet(s), ${Object.keys(sheets).length - n} waiting. Phones pick it up next time they have signal.`);
}

if (cmd === 'propose') await propose();
else if (cmd === 'review') review();
else if (cmd === 'publish') await publish();
else console.log('Use: npm run callouts:propose | callouts:review | callouts:publish');
