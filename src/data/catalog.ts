import raw from './fullcharge-data.json';

export type Vehicle = {
  id: string;
  make: string;
  model: string;
  years: string;
  type: string;
  chemistry: string;
  chemistry_verified: boolean | 'partial';
  pack: string;
  cut_loop: string;
  lv_location: string;
  no_cut_zones: string;
  airbag_hv: string;
  tow: string;
  release: string;
  id_cues: string[];
  erg_pdf_url: string;
  erg_pdf_label: string;
  erg_verified_note: string;
  watch_for?: string;
  warning?: string;
};

export type Bess = {
  id: string;
  name: string;
  chemistry: 'LFP' | 'NMC' | string;
  chemistry_verified: boolean;
  kwh_usable: string;
  coupling: string;
  disconnect: string;
  contact_name: string;
  contact_phone: string | null;
  contact_note: string;
  shutdown_verified: boolean;
  shutdown_steps: string[] | 'GENERIC_NEC_70615';
  recalls: string | null;
};

type Data = typeof raw;
export const DATA = raw as unknown as Data & { vehicles: Vehicle[]; bess: Bess[] };

export const VEHICLES: Vehicle[] = [...DATA.vehicles].sort(
  (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model),
);
export const BESS: Bess[] = DATA.bess;
export const GENERIC_SHUTDOWN = DATA.generic_shutdown;
export const ERG147 = DATA.hazmat_erg_147;
export const ZONES = DATA.zone_map;
export const BESS_CHEM = DATA.bess_chemistry;
export const SHARED_CONTACTS = DATA.shared_contacts;
export const DATA_VERSION = DATA.data_version;

export const getVehicle = (id: string) => VEHICLES.find((v) => v.id === id);
export const getBess = (id: string) => BESS.find((b) => b.id === id);
export const makes = () => [...new Set(VEHICLES.map((v) => v.make))].sort();

export function shutdownSteps(b: Bess): { steps: string[]; verified: boolean; title: string } {
  if (Array.isArray(b.shutdown_steps)) return { steps: b.shutdown_steps, verified: b.shutdown_verified, title: 'Shutdown' };
  return { steps: GENERIC_SHUTDOWN.steps, verified: false, title: GENERIC_SHUTDOWN.title };
}

/** Guide 147 chemistry label — taken ONLY from the vehicle/BESS tables (packet §e). */
export type ChemFamily = 'NMC' | 'LFP' | 'MIXED' | 'UNKNOWN';
export function chemFamily(kind: 'vehicle' | 'bess', id: string): { family: ChemFamily; label: string } {
  if (kind === 'bess') {
    const b = getBess(id);
    if (b?.chemistry === 'LFP') return { family: 'LFP', label: 'LFP (verified)' };
    if (b?.chemistry === 'NMC') return { family: 'NMC', label: 'NMC (verified)' };
    return { family: 'UNKNOWN', label: 'Chemistry not verified — treat as lithium-ion, Guide 147' };
  }
  if (id === 'model-y') return { family: 'MIXED', label: getVehicle(id)!.chemistry };
  if (id === 'wrangler-4xe') return { family: 'NMC', label: 'NMC (verified)' };
  return { family: 'UNKNOWN', label: 'Chemistry not verified for this trim — treat as lithium-ion, Guide 147' };
}

export function searchVehicles(q: string, make?: string): Vehicle[] {
  const s = q.trim().toLowerCase();
  return VEHICLES.filter((v) => {
    if (make && v.make !== make) return false;
    if (!s) return true;
    return `${v.make} ${v.model} ${v.years} ${v.type}`.toLowerCase().includes(s);
  });
}

/** Safe URL for manufacturer PDFs: keep verbatim, only encode raw spaces (Kia). Never double-encode (Ioniq 5 has %20). */
export const pdfUrl = (u: string) => u.replace(/ /g, '%20');
