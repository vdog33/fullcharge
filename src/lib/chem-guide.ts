// Which ERG guide applies, from the powertrain on the NHTSA cut sheet (BEV | PHEV | HEV | FCEV).
// ERG 2024: lithium-ion AND sodium-ion = Guide 147; NiMH = 171; hydrogen fuel-cell vehicle = 115;
// lithium-metal = 138. Chemistry printed on the maker's sheet (approved) decides; without it, hybrids get a "check the label" note
// and default to 147 (the cautious choice) — never a guess that a model is NiMH.
export type ErgCheck = { tone: 'danger' | 'warn' | 'none'; title: string; text: string; guides: string[] };

export const ERG_GUIDE_PDF = (n: string) => `https://cameochemicals.noaa.gov/erg_guides/en/Guide_${n}.pdf`;

/** chem = the battery chemistry printed on the manufacturer's sheet (approved on the PC). When we have it, it wins
 *  over the powertrain guess: a hybrid whose sheet says lithium-ion is plain 147; one that says NiMH is 171. */
export function ergFor(powertrain?: string | null, chem?: string | null): ErgCheck {
  const p = (powertrain ?? '').toUpperCase();
  const fc = p.includes('FCEV') || p.includes('FUEL CELL') || p.includes('HYDROGEN');
  if (chem === 'nimh') {
    return {
      tone: 'warn', title: fc ? 'Hydrogen fuel cell + NiMH battery' : 'NiMH battery — Guide 171, not 147',
      text: fc ? 'Hydrogen tanks: ERG Guide 115. Traction battery is nickel-metal hydride (per the manufacturer sheet): Guide 171.'
        : 'The manufacturer sheet lists a nickel-metal hydride traction battery: ERG Guide 171.', guides: fc ? ['115', '171'] : ['171'],
    };
  }
  if (chem === 'lithium-metal') {
    return { tone: 'warn', title: 'Lithium-metal battery — Guide 138', text: 'The manufacturer sheet lists a lithium-metal battery: ERG Guide 138.', guides: fc ? ['115', '138'] : ['138'] };
  }
  if ((chem === 'lithium-ion' || chem === 'sodium-ion') && !fc) return { tone: 'none', title: '', text: '', guides: ['147'] };
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
