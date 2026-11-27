// Current weather at the scene: temperature, wind speed and the direction the wind comes FROM.
// NWS (api.weather.gov — nearest official station, US) first; Open-Meteo (model, worldwide) if NWS has no reading.
// Fills the map's wind automatically; "Face the wind" or a manual pick always overrides it.
import { LatLng } from './geo';

export type Weather = {
  tempF: number | null; windFromDeg: number | null; windMph: number | null; gustMph: number | null;
  source: string; observedAt: number; // ms
};
const UA = { 'User-Agent': 'FULLCHARGE responder app (github.com/vdog33/fullcharge)', Accept: 'application/geo+json' };
let cache: { at: LatLng; t: number; w: Weather } | null = null;
const kmhToMph = (v: number) => v * 0.621371;
const cToF = (c: number) => c * 9 / 5 + 32;
const near = (a: LatLng, b: LatLng) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lng - b.lng) < 0.05;

async function j(url: string, ms = 6000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}

async function nws(p: LatLng): Promise<Weather | null> {
  const pt = await j(`https://api.weather.gov/points/${p.lat.toFixed(4)},${p.lng.toFixed(4)}`);
  const st = await j(pt.properties.observationStations);
  for (const f of (st.features ?? []).slice(0, 3)) {
    const id = f.properties.stationIdentifier;
    const o = (await j(`https://api.weather.gov/stations/${id}/observations/latest`)).properties;
    const at = Date.parse(o.timestamp);
    if (!o || Date.now() - at > 2 * 3600_000) continue; // stale reading → try the next station
    const v = (x: { value: number | null } | undefined) => (x && x.value != null ? x.value : null);
    const spd = v(o.windSpeed), gust = v(o.windGust), dir = v(o.windDirection), t = v(o.temperature);
    if (dir == null && spd == null && t == null) continue;
    return {
      tempF: t != null ? Math.round(cToF(t)) : null, windFromDeg: dir != null && (spd ?? 0) > 0 ? Math.round(dir) % 360 : null,
      windMph: spd != null ? Math.round(kmhToMph(spd)) : null, gustMph: gust != null ? Math.round(kmhToMph(gust)) : null,
      source: `NWS ${id}`, observedAt: at,
    };
  }
  return null;
}

async function openMeteo(p: LatLng): Promise<Weather | null> {
  const d = await j(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`);
  const c = d?.current;
  if (!c) return null;
  return {
    tempF: c.temperature_2m != null ? Math.round(c.temperature_2m) : null,
    windFromDeg: c.wind_direction_10m != null ? Math.round(c.wind_direction_10m) % 360 : null,
    windMph: c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null, gustMph: c.wind_gusts_10m != null ? Math.round(c.wind_gusts_10m) : null,
    source: 'Open-Meteo model', observedAt: Date.parse(c.time + 'Z') || Date.now(),
  };
}

/** Weather at a point, cached 10 min for nearby points. null = no signal / no data (the map keeps working). */
export async function getWeather(p: LatLng): Promise<Weather | null> {
  if (cache && near(cache.at, p) && Date.now() - cache.t < 10 * 60_000) return cache.w;
  let w: Weather | null = null;
  try { w = await nws(p); } catch { /* outside the US or NWS slow */ }
  if (!w) { try { w = await openMeteo(p); } catch { /* no signal */ } }
  else if (w.windFromDeg == null) {
    // Station reads calm or has no direction: borrow the model's direction so the wind is still filled by standard.
    try { const m = await openMeteo(p); if (m?.windFromDeg != null) w = { ...w, windFromDeg: m.windFromDeg, source: `${w.source} · dir Open-Meteo` }; } catch { /* keep NWS */ }
  }
  if (w) cache = { at: p, t: Date.now(), w };
  return w;
}

export const weatherLine = (w: Weather) =>
  [w.tempF != null ? `${w.tempF}°F` : null,
   w.windMph != null ? (w.windMph === 0 ? 'calm' : `wind ${w.windMph} mph${w.gustMph && w.gustMph > (w.windMph ?? 0) + 4 ? ` (gusts ${w.gustMph})` : ''}`) : null]
    .filter(Boolean).join(' · ');
