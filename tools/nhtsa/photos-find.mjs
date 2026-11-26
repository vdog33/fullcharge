// Vehicle photos, step 1 — find candidate photos for every make + model + years in the cut-sheet list,
// and write a review page. YOU pick the right photo for each (or none). Nothing ships until you approve it.
//
//   npm run photos:find            -> out/photos-candidates.json + out/photos-review.html (open it in Chrome)
//
// Source: Wikimedia Commons (free-licence photos, credit kept). Only candidates — you check each one is the right
// model AND generation. Your own photos (or ones you have rights to) go in out/photos-manual/ — see README.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { photoKey } from '../../src/lib/match-core.ts';

const src = existsSync('out/downloaded.json') ? 'out/downloaded.json' : 'out/guides.json';
const { guides } = JSON.parse(readFileSync(src, 'utf8'));
mkdirSync('out/photos-manual', { recursive: true });

// One group per make + model + years.
const groups = new Map();
for (const g of guides) {
  if (!g.make || !g.model) continue;
  const k = photoKey(g);
  if (!groups.has(k)) groups.set(k, { key: k, make: g.make, model: g.model, years: g.years || '', yearFrom: g.yearFrom, yearTo: g.yearTo, powertrain: g.powertrain });
}
const prev = existsSync('out/photos-candidates.json') ? JSON.parse(readFileSync('out/photos-candidates.json', 'utf8')).groups : {};
const approved = existsSync('out/photos-approved.json') ? JSON.parse(readFileSync('out/photos-approved.json', 'utf8')) : {};

const UA = { 'User-Agent': 'FULLCHARGE/1.0 (first-responder app; vehicle reference photos; one-time review tool)' };
const strip = (h) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

async function commons(q) {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15' +
    `&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1200`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return Object.values((await r.json())?.query?.pages ?? {});
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return [];
}

async function candidates(gr) {
  const qs = [`${gr.make} ${gr.model} ${gr.yearFrom ?? ''}`.trim(), `${gr.make} ${gr.model}`];
  const want = tokens(gr.model);
  const seen = new Set(), out = [];
  for (const q of qs) {
    for (const p of await commons(q)) {
      const ii = p.imageinfo?.[0];
      if (!ii || seen.has(p.title) || !/image\/(jpeg|png|webp)/.test(ii.mime) || ii.width < 800) continue;
      const t = p.title.toLowerCase();
      // Title must name the model — cuts most of the "random car" results.
      if (!want.every((w) => t.includes(w))) continue;
      seen.add(p.title);
      const m = ii.extmetadata ?? {};
      out.push({
        title: p.title.replace(/^File:/, ''), page: ii.descriptionurl, thumb: ii.thumburl ?? ii.url, url: ii.url,
        license: strip(m.LicenseShortName?.value), artist: strip(m.Artist?.value).slice(0, 80),
      });
      if (out.length >= 8) return out;
    }
  }
  return out;
}

const list = [...groups.values()];
const result = {};
let n = 0;
for (const gr of list) {
  result[gr.key] = prev[gr.key]?.candidates?.length ? prev[gr.key] : { ...gr, candidates: await candidates(gr) };
  if (++n % 25 === 0) console.log(`${n}/${list.length}`);
  await new Promise((r) => setTimeout(r, 120)); // be polite to Commons
}
writeFileSync('out/photos-candidates.json', JSON.stringify({ at: new Date().toISOString(), groups: result }, null, 1));

// ---- review page ----
const html = `<!doctype html><meta charset="utf-8"><title>FULLCHARGE — approve vehicle photos</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:20px}h2{font-size:18px;margin:28px 0 6px}
.row{display:flex;gap:10px;flex-wrap:wrap}.c{width:240px;cursor:pointer;border:4px solid #333;border-radius:8px;overflow:hidden;background:#000}
.c img{width:100%;height:160px;object-fit:cover;display:block}.c small{display:block;padding:4px 6px;color:#aaa;font-size:12px}
.c.on{border-color:#2ecc40}.none{align-self:center;padding:10px 14px;border:2px solid #555;border-radius:8px;cursor:pointer}.none.on{border-color:#ff6b5e}
#bar{position:sticky;top:0;background:#111;padding:10px 0;border-bottom:1px solid #333;z-index:2}button{font-size:16px;padding:8px 16px}
.hint{color:#aaa}.done{color:#2ecc40}</style>
<div id="bar"><button onclick="save()">Save approvals</button> <span id="count"></span>
<p class="hint">Click the photo that is the RIGHT model AND generation (years). Click "None fit" if none are. Save, then put the downloaded
photos-approved.json in tools\\nhtsa\\out\\ and run <b>npm run photos:build</b>. Unsure? Leave it — no photo is better than a wrong one.</p></div>
<div id="list"></div>
<script>
const G=${JSON.stringify(result)};const A=${JSON.stringify(approved)};
const list=document.getElementById('list');
function count(){const d=Object.keys(A).length;document.getElementById('count').textContent=d+' of '+Object.keys(G).length+' decided';}
for(const [k,g] of Object.entries(G)){
  const h=document.createElement('h2');h.textContent=g.make+' '+g.model+' '+(g.years||'')+(g.powertrain?' · '+g.powertrain:'');list.appendChild(h);
  const row=document.createElement('div');row.className='row';list.appendChild(row);
  const els=[];
  const pick=(v)=>{A[k]=v;els.forEach(e=>e.el.classList.toggle('on',e.v===v));count();};
  for(const c of g.candidates){const el=document.createElement('div');el.className='c';
    el.innerHTML='<img loading="lazy" src="'+c.thumb+'"><small>'+c.title.replace(/</g,'')+'<br>'+(c.license||'?')+' · '+(c.artist||'')+'</small>';
    el.onclick=()=>pick(c.url);row.appendChild(el);els.push({el,v:c.url});}
  const no=document.createElement('div');no.className='none';no.textContent=g.candidates.length?'None fit':'No candidates found';no.onclick=()=>pick('none');row.appendChild(no);els.push({el:no,v:'none'});
  if(A[k])pick(A[k]);
}
count();
function save(){const b=new Blob([JSON.stringify(A,null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='photos-approved.json';a.click();}
</script>`;
writeFileSync('out/photos-review.html', html);
const none = Object.values(result).filter((g) => !g.candidates.length).length;
console.log(`\n${list.length} models. ${none} had no candidates (add your own in out\\photos-manual\\).`);
console.log('Open out\\photos-review.html in Chrome, pick photos, Save approvals, move photos-approved.json into out\\, then npm run photos:build.');
