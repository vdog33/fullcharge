import { USE_MOCKS } from '../config';
import { VEHICLES } from '../data/catalog';
import {
  CatalogMatch, Decoded, checkDigitOk, looksLikeVin, matchCatalog, modelYear, normalizeVin, wmiMake,
} from './vin-core';

export type VinResult = {
  vin: string;
  decoded: Decoded;
  matches: CatalogMatch[];
  source: 'nhtsa-vpic' | 'offline-wmi' | 'mock';
  warnings: string[];
};

const MOCK_DECODES: Record<string, Decoded> = {
  '7SAYGDEEXPF000001': { make: 'Tesla', model: 'Model Y', year: 2023, electrification: 'BEV (Battery Electric Vehicle)' },
  '1C4JJXP63MW000002': { make: 'Jeep', model: 'Wrangler', year: 2021, trim: 'Unlimited Sahara 4xe', electrification: 'PHEV (Plug-in Hybrid Electric Vehicle)' },
};

/** VIN → decode → catalog candidates. Online: NHTSA vPIC (public, no key). Offline: WMI make + year only. */
export async function lookupVin(input: string): Promise<VinResult> {
  const vin = normalizeVin(input);
  const warnings: string[] = [];
  if (!looksLikeVin(vin)) throw new Error('VIN must be 17 characters (no I, O or Q).');
  if (!checkDigitOk(vin)) warnings.push('Check digit does not match — re-read the VIN (non-US VINs may differ).');

  if (USE_MOCKS) {
    const decoded = MOCK_DECODES[vin] ?? { make: wmiMake(vin) ?? undefined, year: modelYear(vin) };
    return { vin, decoded, matches: matchCatalog(decoded, VEHICLES), source: 'mock', warnings };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: ctrl.signal });
    clearTimeout(t);
    const r = (await res.json())?.Results?.[0] ?? {};
    const decoded: Decoded = {
      make: titleCase(r.Make), model: r.Model || undefined, trim: r.Trim || r.Series || undefined,
      year: r.ModelYear ? Number(r.ModelYear) : modelYear(vin),
      electrification: r.ElectrificationLevel || undefined,
    };
    return { vin, decoded, matches: matchCatalog(decoded, VEHICLES), source: 'nhtsa-vpic', warnings };
  } catch {
    warnings.push('No signal — offline decode: make + year only. Pick the model.');
    const decoded: Decoded = { make: wmiMake(vin) ?? undefined, year: modelYear(vin) };
    return { vin, decoded, matches: matchCatalog(decoded, VEHICLES), source: 'offline-wmi', warnings };
  }
}

const titleCase = (s?: string) =>
  s ? s.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()).replace('Bmw', 'BMW').replace('Gmc', 'GMC') : undefined;
