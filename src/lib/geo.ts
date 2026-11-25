// Web-mercator + great-circle helpers for the zone map. Pure — unit-tested.
export type LatLng = { lat: number; lng: number };
const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const ZOOM_MIN = 14;
export const ZOOM_MAX = 20;
export const ZOOM_DEFAULT = 18;

/** metres per CSS pixel at a given zoom (packet formula). Same state drives embed zoom + overlay. */
export const metresPerPixel = (lat: number, zoom: number) => (156543.03392 * Math.cos(rad(lat))) / 2 ** zoom;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Move a point by dx (east) / dy (north) metres. */
export function offsetM(p: LatLng, eastM: number, northM: number): LatLng {
  return { lat: p.lat + deg(northM / R), lng: p.lng + deg(eastM / (R * Math.cos(rad(p.lat)))) };
}

/** Screen offset (px, y down) of b relative to a, at mpp. */
export function toScreen(a: LatLng, b: LatLng, mpp: number) {
  const north = rad(b.lat - a.lat) * R;
  const east = rad(b.lng - a.lng) * R * Math.cos(rad(a.lat));
  return { x: east / mpp, y: -north / mpp };
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Compass = (typeof COMPASS)[number];
export const compassDeg = (c: Compass) => COMPASS.indexOf(c) * 45;
/** Wind FROM → plume heads opposite (FROM NW → plume SE). */
export const plumeHeading = (from: Compass) => (compassDeg(from) + 180) % 360;
/** Nearest of the 8 compass points for a bearing in degrees. */
export const toCompass = (deg: number): Compass => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
/** Average of bearings that wraps correctly (350° and 10° average to 0°, not 180°). */
export function circularMean(degs: number[]): number {
  const x = degs.reduce((a, d) => a + Math.cos(rad(d)), 0), y = degs.reduce((a, d) => a + Math.sin(rad(d)), 0);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** Smallest angle between two bearings, 0–180. */
export const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** SVG path for a plume wedge, centre (cx,cy), heading deg (0 = up/north), half-angle, length px. */
export function wedgePath(cx: number, cy: number, headingDeg: number, halfDeg: number, lenPx: number): string {
  const pt = (a: number) => [cx + lenPx * Math.sin(rad(a)), cy - lenPx * Math.cos(rad(a))];
  const [x1, y1] = pt(headingDeg - halfDeg);
  const [x2, y2] = pt(headingDeg + halfDeg);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${lenPx} ${lenPx} 0 0 1 ${x2} ${y2} Z`;
}

/** Pick a scale bar from the packet's choices (500/200/100/50/20/10 m) that fits maxPx. */
export function scaleBar(mpp: number, maxPx = 120) {
  for (const m of [500, 200, 100, 50, 20, 10]) if (m / mpp <= maxPx) return { m, px: m / mpp };
  return { m: 10, px: 10 / mpp };
}

export const M_TO_FT = 3.28084;

/** Plume wedge as real-world coordinates (for map polygons): apex at the fire, arc at lenM, heading ± half-angle. */
export function plumePolygon(fire: LatLng, headingDeg: number, halfDeg: number, lenM: number, steps = 16): LatLng[] {
  const pts: LatLng[] = [fire];
  for (let i = 0; i <= steps; i++) {
    const a = rad(headingDeg - halfDeg + (2 * halfDeg * i) / steps);
    pts.push(offsetM(fire, lenM * Math.sin(a), lenM * Math.cos(a)));
  }
  return pts;
}

/** Map region (lat/lng deltas) that frames a circle of radiusM around a point, with a margin. */
export function regionFor(p: LatLng, radiusM: number, margin = 1.25) {
  const dLat = deg((radiusM * margin) / R) * 2;
  const dLng = deg((radiusM * margin) / (R * Math.cos(rad(p.lat)))) * 2;
  return { latitude: p.lat, longitude: p.lng, latitudeDelta: dLat, longitudeDelta: dLng };
}
