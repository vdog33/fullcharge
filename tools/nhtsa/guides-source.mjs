// Where the PC tools get the vehicle list:
//   1) out/downloaded.json (after npm run download — has the original PDFs on this PC), else
//   2) out/guides.json (after npm run scrape), else
//   3) the list already published on Supabase (works on any PC with no scrape / download).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export const PUBLIC_BASE = (process.env.SUPABASE_URL || 'https://luuqzmvcoguuqcnhiaze.supabase.co')
  .trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '') + '/storage/v1/object/public/packs/nhtsa';

export async function loadGuides() {
  if (existsSync('out/downloaded.json')) return { from: 'out/downloaded.json', guides: JSON.parse(readFileSync('out/downloaded.json', 'utf8')).guides };
  if (existsSync('out/guides.json')) return { from: 'out/guides.json', guides: JSON.parse(readFileSync('out/guides.json', 'utf8')).guides };
  const r = await fetch(`${PUBLIC_BASE}/manifest.json?t=${Date.now()}`, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`No out\\ folder here and couldn't read the published list (${r.status}). Run npm run scrape, or set SUPABASE_URL.`);
  const m = await r.json();
  mkdirSync('out', { recursive: true });
  writeFileSync('out/published-manifest.json', JSON.stringify(m));
  console.log(`Using the published list on Supabase (${m.guides.length} entries, version ${m.version}).`);
  return { from: 'published', guides: m.guides };
}
