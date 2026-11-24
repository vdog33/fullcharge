// Re-verify every ERG PDF + Guide 147 URL. Run before every release.
// tesla.com / ford.com / mopar.com bot-block scripts (403) — confirm those 3 in a real browser.
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/fullcharge-data.json', import.meta.url)));
const enc = (u) => u.replace(/ /g, '%20');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const targets = [
  ...data.vehicles.map((v) => [v.id, v.erg_pdf_url]),
  ['guide-147', data.hazmat_erg_147.guide_147_pdf_url],
  ['erg-2024', data.hazmat_erg_147.full_erg_2024_pdf_url],
  ['cameo-un3480', data.hazmat_erg_147.cameo_un3480_url],
];

let bad = 0;
for (const [id, u] of targets) {
  try {
    const r = await fetch(enc(u), { headers: { 'User-Agent': UA, Range: 'bytes=0-1023' }, redirect: 'follow' });
    const ct = r.headers.get('content-type') ?? '';
    const ok = r.ok && (ct.includes('pdf') || id === 'cameo-un3480');
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.status} ${ct.padEnd(24)} ${id}`);
  } catch (e) {
    bad++;
    console.log(`FAIL ---  ${String(e.message).slice(0, 24).padEnd(24)} ${id}`);
  }
}
console.log(`\n${targets.length - bad}/${targets.length} OK. Any FAIL: browser-check; if still dead, drop the URL (app shows the in-app sheet).`);
process.exit(bad ? 1 : 0);
