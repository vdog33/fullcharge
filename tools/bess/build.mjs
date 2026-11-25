// Rebuild out/bess-catalog.json from the already-scraped out/cec-ess-raw.json (no browser, a few seconds).
// Also prints a report for the brands that have FULLCHARGE verified cards, so the linking rules can be checked.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFamilies, brandOf } from '../../src/lib/bess-core.ts';

const raw = JSON.parse(readFileSync('out/cec-ess-raw.json', 'utf8'));
const families = buildFamilies(raw.rows);
const version = new Date().toISOString().slice(0, 10);
writeFileSync('out/bess-catalog.json', JSON.stringify({ version, source: 'California Energy Commission — Energy Storage System List (UL 9540)', fetchedAt: raw.fetchedAt, count: families.length, families }));
console.log(`Rebuilt: ${raw.rows.length} listed systems -> ${families.length} product families (${families.filter((f) => f.residential).length} home-sized).`);

const WATCH = /tesla|franklin|solaredge|lg|panasonic|enphase|generac/i;
const lines = [];
for (const r of raw.rows) if (WATCH.test(r.manufacturer)) lines.push(`${r.manufacturer} => ${brandOf(r.manufacturer)} | ${r.model} | ${String(r.description).slice(0, 90)}`);
writeFileSync('out/report.txt', [...new Set(lines)].sort().join('\n'));
console.log(`Linked: ${families.filter((f) => f.curatedId).map((f) => `${f.brand} ${f.family} -> ${f.curatedId}`).join('\n        ') || 'none'}`);
console.log('Wrote out\\report.txt (rows for brands with verified cards) — send it to Claude.');
