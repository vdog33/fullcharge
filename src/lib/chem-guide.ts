// Which ERG guide applies, from the powertrain on the NHTSA cut sheet (BEV | PHEV | HEV | FCEV).
// ERG 2024: lithium-ion AND sodium-ion = Guide 147; NiMH = 171; hydrogen fuel-cell vehicle = 115;
// lithium-metal = 138. We only know powertrain, not cell chemistry, so hybrids get a "check the label" note
// and default to 147 (the cautious choice) — never a guess that a model is NiMH.
export type ErgCheck = { tone: 'danger' | 'warn' | 'none'; title: string; text: string; guides: string[] };

export const ERG_GUIDE_PDF = (n: string) => `https://cameochemicals.noaa.gov/erg_guides/en/Guide_${n}.pdf`;

export function ergFor(powertrain?: string | null): ErgCheck {
  const p = (powertrain ?? '').toUpperCase();
  if (p.includes('FCEV') || p.includes('FUEL CELL') || p.includes('HYDROGEN')) {
    return {
      tone: 'danger', title: 'Hydrogen fuel cell — not just Guide 147',
      text: 'Hydrogen tanks: ERG Guide 115 (flammable gas). Traction battery: Guide 147.', guides: ['115', '147'],
    };
  }
  if (p === 'HEV' || (p.includes('HYBRID') && !p.includes('PLUG'))) {
    return {
      tone: 'warn', title: 'Hybrid — battery may be NiMH',
      text: 'NiMH = ERG Guide 171. Lithium-ion = Guide 147. Check the battery label on the sheet. Unsure: use 147.', guides: ['171', '147'],
    };
  }
  return { tone: 'none', title: '', text: '', guides: ['147'] };
}

/** One line for the Guide 147 page. */
export const NOT_147 = 'Not 147: hydrogen fuel-cell car → Guide 115 · NiMH hybrid battery → 171 · lithium-metal → 138 · 12V lead-acid → 154.';
