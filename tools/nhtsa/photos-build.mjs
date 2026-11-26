// Vehicle photos, step 2 — download the photos you approved (plus your own from out/photos-manual/),
// shrink them for phones and write out/photos.json. `npm run publish` then ships them in the rescue-sheet pack.
//
//   npm run photos:build
//
// Your own photo for a model: name it with the model's file code (printed by photos:find in out/photos-codes.txt),
// e.g. out\photos-manual\tesla-modely-2020-present.jpg. It wins over a Commons pick. Put the credit in the
// matching .txt file (e.g. "Photo: Engine 12, Anytown FD") — otherwise it shows "Photo: own".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const { groups } = JSON.parse(readFileSync('out/photos-candidates.json', 'utf8'));
const approved = existsSync('out/photos-approved.json') ? JSON.parse(readFileSync('out/photos-approved.json', 'utf8')) : {};
const prev = existsSync('out/photos.json') ? JSON.parse(readFileSync('out/photos.json', 'utf8')).photos : {};
mkdirSync('out/photos', { recursive: true });
mkdirSync('out/photos-manual', { recursive: true });

/** File-safe code for a group key: "tesla|modely|2020–present" -> "tesla-modely-2020-present". */
export const code = (k) => k.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
writeFileSync('out/photos-codes.txt', Object.values(groups).map((g) => `${code(g.key)}\t${g.make} ${g.model} ${g.years}`).join('\n'));

const manual = new Map(readdirSync('out/photos-manual').filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f)).map((f) => [f.replace(/\.[^.]+$/, '').toLowerCase(), f]));
const UA = { 'User-Agent': 'FULLCHARGE/1.0 (first-responder app; vehicle reference photos)' };

async function shrink(buf) {
  const img = sharp(buf).rotate().resize({ width: 900, withoutEnlargement: true });
  const out = await img.webp({ quality: 72, effort: 6 }).toBuffer();
  const meta = await sharp(out).metadata();
  const sha = createHash('sha256').update(out).digest('hex');
  const file = `photos/${sha.slice(0, 32)}.webp`;
  writeFileSync(`out/${file}`, out);
  return { file, w: meta.width, h: meta.height, bytes: out.length };
}

const photos = {};
let made = 0, kept = 0, skipped = 0;
const failed = [];
for (const g of Object.values(groups)) {
  try {
    const own = manual.get(code(g.key));
    if (own) {
      const credTxt = `out/photos-manual/${code(g.key)}.txt`;
      const credit = existsSync(credTxt) ? readFileSync(credTxt, 'utf8').trim().slice(0, 80) : 'Photo: own';
      photos[g.key] = { ...(await shrink(readFileSync(`out/photos-manual/${own}`))), credit, source: own };
      made++;
      continue;
    }
    const pick = approved[g.key];
    if (!pick || pick === 'none') { skipped++; continue; }
    if (prev[g.key]?.source === pick && existsSync(`out/${prev[g.key].file}`)) { photos[g.key] = prev[g.key]; kept++; continue; }
    const c = g.candidates.find((x) => x.url === pick);
    if (!c) { skipped++; continue; }
    if (pick.startsWith('guide:')) { // cropped from the manufacturer's own guide on this PC
      photos[g.key] = { ...(await shrink(readFileSync(`out/${pick.slice(6)}`))), credit: `${g.make} emergency response guide`, license: 'Manufacturer guide', source: pick };
      made++;
      continue;
    }
    const r = await fetch(c.url, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const credit = `${c.artist ? c.artist + ' · ' : ''}${c.license || 'Wikimedia Commons'}`.slice(0, 80);
    photos[g.key] = { ...(await shrink(Buffer.from(await r.arrayBuffer()))), credit, license: c.license, source: c.url, page: c.page };
    made++;
    await new Promise((res) => setTimeout(res, 150));
  } catch (e) { failed.push(`${g.make} ${g.model} ${g.years}: ${String(e.message).slice(0, 80)}`); }
}
writeFileSync('out/photos.json', JSON.stringify({ at: new Date().toISOString(), photos }, null, 1));
const mb = Object.values(photos).reduce((a, p) => a + p.bytes, 0) / 1e6;
console.log(`Photos: ${Object.keys(photos).length} ready (${made} new, ${kept} unchanged) · ${skipped} models without one · ${mb.toFixed(0)} MB.`);
if (failed.length) console.log(`Failed:\n  ${failed.join('\n  ')}`);
console.log('Next: npm run publish');
