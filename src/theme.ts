// Dark mode only. Red = fire ONLY. Yellow = hazmat / safety caveats ONLY.
// Contrast ratios below are WCAG 2.2 against bg #0A0A0A / surface #161616 (checked by scripts/contrast.test.ts).
export const C = {
  bg: '#0A0A0A',
  surface: '#161616',
  surface2: '#1F1F1F',
  red: '#E10600',       // FILL ONLY (buttons, rings, markers) — white text on it is 5.0:1. Never use as text colour.
  redText: '#FF6B5E',   // red TEXT on dark — 6.6:1 on surface (WCAG 1.4.3)
  text: '#F5F5F5',
  onLight: '#000000',   // text on white / yellow fills (selected chips, warnings)
  muted: '#9A9A9A',     // secondary text — 6.3:1 on surface
  border: '#2E2E2E',    // decorative dividers only — NOT for control edges
  control: '#6B6B6B',   // edges of buttons, inputs, chips — 3.7:1 (WCAG 1.4.11 non-text contrast)
  hazmat: '#FFD60A',
  hazmatText: '#000000',
  gold: '#E3A008',
  you: '#4ade80',
  cold: '#38bdf8',
} as const;

export const F = {
  display: 'Archivo_800ExtraBold',
  displayBold: 'Archivo_700Bold',
  narrow: 'ArchivoNarrow_600SemiBold',
  narrowBold: 'ArchivoNarrow_700Bold',
  body: undefined as string | undefined, // system-ui
};

/**
 * Type scale (WCAG 1.4.4). Responders read at arm's length, in sun or at night, under stress.
 * 15 is the floor — nothing smaller anywhere. All Text scales with the phone's text-size setting
 * (allowFontScaling is on by default); never put text inside a fixed-height box — use minHeight.
 */
export const T = {
  floor: 15,   // captions, badges, metadata
  label: 15,   // uppercase section labels
  body: 18,
  btn: 20,     // button titles
  btnBig: 23,
  h2: 20,
  h1: 30,
};

/** Touch targets (WCAG 2.5.5 AAA) sized for gloved hands. Gaps between targets: S.sm (8). */
export const TAP = { min: 48, primary: 56 };

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
