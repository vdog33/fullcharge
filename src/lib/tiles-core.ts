// Offline aerial map tiles for map areas the crew draws in setup. Pure — unit-tested in node.
// Source: USGS The National Map "USGS Imagery Only" (public domain, no use restrictions, US + territories,
// cached to zoom 16 ≈ 2.4 m per pixel — plenty for a 100 m ring). Apple Maps stays the map with signal.
export const TILE_URL = (z: number, x: number, y: number) =>
  `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
export const ZMIN = 10, ZMAX = 16;
export const AVG_TILE_BYTES = 22_000; // measured-ish average JPEG; shown as an estimate
export const MAX_AREA_TILES = 6000;   // ~130 MB — one area at most
export const MAX_AREAS = 3;

export type BBox = { n: number; s: number; e: number; w: number };
export type Area = { id: string; name: string; box: BBox; tiles: number; done?: number; at?: number };

export function lon2x(lon: number, z: number) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
export function lat2y(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function* tilesIn(b: BBox, zmin = ZMIN, zmax = ZMAX): Generator<[number, number, number]> {
  for (let z = zmin; z <= zmax; z++) {
    const x0 = lon2x(b.w, z), x1 = lon2x(b.e, z), y0 = lat2y(b.n, z), y1 = lat2y(b.s, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield [z, x, y];
  }
}
export function countTiles(b: BBox, zmin = ZMIN, zmax = ZMAX): number {
  let n = 0;
  for (let z = zmin; z <= zmax; z++) n += (lon2x(b.e, z) - lon2x(b.w, z) + 1) * (lat2y(b.s, z) - lat2y(b.n, z) + 1);
  return n;
}
/** Map region (centre + span) → box. */
export function boxFromRegion(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }): BBox {
  return { n: r.latitude + r.latitudeDelta / 2, s: r.latitude - r.latitudeDelta / 2, e: r.longitude + r.longitudeDelta / 2, w: r.longitude - r.longitudeDelta / 2 };
}
/** Rough width × height of a box in km, for the label. */
export function boxKm(b: BBox): { w: number; h: number } {
  const h = (b.n - b.s) * 111.32;
  const w = (b.e - b.w) * 111.32 * Math.cos((((b.n + b.s) / 2) * Math.PI) / 180);
  return { w, h };
}
/** Rough check the box is in the US / territories where USGS imagery exists. */
export const inUsgsCoverage = (b: BBox) => {
  const lat = (b.n + b.s) / 2, lon = (b.e + b.w) / 2;
  return (lat > 17 && lat < 72 && lon > -180 && lon < -64) || (lat > 13 && lat < 21 && lon > 144 && lon < 146);
};
