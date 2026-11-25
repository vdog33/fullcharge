// WCAG 2.2 contrast checks for the theme. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../src/theme.ts';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = 4.5;     // WCAG 1.4.3 normal text
const NON_TEXT = 3;   // WCAG 1.4.11 control edges, focus/selection indicators

const pairs: [string, string, string, number][] = [
  ['body text on page', C.text, C.bg, TEXT],
  ['body text on card', C.text, C.surface, TEXT],
  ['muted text on page', C.muted, C.bg, TEXT],
  ['muted text on card', C.muted, C.surface, TEXT],
  ['muted text on raised button', C.muted, C.surface2, TEXT],
  ['red text on page', C.redText, C.bg, TEXT],
  ['red text on card', C.redText, C.surface, TEXT],
  ['white on red button', C.text, C.red, TEXT],
  ['black on yellow (hazmat / warnings)', C.hazmatText, C.hazmat, TEXT],
  ['black on selected chip', C.onLight, C.text, TEXT],
  ['yellow text on page', C.hazmat, C.bg, TEXT],
  ['green status text on card', C.you, C.surface, TEXT],
  ['control edge on page', C.control, C.bg, NON_TEXT],
  ['control edge on card', C.control, C.surface, NON_TEXT],
  ['selected chip fill vs page', C.text, C.bg, NON_TEXT],
];

for (const [name, fg, bg, min] of pairs) {
  test(`contrast: ${name} ≥ ${min}:1`, () => {
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
  });
}
