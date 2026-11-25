// FULLCHARGE design system v2 (design sheet, 24 Nov 2026). Dark only, by design.
// One colour, one meaning:
//   red fill  = primary action (camera ID, take photo, isolation zones) — white text only
//   redText   = danger / recall / document-type labels on dark
//   hazmat    = ERG 147, warnings, the one recommended action
//   green     = verified, works offline, signal good
// Contrast (on #0B0B0B / #161616): text 19:1, text2 ≥ 11:1, redText 6.6:1, line 3.7:1 (control edges).
export const C = {
  bg: '#0B0B0B',
  surface: '#161616',
  surface2: '#202020',
  line: '#6B6B6B',     // every control edge (3:1+ non-text contrast)
  border: '#2E2E2E',   // dividers between rows only — never a control edge
  text: '#FFFFFF',
  muted: '#C8C8C8',    // secondary text, 15px minimum
  red: '#D00000',
  redText: '#FF6B5E',
  hazmat: '#FFD60A',
  hazmatText: '#0B0B0B',
  warnBg: '#2A2300',
  green: '#7EE2A0',
  focus: '#FFD60A',
  // map zones — only on the map and its legend, always with a line style too
  hot: '#E53935',
  gold: '#F59E0B',     // quarantine (dashed)
  warm: '#F5C518',
  cold: '#4FC3F7',
  plume: '#9B1C1C',
  you: '#34D399',
} as const;

export const F = {
  black: 'Archivo_900Black',
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  narrow: 'ArchivoNarrow_600SemiBold',
  narrowBold: 'ArchivoNarrow_700Bold',
  body: undefined as string | undefined, // system font (Atkinson Hyperlegible not bundled yet)
};

/** Type scale. Body 18, floor 15, buttons 17–24. Sizes scale with the phone's text setting. */
export const T = {
  display: 32, title: 30, action: 23, section: 22, btn: 19, btnSm: 17, btnXl: 24,
  body: 18, bodySm: 17, meta: 15, label: 15,
};

/** 4px grid. Targets: 56 standard, 48 floor, 60–76 primary. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, gap: 6, block: 14 };
export const R = { card: 14, inner: 10, chip: 24 };
export const TARGET = { min: 48, std: 56, btn: 60, sm: 52, xl: 76 };
