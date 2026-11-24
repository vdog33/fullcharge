// Step 1 — list every ERG / rescue sheet on the NHTSA portal.
// The portal builds its list with JavaScript and blocks plain downloads, so this drives a real Chromium.
// It collects PDF links two ways: (a) JSON the page loads in the background, (b) links on every results page.
// Output: out/guides.json (+ out/review.csv for anything it couldn't parse, + out/debug/ for tuning).
//
//   npm run scrape                 headless
//   npm run scrape -- --show       watch the browser
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileKey, listedBytes, parseEntry } from './parse.mjs';

const PORTAL = 'https://www.nhtsa.gov/emergency-response-guides';
// NHTSA's bot protection blocks headless Chromium, so the window shows by default. --headless to hide it.
const SHOW = !process.argv.includes('--headless');
const MAX_PAGES = 200;
mkdirSync('out/debug', { recursive: true });

// One PDF is served from two hosts (www.nhtsa.gov and static.nhtsa.gov) and one PDF can cover several vehicles,
// so collect per FILE: every URL it's served from + every vehicle row that points at it.
const found = new Map(); // fileKey -> { urls:Set, contexts:Set }
const add = (url, context) => {
  try {
    const abs = new URL(url, PORTAL).href;
    if (!/\.pdf(\?|#|$)/i.test(abs)) return;
    const k = fileKey(abs);
    const e = found.get(k) ?? { urls: new Set(), contexts: new Set() };
    e.urls.add(abs);
    if (context && context.trim()) e.contexts.add(context.replace(/\s+/g, ' ').trim());
    found.set(k, e);
  } catch { /* bad url */ }
};
const bestUrl = (urls) => [...urls].sort((a, b) => Number(b.includes('static.nhtsa.gov')) - Number(a.includes('static.nhtsa.gov')))[0];

// (a) any JSON the page fetches: walk it, keep every object that holds a .pdf link, with its other text as context
let jsonHits = 0;
function walk(node, parentText = '') {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, parentText)); return; }
  if (!node || typeof node !== 'object') return;
  const strings = Object.values(node).filter((v) => typeof v === 'string');
  const ctx = [parentText, ...strings.filter((s) => !/^https?:|\.pdf/i.test(s) && s.length < 200)].join(' ').trim();
  for (const s of strings) if (/\.pdf(\?|#|$)/i.test(s)) { add(s, ctx); jsonHits++; }
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, ctx.slice(0, 300));
}

const browser = await chromium.launch({ headless: !SHOW });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  viewport: { width: 1400, height: 1000 },
});
const page = await context.newPage();
const apiLog = [];
page.on('response', async (res) => {
  const ct = res.headers()['content-type'] ?? '';
  if (!/json/i.test(ct)) return;
  try {
    const body = await res.json();
    apiLog.push({ url: res.url(), status: res.status() });
    const before = jsonHits;
    walk(body);
    if (jsonHits > before) writeFileSync(`out/debug/api-${apiLog.length}.json`, JSON.stringify(body, null, 1).slice(0, 2_000_000));
  } catch { /* not json */ }
});

// (b) DOM: every PDF link with its row / card text
async function harvest() {
  const links = await page.$$eval('a[href]', (as) => as.map((a) => {
    const row = a.closest('tr, li, article, .views-row, .card, .usa-card, .result, div[class*="row"]') ?? a.parentElement;
    return { href: a.getAttribute('href'), text: (row?.textContent ?? a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) };
  }));
  let n = 0;
  for (const l of links) if (l.href && /\.pdf/i.test(l.href)) { add(l.href, jsonHits ? '' : l.text); n++; }
  return n;
}

console.log('Opening portal…');
await page.goto(PORTAL, { waitUntil: 'networkidle', timeout: 90_000 });
await page.waitForTimeout(3000);
writeFileSync('out/debug/page-1.html', await page.content());

// Some versions need a "search / apply" click before results render.
for (const sel of ['button:has-text("Search")', 'input[type=submit][value*="Apply" i]', 'button:has-text("Apply")']) {
  const b = await page.$(sel);
  if (b && (await page.$$('a[href$=".pdf"], a[href*=".pdf?"]')).length === 0) {
    await b.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

let pageNo = 1;
let total = await harvest();
console.log(`page 1: ${total} pdf links, ${found.size} unique`);

// Pagination: click "next" until it disappears or stops adding links.
const NEXT = ['a[rel="next"]', 'li.pager__item--next a', '.usa-pagination__next-page', 'a:has-text("Next")', 'button:has-text("Next")', 'a[aria-label*="next" i]', 'button[aria-label*="next" i]', 'button:has-text("Load more")', 'a:has-text("Load more")'];
while (pageNo < MAX_PAGES) {
  let next = null;
  for (const sel of NEXT) { const el = await page.$(sel); if (el && (await el.isVisible().catch(() => false))) { next = el; break; } }
  if (!next) break;
  const before = found.size;
  await next.click().catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  pageNo++;
  await harvest();
  if (pageNo <= 3) writeFileSync(`out/debug/page-${pageNo}.html`, await page.content());
  console.log(`page ${pageNo}: ${found.size} unique`);
  if (found.size === before && pageNo > 2) break;
}

// Fallback for Drupal views: ?page=N
if (pageNo === 1) {
  for (let i = 1; i < MAX_PAGES; i++) {
    const before = found.size;
    await page.goto(`${PORTAL}?page=${i}`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await harvest();
    console.log(`?page=${i}: ${found.size} unique`);
    if (found.size === before) break;
  }
}
await browser.close();
writeFileSync('out/debug/api-log.json', JSON.stringify(apiLog, null, 1));

// Build the list: one row per vehicle per file. Rows that share a file share one download.
const rows = new Map();
for (const [fk, e] of found) {
  const url = bestUrl(e.urls);
  const fileId = createHash('sha1').update(fk).digest('hex').slice(0, 12);
  const ctxs = e.contexts.size ? [...e.contexts] : [''];
  for (const context of ctxs) {
    const p = parseEntry(context, url);
    const key = createHash('sha1').update(`${fk}|${p.make}|${p.model}|${p.years}`).digest('hex').slice(0, 12);
    if (!rows.has(key)) rows.set(key, { key, fileId, ...p, sourceUrl: url, listedBytes: listedBytes(context), context });
  }
}
const guides = [...rows.values()];
guides.sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || (b.yearFrom ?? 0) - (a.yearFrom ?? 0));
const files = new Set(guides.map((g) => g.fileId)).size;
const est = [...new Map(guides.map((g) => [g.fileId, g])).values()];
const gb = (t) => (est.filter((g) => !t || g.docType === t).reduce((a, g) => a + g.listedBytes, 0) / 1e9).toFixed(2);
writeFileSync('out/guides.json', JSON.stringify({ scrapedAt: new Date().toISOString(), portal: PORTAL, count: guides.length, files, guides }, null, 1));

const review = guides.filter((g) => g.needs_review);
const csv = ['key,make,model,years,powertrain,docType,flags,sourceUrl,context',
  ...review.map((g) => [g.key, g.make, g.model, g.years, g.powertrain, g.docType, g.review_flags.join('|'), g.sourceUrl, g.context].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
writeFileSync('out/review.csv', csv);

console.log(`\nDone: ${files} PDFs covering ${guides.length} vehicle entries (${jsonHits ? 'from page data' : 'from page links'}).`);
console.log(`Listed sizes: rescue sheets ${gb('rescue_sheet')} GB · full ERGs ${gb('erg')} GB · all ${gb()} GB`);
console.log(`${review.length} need a human look — open out/review.csv, fix make/model/years, save as out/review-fixed.csv.`);
if (files < 100) console.log('⚠ Fewer than expected (~480–700). Run with --show to watch it, and send out/debug/ to Claude to tune the scraper.');
