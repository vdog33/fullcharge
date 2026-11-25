// Collect every system on the California Energy Commission's Energy Storage System (ESS) list.
// Listing requires a UL 9540 certificate, the standard US installation codes require for home batteries.
// Output: out/cec-ess-raw.json (every row) and out/bess-catalog.json (grouped into product families).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildFamilies } from '../../src/lib/bess-core.ts';

const BASE = 'https://solarequipment.energy.ca.gov/Home/EnergyStorage';
mkdirSync('out/debug', { recursive: true });

const browser = await chromium.launch({ headless: false }); // visible: some state sites block headless browsers
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

async function readTable() {
  return page.$$eval('table', (tables) => {
    const t = tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
    if (!t) return { headers: [], rows: [] };
    const headers = [...t.querySelectorAll('thead th, tr:first-child th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    const rows = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ' ').trim())).filter((r) => r.length > 2);
    return { headers, rows };
  });
}
const num = (s) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
function toRow(headers, cells) {
  const col = (re) => { const i = headers.findIndex((h) => re.test(h)); return i >= 0 ? cells[i] : ''; };
  return {
    manufacturer: col(/manufacturer/i) || cells[0], model: col(/model/i) || cells[1], description: col(/description/i) || cells[2],
    kwh: num(col(/energy|kwh/i)), kw: num(col(/power|\bkw\b/i)), vac: num(col(/voltage|vac/i)),
    ja12: col(/ja12/i), pcs: col(/pcs|power control/i),
  };
}

const all = new Map();
let headers = [];
// Big page size first (the site accepts /<size>?page=N); fall back to the default paging.
for (const pattern of [(p) => `${BASE}/1000?page=${p}`, (p) => `${BASE}?page=${p}`]) {
  for (let p = 1; p <= 2000; p++) {
    await page.goto(pattern(p), { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(600);
    const t = await readTable();
    if (t.headers.length) headers = t.headers;
    if (p === 1) writeFileSync('out/debug/ess-page-1.html', await page.content());
    const before = all.size;
    for (const cells of t.rows) { const r = toRow(headers, cells); all.set(`${r.manufacturer}|${r.model}|${r.description}`, r); }
    console.log(`page ${p}: ${all.size} systems`);
    if (all.size === before) break;
  }
  if (all.size > 50) break;
}
await browser.close();

const rows = [...all.values()];
writeFileSync('out/cec-ess-raw.json', JSON.stringify({ fetchedAt: new Date().toISOString(), source: BASE, headers, count: rows.length, rows }, null, 1));
const families = buildFamilies(rows);
const version = new Date().toISOString().slice(0, 10);
writeFileSync('out/bess-catalog.json', JSON.stringify({ version, source: 'California Energy Commission — Energy Storage System List (UL 9540)', fetchedAt: new Date().toISOString(), count: families.length, families }));

const res = families.filter((f) => f.residential);
console.log(`\nDone: ${rows.length} listed systems -> ${families.length} product families (${res.length} home-sized, ${new Set(res.map((f) => f.brand)).size} brands).`);
console.log(`Linked to FULLCHARGE verified cards: ${families.filter((f) => f.curatedId).map((f) => `${f.brand} ${f.family}`).join(', ') || 'none'}`);
if (rows.length < 50) console.log('⚠ Far fewer than expected. Send out/debug/ess-page-1.html to Claude to tune the scraper.');
