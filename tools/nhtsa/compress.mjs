// Step 2b — shrink everything before it goes to phones.
//   Rescue sheets -> one WebP image per page, two sets: 200 dpi (iPhone) and 300 dpi (iPad).
//   Full ERGs     -> Ghostscript "ebook" PDF (text stays sharp, photos resized). Kept only if it's really smaller.
// Safe to re-run: finished sheets are skipped. Output: out/img/, out/small/, out/compressed.json
//
//   npm run compress
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SETTINGS = 'v1-webp80-200-300-ebook'; // bump to force a full rebuild
const SETS = { 200: 2 / 3, 300: 1 }; // render once at 300 dpi; 200 dpi = resize to 2/3
const WEBP_QUALITY = 80;

function findGhostscript() {
  if (process.env.GS) return process.env.GS;
  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
      if (!existsSync(root)) continue;
      const vers = readdirSync(root).filter((d) => d.startsWith('gs')).sort().reverse();
      for (const v of vers) for (const exe of ['gswin64c.exe', 'gswin32c.exe']) {
        const p = join(root, v, 'bin', exe);
        if (existsSync(p)) return p;
      }
    }
    throw new Error('Ghostscript not found. Install the 64-bit AGPL release from ghostscript.com.');
  }
  return 'gs';
}
const GS = findGhostscript();
const gs = (args) => {
  const r = spawnSync(GS, ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET', ...args], { timeout: 5 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Ghostscript failed: ${(r.stderr?.toString() || r.error?.message || '').slice(0, 200)}`);
};

const { guides } = JSON.parse(readFileSync('out/downloaded.json', 'utf8'));
const prev = existsSync('out/compressed.json') ? JSON.parse(readFileSync('out/compressed.json', 'utf8')) : { settings: SETTINGS, files: {} };
const results = prev.settings === SETTINGS ? prev.files : {};
['out/img', 'out/small', 'out/tmp'].forEach((d) => mkdirSync(d, { recursive: true }));

// One job per unique source PDF (several vehicles can share a sheet).
const jobs = [...new Map(guides.filter((g) => g.sha256).map((g) => [g.sha256, g])).values()];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function rescueSheet(g) {
  const tmp = `out/tmp/${g.sha256}`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  gs(['-sDEVICE=png16m', '-r300', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-sOutputFile=${tmp}/p%03d.png`, g.pdfFile]);
  const pngs = readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
  if (!pngs.length) throw new Error('no pages rendered');
  const sets = {};
  for (const [dpi, scale] of Object.entries(SETS)) {
    const dir = `out/img/${g.sha256}/${dpi}`;
    mkdirSync(dir, { recursive: true });
    const pages = [];
    for (const [i, png] of pngs.entries()) {
      const src = sharp(join(tmp, png));
      const meta = await src.metadata();
      const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
      const buf = await sharp(join(tmp, png)).resize(w, h).webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer();
      const out = `${dir}/p${i + 1}.webp`;
      writeFileSync(out, buf);
      pages.push({ file: `img/${g.sha256}/${dpi}/p${i + 1}.webp`, w, h, bytes: buf.length });
    }
    sets[dpi] = { pages, bytes: pages.reduce((a, p) => a + p.bytes, 0) };
  }
  rmSync(tmp, { recursive: true, force: true });
  return { kind: 'images', pages: pngs.length, sets, originalBytes: g.bytes };
}

function erg(g) {
  const out = `out/small/${g.sha256}.pdf`;
  gs(['-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', '-dPDFSETTINGS=/ebook', '-dDetectDuplicateImages=true', '-dCompressFonts=true', `-sOutputFile=${out}`, g.pdfFile]);
  const small = readFileSync(out);
  const ok = small.length > 1024 && small.subarray(0, 1024).includes('%PDF-') && small.length < g.bytes * 0.9;
  if (!ok) { rmSync(out, { force: true }); return { kind: 'pdf', file: g.pdfFile, bytes: g.bytes, sha256: g.sha256, compressed: false, originalBytes: g.bytes }; }
  return { kind: 'pdf', file: out, bytes: small.length, sha256: sha(small), compressed: true, originalBytes: g.bytes };
}

let done = 0, skipped = 0;
const failed = [];
const queue = [...jobs];
const WORKERS = Math.max(1, Math.min(4, cpus().length - 1));
const save = () => writeFileSync('out/compressed.json', JSON.stringify({ settings: SETTINGS, at: new Date().toISOString(), files: results }, null, 1));

await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (queue.length) {
    const g = queue.shift();
    const have = results[g.sha256];
    const stillThere = have && (have.kind === 'pdf' ? existsSync(have.file) : have.sets?.['200']?.pages.every((p) => existsSync(`out/${p.file}`)));
    if (stillThere) { skipped++; continue; }
    try {
      results[g.sha256] = g.docType === 'rescue_sheet' ? await rescueSheet(g) : erg(g);
      done++;
    } catch (e) {
      // Fall back to the original PDF so nothing is lost.
      results[g.sha256] = { kind: 'pdf', file: g.pdfFile, bytes: g.bytes, sha256: g.sha256, compressed: false, originalBytes: g.bytes, error: String(e.message).slice(0, 200) };
      failed.push(`${g.make} ${g.model}: ${String(e.message).slice(0, 120)}`);
    }
    const n = done + skipped + failed.length;
    if (n % 20 === 0) { save(); console.log(`${n}/${jobs.length}  (new ${done}, had ${skipped}, kept original ${failed.length})`); }
  }
}));
save();

// Totals
const all = jobs.map((g) => ({ g, r: results[g.sha256] }));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const rs = all.filter(({ g }) => g.docType === 'rescue_sheet');
const eg = all.filter(({ g }) => g.docType !== 'rescue_sheet');
const imgBytes = (r, dpi) => (r.kind === 'images' ? r.sets[dpi].bytes : r.bytes);
console.log(`\nDone. Rescue sheets (${rs.length}): ${gb(sum(rs.map(({ g }) => g.bytes)))} -> iPhone ${gb(sum(rs.map(({ r }) => imgBytes(r, '200'))))} · iPad ${gb(sum(rs.map(({ r }) => imgBytes(r, '300'))))}`);
console.log(`Full ERGs (${eg.length}): ${gb(sum(eg.map(({ g }) => g.bytes)))} -> ${gb(sum(eg.map(({ r }) => r.bytes)))}`);
if (failed.length) console.log(`${failed.length} kept as original PDF (couldn't convert):\n  ${failed.join('\n  ')}`);
