// Step 2 — download every PDF in out/guides.json to out/pdfs/. Safe to re-run: finished files are skipped.
// Uses a browser-like client (Playwright) because some hosts block plain scripts.
import { request } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const CONCURRENCY = 3;
mkdirSync('out/pdfs', { recursive: true });
mkdirSync('out/notpdf', { recursive: true });
mkdirSync('out/manual', { recursive: true }); // hand-sourced replacements: out/manual/<fileId>.pdf
const { guides } = JSON.parse(readFileSync('out/guides.json', 'utf8'));

// Hand fixes from review (open review.csv in Excel, fix, save as review-fixed.csv)
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}
if (existsSync('out/review-fixed.csv')) {
  const fixes = parseCsv(readFileSync('out/review-fixed.csv', 'utf8'));
  let n = 0;
  for (const f of fixes) {
    const g = guides.find((x) => x.key === f.key);
    if (!g) continue;
    if (String(f.make).toUpperCase() === 'DELETE') { g.deleted = true; n++; continue; }
    for (const k of ['make', 'model', 'years', 'powertrain', 'docType']) if (f[k]) g[k] = f[k];
    const ys = (g.years.match(/(19|20)\d{2}/g) ?? []).map(Number);
    g.yearFrom = ys.length ? Math.min(...ys) : null;
    g.yearTo = /present|current|\+/i.test(g.years) ? null : ys.length ? Math.max(...ys) : null;
    g.needs_review = false; g.review_flags = []; g.reviewed = true; n++;
  }
  console.log(`Applied ${n} review fixes.`);
}

const live = guides.filter((g) => !g.deleted);
// One download per file; every vehicle row on that file gets its size + hash.
const byFile = new Map();
for (const g of live) byFile.set(g.fileId ?? g.key, [...(byFile.get(g.fileId ?? g.key) ?? []), g]);
const fileJobs = [...byFile.entries()].map(([fileId, rows]) => ({ fileId, sourceUrl: rows[0].sourceUrl, rows }));
const api = await request.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  extraHTTPHeaders: { Accept: 'application/pdf,*/*' },
});

// A real PDF has "%PDF-" within its first 1 KB (some have junk bytes first) and ends with "%%EOF" (catches half-saved files).
const pdfStart = (buf) => buf.subarray(0, 1024).indexOf('%PDF-');
const complete = (buf) => buf.subarray(Math.max(0, buf.length - 2048)).includes('%%EOF');
const isPdf = (buf) => buf.length > 1024 && pdfStart(buf) >= 0 && complete(buf);
const clean = (buf) => (pdfStart(buf) > 0 ? buf.subarray(pdfStart(buf)) : buf);
// NHTSA serves each file from two hosts; if one copy is missing or broken, try the other.
const candidates = (u) => {
  const f = u.split('/').pop();
  return u.includes('static.nhtsa.gov') ? [u, `https://www.nhtsa.gov/${f}`] : [u];
};
let done = 0, skipped = 0;
const failed = [];

async function one(job) {
  const g = job; // { fileId, sourceUrl, rows }
  const dest = `out/pdfs/${g.fileId}.pdf`;
  const stamp = (bytes, sha) => job.rows.forEach((r) => { r.bytes = bytes; r.sha256 = sha; r.pdfFile = dest; });
  if (existsSync(dest) && statSync(dest).size > 1024) {
    const buf = readFileSync(dest);
    if (isPdf(buf)) { stamp(buf.length, createHash('sha256').update(buf).digest('hex')); skipped++; return; }
    // half-saved or damaged: fall through and download again
  }
  // A PDF you dropped into out/manual/ (e.g. from the manufacturer's site) beats NHTSA's copy.
  const manual = `out/manual/${g.fileId}.pdf`;
  if (existsSync(manual)) {
    const raw = readFileSync(manual);
    if (isPdf(raw)) {
      const buf = clean(raw);
      writeFileSync(dest, buf);
      stamp(buf.length, createHash('sha256').update(buf).digest('hex'));
      job.rows.forEach((r) => { r.manualSource = true; });
      done++;
      return;
    }
  }
  const errors = [];
  for (const url of candidates(g.sourceUrl)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await api.get(url, { timeout: 120_000 });
        const raw = Buffer.from(await res.body());
        if (res.ok() && isPdf(raw)) {
          const buf = clean(raw);
          writeFileSync(dest, buf);
          stamp(buf.length, createHash('sha256').update(buf).digest('hex'));
          done++;
          return;
        }
        const ct = res.headers()['content-type'] ?? '?';
        if (res.ok() && raw.length === 0) { errors.push(`${url.includes('static.') ? 'static' : 'www'}: EMPTY FILE on NHTSA's server`); break; }
        if (res.ok()) writeFileSync(`out/notpdf/${g.fileId}${/html/i.test(ct) ? '.html' : '.bin'}`, raw);
        errors.push(`${url.includes('static.') ? 'static' : 'www'}: HTTP ${res.status()} ${ct.split(';')[0]}${res.ok() ? (pdfStart(raw) >= 0 ? ' (PDF cut short)' : ' (not a PDF)') : ''}`);
        if (res.status() === 404 || res.status() === 403 || res.ok()) break; // retrying the same URL won't help
      } catch (e) {
        if (attempt === 3) errors.push(`${url.includes('static.') ? 'static' : 'www'}: ${String(e.message).slice(0, 80)}`);
        else await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  failed.push({ fileId: g.fileId, url: g.sourceUrl, vehicles: job.rows.map((r) => `${r.make} ${r.model}`), error: errors.join(' | ') });
}

const queue = [...fileJobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const g = queue.shift();
    await one(g);
    const n = done + skipped + failed.length;
    if (n % 25 === 0) console.log(`${n}/${fileJobs.length} files  (new ${done}, had ${skipped}, failed ${failed.length})`);
    await new Promise((r) => setTimeout(r, 250)); // be polite to NHTSA
  }
}));
await api.dispose();

const ok = live.filter((g) => g.sha256);
const total = ok.reduce((a, g) => a + g.bytes, 0);
writeFileSync('out/downloaded.json', JSON.stringify({ at: new Date().toISOString(), count: ok.length, totalBytes: total, guides: ok, failed }, null, 1));
console.log(`\nDone: ${fileJobs.length - failed.length}/${fileJobs.length} PDFs (${ok.length} vehicle entries) · ${(total / 1e9).toFixed(2)} GB · ${failed.length} failed (see out/downloaded.json).`);
if (failed.length) console.log('Re-run `npm run download` to retry. Anything NHTSA sent that wasn\'t a PDF is in out\\notpdf\\.');
