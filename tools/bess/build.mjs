// Rebuild out/bess-catalog.json from the already-scraped out/cec-ess-raw.json (no browser, a few seconds).
// Also prints a report for the brands that have FULLCHARGE verified cards, so the linking rules can be checked.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFamilies, brandOf } from '../../src/lib/bess-core.ts';

const raw = JSON.parse(readFileSync('out/cec-ess-raw.json', 'utf8'));
const families = buildFamilies(raw.rows);
const version = new Date().toISOString().slice(0, 10);
writeFileSync('out/bess-catalog.json', JSON.stringify({ version, source: 'California Energy Commission — Energy Storage System List (UL 9540)', fetchedAt: raw.fetchedAt, count: families.length, families }));
console.log(`Rebuilt: ${raw.rows.length} listed systems -> ${families.length} product families (${families.filter((f) => f.residential).length} home-sized).`);

const WATCH = /tesla|powerwall|1707000|1092170|2012170|3012170|franklin|solaredge|BAT-10K|lg |resu|panasonic|evervolt|enphase|generac/i;
const lines = [];
for (const r of raw.rows) if (WATCH.test(`${r.manufacturer} ${r.model} ${r.description}`)) lines.push(`${r.manufacturer} => ${brandOf(r.manufacturer)} | ${r.model} | ${String(r.description).slice(0, 90)}`);
const brands = new Map();
for (const r of raw.rows) { const b = `${brandOf(r.manufacturer)}  <=  ${r.manufacturer}`; brands.set(b, (brands.get(b) ?? 0) + 1); }
const brandLines = [...brands.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([b, n]) => `${String(n).padStart(5)}  ${b}`);
const empties = raw.rows.filter((r) => !r.manufacturer || !r.model).length;
writeFileSync('out/report.txt', [`Rows: ${raw.rows.length}  (missing maker or model: ${empties})  Columns seen: ${JSON.stringify(raw.headers)}`, '',
  '== Every brand (listings  brand <= company name) ==', ...brandLines, '', '== Rows for brands with verified cards ==', ...[...new Set(lines)].sort()].join('\n'));
console.log(`Linked: ${families.filter((f) => f.curatedId).map((f) => `${f.brand} ${f.family} -> ${f.curatedId}`).join('\n        ') || 'none'}`);
console.log('Wrote out\\report.txt (rows for brands with verified cards) — send it to Claude.');
