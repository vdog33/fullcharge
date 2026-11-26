// Brand logos for the manufacturer grid — find candidates, you approve, then build into assets/brands/.
//
//   npm run logos:find     -> out/logos-review.html (open in Chrome, click the right logo per brand, Save approvals,
//                             move logos-approved.json into out\)
//   npm run logos:build    -> assets/brands/<brand>.png + regenerates src/data/brand-logos.ts
//
// Source: Wikimedia Commons (logo files). Logos are trademarks, used here only to name the brand on its button.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { loadGuides } from './guides-source.mjs';

const MODE = process.argv[2];
const ASSETS = new URL('../../assets/brands/', import.meta.url);
// Same slug as src/components/BrandGrid.tsx brandSlug()
const slug = (make) => make.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const UA = { 'User-Agent': 'FULLCHARGE/1.0 (first-responder app; brand logos; one-time review tool)' };
mkdirSync('out', { recursive: true });

if (MODE === 'find') {
  const { guides: listed } = await loadGuides();
  const seed = JSON.parse(readFileSync(new URL('../../src/data/fullcharge-data.json', import.meta.url))).vehicles;
  const makes = [...new Set([...listed.map((g) => g.make), ...seed.map((v) => v.make)].filter(Boolean))].sort();
  const approved = existsSync('out/logos-approved.json') ? JSON.parse(readFileSync('out/logos-approved.json', 'utf8')) : {};
  const result = {};
  const commons = async (q) => {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20' +
      `&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=320`;
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(url, { headers: UA }); if (r.ok) return Object.values((await r.json())?.query?.pages ?? {}); } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    }
    return [];
  };
  // Commons names logo files many ways ("Mercedes-Logo.svg", "Logo of Rivian.svg", "Volvo Iron Mark.svg"):
  // several searches per brand, and the file name only has to contain one word of the brand.
  const words = (m) => m.toLowerCase().split(/[\s&-]+/).filter((w) => w.length >= 2 && !['motor', 'motors', 'bus', 'trucks', 'the'].includes(w));
  for (const make of makes) {
    const seen = new Set(), list = [];
    for (const q of [`${make} logo`, `${make} logo svg`, `${make} emblem`, `${make} wordmark`, `intitle:"${make}" logo`]) {
      for (const p of await commons(q)) {
        const ii = p.imageinfo?.[0];
        if (!ii || seen.has(p.title) || !/svg|png/.test(ii.mime ?? '')) continue;
        const t = p.title.toLowerCase();
        if (!words(make).some((w) => t.includes(w)) || !/logo|emblem|wordmark|badge|mark|brand/.test(t)) continue;
        seen.add(p.title);
        list.push({ title: p.title.replace(/^File:/, ''), thumb: ii.thumburl, page: ii.descriptionurl });
      }
      if (list.length >= 10) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    result[make] = list.slice(0, 10);
  }
  const none = Object.entries(result).filter(([, c]) => !c.length).map(([m]) => m);
  if (none.length) console.log(`\nNo logo found for ${none.length}: ${none.join(', ')}\nDrop your own PNG for those in assets\\brands\\ named like ${none.slice(0, 2).map((m) => slug(m) + '.png').join(', ')} — logos:build keeps them.`);
  writeFileSync('out/logos-candidates.json', JSON.stringify(result, null, 1));
  writeFileSync('out/logos-review.html', `<!doctype html><meta charset="utf-8"><title>Approve brand logos</title>
<style>body{font:15px system-ui;background:#222;color:#eee;margin:20px}h2{font-size:18px;margin:24px 0 6px}.row{display:flex;gap:10px;flex-wrap:wrap}
.c{width:150px;height:150px;background:#fff;border:4px solid #444;border-radius:75px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.c img{max-width:110px;max-height:110px}.c.on{border-color:#2ecc40}.none{align-self:center;padding:10px;border:2px solid #666;border-radius:8px;cursor:pointer}.none.on{border-color:#ff6b5e}
#bar{position:sticky;top:0;background:#222;padding:10px 0;z-index:2}</style>
<div id="bar"><button onclick="save()">Save approvals</button> <span id="n"></span> — pick the CURRENT logo for each brand, shown as it will look (white circle).</div><div id="l"></div>
<script>const G=${JSON.stringify(result)},A=${JSON.stringify(approved)},l=document.getElementById('l');
const n=()=>document.getElementById('n').textContent=Object.keys(A).length+' of '+Object.keys(G).length+' decided';
for(const [m,cs] of Object.entries(G)){const h=document.createElement('h2');h.textContent=m;l.appendChild(h);const r=document.createElement('div');r.className='row';l.appendChild(r);const els=[];
const pick=v=>{A[m]=v;els.forEach(e=>e.el.classList.toggle('on',e.v===v));n();};
for(const c of cs){const e=document.createElement('div');e.className='c';e.title=c.title;e.innerHTML='<img loading="lazy" src="'+c.thumb+'">';e.onclick=()=>pick(c.thumb);r.appendChild(e);els.push({el:e,v:c.thumb});}
const x=document.createElement('div');x.className='none';x.textContent=cs.length?'None fit (show initials)':'Nothing found (initials)';x.onclick=()=>pick('none');r.appendChild(x);els.push({el:x,v:'none'});if(A[m])pick(A[m]);}
n();function save(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(A,null,1)]));a.download='logos-approved.json';a.click();}</script>`);
  console.log(`${Object.keys(result).length} brands. Open out\\logos-review.html, pick, Save approvals, move logos-approved.json into out\\, then npm run logos:build.`);
} else if (MODE === 'build') {
  const approved = JSON.parse(readFileSync('out/logos-approved.json', 'utf8'));
  mkdirSync(ASSETS, { recursive: true });
  let ok = 0; const failed = [];
  for (const [make, thumb] of Object.entries(approved)) {
    if (thumb === 'none') continue;
    try {
      const r = await fetch(thumb.replace(/\/\d+px-/, '/480px-'), { headers: UA });
      const buf = Buffer.from(await (r.ok ? r : await fetch(thumb, { headers: UA })).arrayBuffer());
      const png = await sharp(buf).trim().resize(240, 240, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      writeFileSync(new URL(`${slug(make)}.png`, ASSETS), png);
      ok++;
      await new Promise((res) => setTimeout(res, 120));
    } catch (e) { failed.push(`${make}: ${String(e.message).slice(0, 80)}`); }
  }
  console.log(`${ok} logos written to assets\\brands\\.${failed.length ? '\nFailed:\n  ' + failed.join('\n  ') : ''}`);
  execFileSync(process.execPath, [new URL('../../scripts/gen-brand-logos.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'inherit' });
  console.log('Commit assets/brands and src/data/brand-logos.ts, then rebuild the app.');
} else {
  console.log('Usage: npm run logos:find | npm run logos:build');
}
