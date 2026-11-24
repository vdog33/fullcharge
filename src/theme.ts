// Dark mode only. Red = fire ONLY. Yellow = hazmat ONLY.
export const C = {
  bg: '#0A0A0A',
  surface: '#161616',
  surface2: '#1F1F1F',
  red: '#E10600',
  text: '#F5F5F5',
  muted: '#9A9A9A',
  border: '#2E2E2E',
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

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
