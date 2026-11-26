// Callouts: boxes drawn on a manufacturer rescue sheet so crews see the cut loop, 12V, HV disconnect at a glance.
// Coordinates are fractions (0–1) of the page image, so they fit any image size (iPhone 200 / iPad 300 set).
// SAFETY: boxes are proposed by a script (Gemini vision) and are NEVER shown in the app until a person has
// checked them against the sheet and confirmed the whole sheet in tools/callouts/review.html.
// Pure — no React Native imports, unit-tested in node.

export type CalloutKind = 'cut_loop' | 'lv_battery' | 'hv_disconnect' | 'do_not_cut';
export const KINDS: Record<CalloutKind, { label: string; short: string }> = {
  cut_loop: { label: 'Cut loop', short: 'Cut loop' },
  lv_battery: { label: '12V / low-voltage battery', short: '12V' },
  hv_disconnect: { label: 'HV disconnect / service plug', short: 'HV disconnect' },
  do_not_cut: { label: 'Do not cut', short: 'No cut' },
};

export type Box = {
  kind: CalloutKind;
  page: number;            // 0-based page of the sheet
  x: number; y: number; w: number; h: number; // fractions of the page image
  note?: string;           // short, from the sheet's own wording ("under frunk lining")
};
export type CalloutSheet = {
  guideKey: string;
  title: string;           // "Tesla Model 3 2024 rescue sheet" — for the review tool
  status: 'proposed' | 'confirmed';
  confirmedBy?: string;
  confirmedAt?: string;    // ISO date
  boxes: Box[];
};
export type CalloutFile = { version: string; imageBase?: string; sheets: Record<string, CalloutSheet & { pages?: { file: string; w: number; h: number }[] }> };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const valid = (b: Box) => b && b.kind in KINDS && Number.isInteger(b.page) && b.page >= 0 && b.w > 0.005 && b.h > 0.005 && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.001 && b.y + b.h <= 1.001;

/** Only confirmed sheets reach the screen; ordered cut loop → 12V → HV disconnect → no-cut, then top-to-bottom. */
export function confirmedFor(file: CalloutFile | null, guideKey: string): (CalloutSheet & { boxes: Box[] }) | null {
  const s = file?.sheets?.[guideKey];
  if (!s || s.status !== 'confirmed' || !s.confirmedBy) return null;
  const order: CalloutKind[] = ['cut_loop', 'lv_battery', 'hv_disconnect', 'do_not_cut'];
  const boxes = (s.boxes ?? []).filter(valid).map((b) => ({ ...b, x: clamp01(b.x), y: clamp01(b.y) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.page - b.page || a.y - b.y);
  return boxes.length ? { ...s, boxes } : null;
}

/** Page to show as the big picture: the one holding the most boxes (first page on a tie). */
export function mainPage(boxes: Box[]): number {
  const n = new Map<number, number>();
  boxes.forEach((b) => n.set(b.page, (n.get(b.page) ?? 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

/** Gemini box_2d [ymin, xmin, ymax, xmax] on a 0–1000 grid → fractions. */
export function fromBox2d(b: number[]): { x: number; y: number; w: number; h: number } | null {
  if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number')) return null;
  const [y0, x0, y1, x1] = b.map((v) => clamp01(v / 1000));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Region of the page to show for one item: the box plus room around it so you can see where on the car it is
 *  (at least 30% of the page wide), kept on the page. Fractions of the page. */
export function cropFor(b: Pick<Box, 'x' | 'y' | 'w' | 'h'>, pageW: number, pageH: number): { x: number; y: number; w: number; h: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let w = Math.min(1, Math.max(0.3, b.w * 2.2));
  // Height in page fractions for a 4:3 view, at least the box height plus margin.
  let h = Math.min(1, Math.max(b.h * 1.8, (w * pageW * 0.75) / pageH));
  w = Math.min(1, Math.max(w, (h * pageH) / (pageW * 1.6))); // never taller than 1.6 : 1
  const x = Math.min(1 - w, Math.max(0, cx - w / 2)), y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}
