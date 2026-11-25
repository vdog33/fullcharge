// Static on-scene content, from the handoff packet. Short lines only.

export const EV_FIRST_MOVES = [
  'ID vehicle (camera / search) — open ERG before cutting',
  'Immobilise: chock, Park / brake. No engine noise ≠ off',
  '321: 300 ft out if not in gear · release only under 200°F · 150 ft fire-attack position',
  'Cut loop per ERG page — call out, cutter repeats back',
  'Hold LV while you need powered seats / doors — unless page says otherwise (Wrangler 4xe = trade-off)',
  'No-cut: blue / orange / yellow cables, airbag cylinders, pack',
  'Boron / UHSS (22MnB5, ~1500 MPa) fractures, does not shear — expect tool stall + sudden break',
  'Runaway signs: white vapor, hissing, flames. Gear + SCBA on for any damaged EV',
  'EVR app / ERG on scene — no VIN check needed to start',
];

export const STANDARD_RELEASE =
  'Quarantine 50 ft from structures. TIC check before release: smoke, sound, rising temp. Escort the tow. Stranded energy lasts months — moving it can short + reignite.';

export const BESS_NO_FIRE = [
  'Size up from door: smoke, smell, hissing, heat, no flame = venting = pre-fire',
  'Full PPE + SCBA before touching unit — 4-gas does not read HF / HCN',
  'Evacuate house + garage. Keep people + ignition sources out of gas spaces',
  'Shut down via its card — meter pull alone does NOT kill it (can island + stay live)',
  'Call local utility emergency line + manufacturer line (on the card)',
  'TIC + log temps. Rising temp after shutdown = escalating',
  "Don't open enclosure. Don't move a hot / venting unit",
  'Written handoff: what was shut down, TIC readings + times, who was notified',
];

export const BESS_ON_FIRE = [
  "Fight cabin / garage first, regular handline — nothing stops runaway; water's job is structure + exposures",
  "Water can't reach sealed cells — battery burns out on its own timeline (minutes to hours), reignition for days",
  'Full PPE / SCBA through overhaul — vent gas HF + hydrogen',
  'Deflagration watch: gas in a closed garage can light off when opened — ventilate deliberately from a protected position',
  "Shut down what's safe (breakers / disconnects outside hazard area). Never open a burning unit",
  'After flames out, stranded energy remains — check smoke, sound, temp before release; moving it can short + reignite',
  'Quarantine 50 ft from structures, TIC re-checks logged, escorted removal, written handoff',
];

export const SIZE_UP = {
  intro: ['No pre-plans for home batteries.', 'Size it up when already there — medical aid, lift assist, alarm check. Two minutes.'],
  spot: [
    'Garage wall battery (flat white / gray box), inverter, conduit, labelled ESS disconnect',
    'Exterior battery / Gateway / System Controller, solar inverter, meter placards',
    'Roof solar + battery = house can island — meter pull ≠ safe',
    'Note brand + which wall — brand = chemistry + shutdown card in this app',
  ],
  ask: ['"Home battery or solar?"', '"Ever made noise, smelled odd, red light?"', '"Where\'s your panel?" — breakers + disconnects live there'],
};

export const BESS_CHEM_MORE = {
  lfp: 'LFP (PW3, Enphase 5P, FranklinWH): onset ~518°F — later, less violent. Vent gas ~41% hydrogen — deflagration risk in closed spaces. Ventilate, no ignition sources, don\'t open a gassing unit indoors.',
  nmc: 'NMC (PW2, SolarEdge, LG, Generac, Panasonic): onset ~320–410°F — earlier, faster, releases its own oxygen.',
  both: 'Both vent HF + toxics. HF IDLH 30 ppm. 4-gas does NOT read HF / HCN — clean 4-gas ≠ safe air. SCBA. White vapor, hissing, popping, sweet / chemical smell = venting cells — warning before fire.',
};

export const BESS_FAIL_POINTS =
  'BMS ~46% of failures · inverters ~43% · cells / modules ~11% (dendrites / internal shorts after damage — looks fine, shorts later); then connections, cooling, water intrusion, damage, DIY / mismatched packs. Sequence: venting (vapor, hissing) → smoke → flame → reignition risk for days. Stranded energy stays after shutdown + after fire.';

// DOT ERG 2024 Guide 147 (US government work), sections as summarised in the packet.
export const GUIDE_147_SECTIONS: { h: string; lines: string[] }[] = [
  { h: 'Fire / explosion', lines: [
    'Flammable liquid electrolyte may vent / ignite / spark above 150°C (302°F) when damaged or abused',
    'May burn rapidly with flare-burning effect',
    'May ignite other batteries in close proximity',
  ] },
  { h: 'Health', lines: [
    'Electrolyte irritates skin, eyes, mucous membranes',
    'Fire produces irritating, corrosive, toxic gases',
    'Burning batteries may produce toxic hydrogen fluoride gas — see Guide 125',
    'Fumes may cause dizziness or asphyxiation',
  ] },
  { h: 'Public safety', lines: [
    'CALL 911, then shipping-paper emergency number, else inside-back-cover number',
    'Keep unauthorized personnel away',
    'Stay upwind, uphill and / or upstream',
    'Ventilate closed spaces before entering — only if trained / equipped',
  ] },
  { h: 'Protective clothing', lines: [
    'Positive-pressure SCBA',
    'Structural firefighting clothing: thermal protection, only limited chemical protection',
  ] },
  { h: 'Evacuation', lines: [
    'Isolate spill / leak 25 m (75 ft), all directions',
    'Spill: increase the 25 m (75 ft) distance downwind as necessary',
    'Rail / trailer fire: ISOLATE 500 m (1/3 mile), all directions — evacuate everyone incl. responders',
  ] },
  { h: 'Fire', lines: [
    'Reignition possible up to weeks later',
    'Thermal imaging — monitor continuously',
    'Reignition signs: white smoke off-gassing, electrical arcs / sparks, visible flames',
    'CAUTION: no salt water',
  ] },
  { h: 'Vehicle fire', lines: [
    'Battery not connected to a vehicle: use the small-fire guidance',
    "Check manufacturer's specific ERG before disabling",
    'Ignition off + disconnect 12V if safe',
    'Never cut HV / MV cabling',
    'Never touch damaged / submerged HV / MV cables or components',
    'Large amount of water to extinguish / suppress HV battery fire — small amount could release toxic gases',
    'If possible spray water directly onto battery',
    'DO NOT pierce / cut / pry / dismantle structure to access battery — HV contact can cause electric shock',
  ] },
  { h: 'Small / large fire', lines: [
    'Small battery: water spray only, large amounts. No dry chemical, CO2 or Halon',
    'Large fire: let battery burn itself out, protect surroundings',
    'Safely remove undamaged containers; water spray on neighbouring batteries',
  ] },
  { h: 'Spill / leak', lines: [
    'Eliminate ignition sources',
    'Do not touch / walk through spilled material',
    'Absorb with earth, sand or other non-combustible',
    'Leaking batteries + contaminated absorbent into metal containers',
  ] },
  { h: 'First aid', lines: ['Refer to General First Aid section'] },
];
