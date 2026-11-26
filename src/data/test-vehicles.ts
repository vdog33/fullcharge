// Beta "Test" list: the 20 vehicles we prove the dissected cut sheets on first (Vince, 26 Nov 2026).
// Top US EV sellers + common ones that cover other cases (hybrid → possible NiMH, hydrogen → Guide 115).
// A vehicle with no cut sheet in the app shows as MISSING — that's a gap in the data to fix.
export type TestVehicle = { make: string; model: string; why?: string };
export const TEST_VEHICLES: TestVehicle[] = [
  { make: 'Tesla', model: 'Model Y' }, { make: 'Tesla', model: 'Model 3' }, { make: 'Tesla', model: 'Cybertruck' },
  { make: 'Hyundai', model: 'IONIQ 5' }, { make: 'Chevrolet', model: 'Equinox EV' }, { make: 'Chevrolet', model: 'Bolt' },
  { make: 'Ford', model: 'Mustang Mach-E' }, { make: 'Ford', model: 'F-150 Lightning' }, { make: 'Honda', model: 'Prologue' },
  { make: 'Cadillac', model: 'Lyriq' }, { make: 'Rivian', model: 'R1S' }, { make: 'Rivian', model: 'R1T' },
  { make: 'Lexus', model: 'RZ' }, { make: 'Kia', model: 'EV6' }, { make: 'Kia', model: 'EV9' },
  { make: 'Nissan', model: 'Leaf' }, { make: 'Toyota', model: 'Prius', why: 'hybrid — tests the possible-NiMH check' },
  { make: 'Toyota', model: 'Mirai', why: 'hydrogen — tests the Guide 115 check' }, { make: 'BMW', model: 'iX' },
  { make: 'Volkswagen', model: 'ID.4' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Does a cut-sheet entry belong to this test vehicle? Make must match; model must start with the test name
 *  ("Bolt" ↔ "Bolt EV", "Bolt EUV"; "Prius" ↔ "Prius Prime"), so "EV6" never pulls in "EV9". */
export function isTestMatch(t: TestVehicle, g: { make: string; model: string }): boolean {
  const mk = norm(g.make), tm = norm(t.make);
  if (mk !== tm && !(tm === 'chevrolet' && mk === 'chevy') && !(tm === 'volkswagen' && mk === 'vw')) return false;
  const m = norm(g.model), want = norm(t.model);
  if (!m.startsWith(want)) return false;
  const next = m.slice(want.length, want.length + 1);
  return !next || !/\d/.test(next); // "ix" must not match "ix3"
}
