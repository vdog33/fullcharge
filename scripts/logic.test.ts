import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/fullcharge-data.json' with { type: 'json' };
import { checkDigitOk, looksLikeVin, matchCatalog, modelYear, wmiMake } from '../src/lib/vin-core.ts';
import { bearingDeg, distanceM, metresPerPixel, offsetM, plumeHeading, scaleBar, toScreen } from '../src/lib/geo.ts';

const cat = data.vehicles.map((v: { id: string; make: string }) => ({ id: v.id, make: v.make }));

test('VIN basics', () => {
  assert.ok(checkDigitOk('1HGCM82633A004352')); // canonical valid example
  assert.ok(!checkDigitOk('1HGCM82643A004352'));
  assert.ok(!looksLikeVin('1HGCM82633A00435O')); // O not allowed
  assert.equal(modelYear('1HGCM82633A004352', new Date('2026-11-21')), 2003);
  assert.equal(modelYear('7SAYGDEE0PF000000', new Date('2026-11-21')), 2023); // P = 2023
  assert.equal(wmiMake('5YJ3E1EA0KF000000'), 'Tesla');
});

test('catalog matching', () => {
  const m = (d: object) => matchCatalog(d as never, cat).map((x) => x.vehicleId);
  assert.deepEqual(m({ make: 'Tesla', model: 'Model Y' }), ['model-y']);
  assert.deepEqual(m({ make: 'Ford', model: 'F-150', electrification: 'BEV (Battery Electric Vehicle)' }), ['f150-lightning']);
  assert.deepEqual(m({ make: 'Jeep', model: 'Wrangler', electrification: 'PHEV (Plug-in Hybrid Electric Vehicle)' }), ['wrangler-4xe']);
  assert.deepEqual(m({ make: 'Chevrolet', model: 'Equinox EV' }), ['equinox-ev']);
  assert.deepEqual(m({ make: 'Mercedes-Benz', model: 'EQB' }), ['eqb']);
  assert.deepEqual(m({ make: 'Ford', model: 'Mustang Mach-E' }), ['mach-e']);
  // gas Wrangler / F-150 must NOT map to the EV page as a model match
  assert.ok(matchCatalog({ make: 'Jeep', model: 'Wrangler' }, cat).every((x) => x.strength === 'make-only'));
  assert.ok(matchCatalog({ make: 'Ford', model: 'F-150' }, cat).every((x) => x.strength === 'make-only'));
  assert.deepEqual(m({ make: 'Honda', model: 'Civic' }), []);
});

test('true-scale zone maths', () => {
  const p = { lat: 34.05, lng: -118.25 };
  // rings hold true ground size at any zoom: px * mpp == metres
  for (const z of [14, 16, 18, 20]) {
    const mpp = metresPerPixel(p.lat, z);
    assert.ok(Math.abs((25 / mpp) * mpp - 25) < 1e-9);
  }
  assert.ok(Math.abs(metresPerPixel(0, 0) - 156543.03392) < 1e-6);
  assert.ok(Math.abs(metresPerPixel(p.lat, 17) - 2 * metresPerPixel(p.lat, 18)) < 1e-9);
  const q = offsetM(p, 25, 0);
  assert.ok(Math.abs(distanceM(p, q) - 25) < 0.05);
  assert.ok(Math.abs(bearingDeg(p, q) - 90) < 0.1);
  const n = offsetM(p, 0, 100);
  const s = toScreen(p, n, 0.5);
  assert.ok(Math.abs(s.x) < 1e-6 && Math.abs(s.y + 200) < 0.01);
  assert.equal(plumeHeading('NW'), 135); // FROM NW -> plume SE
  assert.equal(scaleBar(1).m, 100);
});

import { matchGuess, modelMatches, parseYears, ptCompatible, searchGuides, type Guide } from '../src/lib/match-core.ts';

const SEED = data.vehicles.map((v: { id: string; make: string; model: string; years: string; type: string }) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));
const G = (o: Partial<Guide>): Guide => ({ key: o.model + String(o.yearFrom), make: 'X', model: 'Y', years: '', yearFrom: null, yearTo: null, powertrain: '', docType: 'erg', sourceUrl: '', file: '', bytes: 1, ...o } as Guide);

test('open-world match: guess -> FULLCHARGE page', () => {
  assert.equal(matchGuess({ make: 'Tesla', model: 'Model Y', yearFrom: 2023, yearTo: 2023, powertrain: 'BEV' }, SEED, []).vehicleId, 'model-y');
  assert.equal(matchGuess({ make: 'Chevy', model: 'Equinox EV', powertrain: 'BEV' }, SEED, []).vehicleId, 'equinox-ev');
  assert.equal(matchGuess({ make: 'Ford', model: 'Mach-E', powertrain: 'BEV' }, SEED, []).vehicleId, 'mach-e');
  assert.equal(matchGuess({ make: 'Ford', model: 'F-150', powertrain: 'ICE' }, SEED, []).vehicleId, undefined); // gas F-150 ≠ Lightning
  assert.equal(matchGuess({ make: 'Jeep', model: 'Wrangler', powertrain: 'ICE' }, SEED, []).vehicleId, undefined);
  assert.equal(matchGuess({ make: 'Toyota', model: 'Prius Prime', powertrain: 'PHEV' }, SEED, []).vehicleId, 'prius-prime');
  assert.equal(matchGuess({ make: 'Honda', model: 'Civic', powertrain: 'ICE' }, SEED, []).vehicleId, undefined);
});

test('open-world match: guess -> NHTSA cut sheets', () => {
  const guides = [
    G({ make: 'Hyundai', model: 'IONIQ 6', years: '2023–2025', yearFrom: 2023, yearTo: 2025, powertrain: 'BEV' }),
    G({ make: 'Hyundai', model: 'IONIQ 5', years: '2022–present', yearFrom: 2022, yearTo: null, powertrain: 'BEV' }),
    G({ make: 'Toyota', model: 'Prius', years: '2023–present', yearFrom: 2023, powertrain: 'HEV' }),
    G({ make: 'Toyota', model: 'Prius', years: '2023–present', yearFrom: 2023, powertrain: 'PHEV' }),
    G({ make: 'Kia', model: 'Niro EV', years: '2019–2022', yearFrom: 2019, yearTo: 2022, powertrain: 'BEV' }),
  ];
  assert.deepEqual(matchGuess({ make: 'Hyundai', model: 'Ioniq 6', yearFrom: 2024 }, SEED, guides).guides.map((g) => g.model), ['IONIQ 6']);
  assert.equal(matchGuess({ make: 'Hyundai', model: 'Ioniq 6', yearFrom: 2018, yearTo: 2018 }, SEED, guides).guides.length, 0); // wrong years
  assert.deepEqual(matchGuess({ make: 'Toyota', model: 'Prius Prime', powertrain: 'PHEV' }, SEED, guides).guides.map((g) => g.powertrain), ['PHEV']);
  assert.equal(matchGuess({ make: 'Kia', model: 'Niro', powertrain: 'BEV' }, SEED, guides).guides.length, 1);
  assert.equal(searchGuides('ioniq', guides).length, 2);
  assert.equal(searchGuides('ioniq 6', guides).length, 1);
});

test('match helpers', () => {
  assert.ok(modelMatches('Model Y Long Range', 'Model Y'));
  assert.ok(!modelMatches('F-150', 'F-150 Lightning', 'ICE'));
  assert.ok(ptCompatible('BEV (Battery Electric Vehicle)', 'BEV'));
  assert.ok(!ptCompatible('PHEV', 'HEV'));
  assert.deepEqual(parseYears('2020–present'), { yearFrom: 2020, yearTo: null });
  assert.deepEqual(parseYears('2021-2024'), { yearFrom: 2021, yearTo: 2024 });
});

import { resolveLocal } from '../src/lib/match-core.ts';

test('updates never leave a gap', () => {
  const img = (k: string) => ({ '200': { bytes: 1, pages: [{ file: `img/${k}/200/p1.webp`, w: 1, h: 1, bytes: 1 }] }, '300': { bytes: 1, pages: [{ file: `img/${k}/300/p1.webp`, w: 1, h: 1, bytes: 1 }] } });
  const oldG = G({ key: 'mirai', make: 'Toyota', model: 'Mirai', docType: 'rescue_sheet', file: '', images: img('OLD') });
  const newG = { ...oldG, images: img('NEW') };
  const onDisk = new Set(['img/OLD/200/p1.webp']);
  const has = (f: string) => onDisk.has(f);
  assert.equal(resolveLocal(newG, [oldG], has, '200'), oldG);        // mid-update: old sheet still opens
  onDisk.add('img/NEW/200/p1.webp');
  assert.equal(resolveLocal(newG, [oldG], has, '200'), newG);        // new one lands: switches over
  assert.equal(resolveLocal(newG, [oldG], has, '300'), null);        // iPad set not downloaded
  assert.equal(resolveLocal(G({ key: 'x', file: 'pdfs/a.pdf' }), [], () => false, '200'), null);
});

import { plumePolygon, regionFor } from '../src/lib/geo.ts';

test('map plume + framing', () => {
  const p = { lat: 34.05, lng: -118.25 };
  const poly = plumePolygon(p, 135, 32, 100); // FROM NW -> plume heads SE, day 100 m ±32°
  assert.equal(poly.length, 18);
  for (const q of poly.slice(1)) assert.ok(Math.abs(distanceM(p, q) - 100) < 0.5); // arc is 100 m out
  const mid = poly[1 + 8]; // centre of the arc
  assert.ok(Math.abs(bearingDeg(p, mid) - 135) < 0.5);
  const r = regionFor(p, 500, 1);
  assert.ok(Math.abs(distanceM(p, { lat: p.lat + r.latitudeDelta / 2, lng: p.lng }) - 500) < 1);
});

import { bucketOf, bundleCount, groupForBundles, layout, planDownload } from '../src/lib/bundle-core.ts';

test('bundles: stable grouping + download plan', () => {
  const files = Array.from({ length: 1700 }, (_, i) => ({ file: `img/${i.toString(16).padStart(6, '0')}/200/p1.webp`, bytes: 200_000 }));
  const total = files.reduce((a, f) => a + f.bytes, 0); // 340 MB
  assert.equal(bundleCount(total), 8);
  const groups = groupForBundles(files);
  assert.equal(groups.reduce((a, g) => a + g.length, 0), 1700);              // nothing lost
  assert.ok(groups.every((g) => g.reduce((a, f) => a + f.bytes, 0) < 100_000_000)); // under the 100 MB bucket limit
  assert.equal(bucketOf(files[42].file, 8), bucketOf(files[42].file, 8));    // stable
  const ents = layout(groups[0]);
  assert.equal(ents[1].offset, ents[0].length);                              // back to back
  const bundles = groups.map((g, i) => ({ file: `bundles/b${i}.bin`, bytes: g.reduce((a, f) => a + f.bytes, 0), sha256: '', entries: layout(g) }));
  // first install: everything missing -> all bundles, no single files
  const p1 = planDownload(files, () => false, bundles);
  assert.equal(p1.bundles.length, 8); assert.equal(p1.files.length, 0);
  // small update: 3 files missing -> single files, no bundles
  const missing = new Set([files[1].file, files[500].file, files[900].file]);
  const p2 = planDownload(files, (f) => !missing.has(f), bundles);
  assert.equal(p2.bundles.length, 0); assert.equal(p2.files.length, 3);
  // no bundles published (older server) -> single files
  assert.equal(planDownload(files, () => false, undefined).files.length, 1700);
});
