// Upload out/bess-catalog.json to Supabase Storage (packs/bess/catalog.json). Phones fetch it with the vehicle list.
//   $env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."; npm run publish
import { readFileSync } from 'node:fs';

const URL_ = (process.env.SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };

const body = readFileSync('out/bess-catalog.json');
const cat = JSON.parse(body);
const r = await fetch(`${URL_}/storage/v1/object/packs/bess/catalog.json`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=60' }, body,
});
if (!r.ok) { console.error(`Upload failed: ${r.status} ${await r.text()}`); process.exit(1); }
console.log(`Published BESS catalog ${cat.version}: ${cat.count} product families. Phones pick it up next launch.`);
