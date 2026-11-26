// Offline VIN decoder data, built from NHTSA's own standalone vPIC database. Runs on your PC.
//
// 1) Download the vPIC standalone database, PostgreSQL format: https://vpic.nhtsa.dot.gov/Downloads
//    Unzip it into tools\nhtsa\out\vpic\  (any .sql file in there is read).
// 2) npm run vin:build        -> out/vin-db.json, only the makes that have cut sheets (add -- --all-makes for every make)
// 3) npm run vin:check        -> decodes every VIN in vin-samples.txt both ways (offline file vs NHTSA online) and
//                                prints any that disagree. Put real VINs in that file (test cars, fleet, scenes).
// 4) npm run vin:publish      -> uploads packs/vin/vin-db.json (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { decodeOffline } from '../../src/lib/vin-offline-core.ts';
import { modelYear, normalizeVin } from '../../src/lib/vin-core.ts';
import { PUBLIC_BASE } from './guides-source.mjs';

const cmd = process.argv[2];
mkdirSync('out', { recursive: true });
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function build() {
  const dir = 'out/vpic';
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.sql$/i.test(f)).map((f) => join(dir, f)) : [];
  if (!files.length) { console.error('No .sql file in out\\vpic\\ — download the PostgreSQL standalone database from https://vpic.nhtsa.dot.gov/Downloads and unzip it there.'); process.exit(1); }
  const WANT = new Set(['wmi', 'wmi_vinschema', 'pattern', 'element', 'make', 'model', 'make_model', 'wmi_make', 'electrificationlevel']);
  const T = Object.fromEntries([...WANT].map((t) => [t, { cols: [], rows: [] }]));
  for (const f of files) {
    console.log(`Reading ${f} (${(statSync(f).size / 1e9).toFixed(2)} GB)…`);
    const rl = createInterface({ input: createReadStream(f, 'utf8'), crlfDelay: Infinity });
    let cur = null;
    for await (const line of rl) {
      if (cur) {
        if (line === '\\.') { cur = null; continue; }
        cur.rows.push(line.split('\t').map((v) => (v === '\\N' ? null : v)));
        continue;
      }
      const m = /^COPY\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(([^)]*)\)\s+FROM\s+stdin/i.exec(line);
      if (m && WANT.has(m[1].toLowerCase())) {
        cur = T[m[1].toLowerCase()];
        cur.cols = m[2].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase());
      }
    }
  }
  const rowsOf = (t) => { const { cols, rows } = T[t]; return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))); };
  for (const t of ['wmi', 'wmi_vinschema', 'pattern', 'element', 'model']) if (!T[t].rows.length) throw new Error(`Table ${t} not found in the dump — is it the PostgreSQL plain-text version?`);

  const el = rowsOf('element');
  const elId = (name) => el.find((e) => norm(e.name) === norm(name))?.id;
  const MODEL = elId('Model'), ELEC = elId('Electrification Level');
  if (!MODEL) throw new Error('No "Model" element in the dump.');
  const makeName = new Map(rowsOf('make').map((r) => [r.id, r.name]));
  const modelName = new Map(rowsOf('model').map((r) => [r.id, r.name]));
  const elecName = new Map(rowsOf('electrificationlevel').map((r) => [r.id, r.name]));
  const modelMake = new Map(rowsOf('make_model').map((r) => [r.modelid, r.makeid]));
  const wmiMake = new Map(rowsOf('wmi_make').map((r) => [r.wmiid, r.makeid]));

  // Which makes: the ones with cut sheets (from the published list), unless --all-makes.
  let keep = null;
  if (!process.argv.includes('--all-makes')) {
    const r = await fetch(`${PUBLIC_BASE}/manifest.json?t=${Date.now()}`);
    if (!r.ok) throw new Error(`Couldn't read the published cut-sheet list: HTTP ${r.status}`);
    keep = new Set((await r.json()).guides.map((g) => norm(g.make)));
    keep.add('chevrolet'); keep.add('gmc');
  }
  const wmis = rowsOf('wmi').filter((w) => {
    const mk = makeName.get(w.makeid ?? wmiMake.get(w.id));
    return !keep || (mk && keep.has(norm(mk)));
  });
  const wmiById = new Map(wmis.map((w) => [w.id, w.wmi]));
  const db = { version: new Date().toISOString().slice(0, 10), models: [], elec: [], wmi: {}, schemas: {} };
  const mIdx = new Map(), eIdx = new Map();
  const idx = (map, arr, k) => { if (!map.has(k)) { map.set(k, arr.length); arr.push(k); } return map.get(k); };
  const schemas = new Set();
  for (const r of rowsOf('wmi_vinschema')) {
    const w = wmiById.get(r.wmiid);
    if (!w) continue;
    (db.wmi[w] ??= []).push([Number(r.vinschemaid), Number(r.yearfrom ?? 1980), r.yearto == null ? null : Number(r.yearto)]);
    schemas.add(r.vinschemaid);
  }
  let n = 0;
  for (const p of rowsOf('pattern')) {
    if (!schemas.has(p.vinschemaid) || (p.elementid !== MODEL && p.elementid !== ELEC)) continue;
    const list = (db.schemas[p.vinschemaid] ??= []);
    if (p.elementid === MODEL) {
      const name = modelName.get(p.attributeid);
      if (!name) continue;
      const mk = makeName.get(modelMake.get(p.attributeid)) ?? '';
      list.push([p.keys, idx(mIdx, db.models, `${mk}|${name}`), -1]);
    } else {
      const name = elecName.get(p.attributeid) ?? p.attributeid;
      if (!name || /not applicable/i.test(name)) continue;
      list.push([p.keys, -1, idx(eIdx, db.elec, name)]);
    }
    n++;
  }
  const out = JSON.stringify(db);
  writeFileSync('out/vin-db.json', out);
  console.log(`Built out\\vin-db.json: ${Object.keys(db.wmi).length} WMIs, ${db.models.length} models, ${n} patterns, ${(out.length / 1e6).toFixed(1)} MB.`);
  console.log('Next: put real VINs in vin-samples.txt and run npm run vin:check.');
}

async function check() {
  const db = JSON.parse(readFileSync('out/vin-db.json', 'utf8'));
  const vins = existsSync('vin-samples.txt') ? readFileSync('vin-samples.txt', 'utf8').split(/\s+/).map(normalizeVin).filter((v) => v.length === 17) : [];
  if (!vins.length) { console.error('Put real VINs (one per line) in tools\\nhtsa\\vin-samples.txt first.'); process.exit(1); }
  let ok = 0, multi = 0;
  const bad = [];
  for (const v of vins) {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`);
    const on = (await r.json())?.Results?.[0] ?? {};
    const year = on.ModelYear ? Number(on.ModelYear) : modelYear(v);
    const off = decodeOffline(db, v, year);
    const match = off?.models.some((m) => norm(m) === norm(on.Model));
    if (match) { ok++; if (off.models.length > 1) multi++; } else bad.push(`${v}: online "${on.Make} ${on.Model}" · offline ${off ? `"${off.make} ${off.models.join(' / ') || '(make only)'}"` : 'nothing'}`);
    await new Promise((s) => setTimeout(s, 300));
  }
  console.log(`${ok}/${vins.length} agree with NHTSA online (${multi} of those offered more than one model to pick from).`);
  if (bad.length) console.log(`Disagree:\n  ${bad.join('\n  ')}`);
  console.log(bad.length ? 'Fix or report these before publishing.' : 'All agree — npm run vin:publish.');
}

async function publish() {
  const URL_ = (process.env.SUPABASE_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '');
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
  const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const body = readFileSync('out/vin-db.json');
  const res = await fetch(`${URL_}/storage/v1/object/packs/vin/vin-db.json`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=300' }, body,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  console.log(`Published offline VIN data (${(body.length / 1e6).toFixed(1)} MB). Phones get it in Downloads / Scene-ready setup.`);
}

if (cmd === 'build') await build();
else if (cmd === 'check') await check();
else if (cmd === 'publish') await publish();
else console.log('Use: npm run vin:build | vin:check | vin:publish');
