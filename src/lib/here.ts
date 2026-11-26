// "Where am I" fast. A map that waits for a perfect GPS fix sits blank for up to 15 s on scene,
// so: show the last known spot at once (seconds old is fine for a 100 m ring), then sharpen it.
import * as Location from 'expo-location';

export type Fix = { lat: number; lng: number; acc?: number; t: number };
let last: Fix | null = null;
const subs = new Set<(f: Fix) => void>();
const put = (p: Location.LocationObject): Fix => {
  last = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? undefined, t: p.timestamp || Date.now() };
  subs.forEach((f) => f(last!));
  return last;
};
export const lastFix = () => last;
export const onFix = (f: (x: Fix) => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** App start: if location is already allowed, grab the last known spot so maps open on it. Never asks. */
export async function warm() {
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 });
    if (p) put(p);
  } catch { /* no location */ }
}

/** Quick answer (asks permission once): cached / last known spot, under ~10 minutes old. */
export async function quickFix(): Promise<Fix | null | 'denied'> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return 'denied';
    if (last && Date.now() - last.t < 2 * 60_000) return last;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    return p ? put(p) : last;
  } catch { return last; }
}

/** Better fix: balanced first (fast), then high accuracy. Each result goes to onFix listeners. */
export async function sharpen(timeoutMs = 15000): Promise<Fix | null> {
  const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  try {
    const b = await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 6000);
    if (b) put(b);
    const h = await within(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }), timeoutMs);
    if (h) put(h);
  } catch { /* keep what we have */ }
  return last;
}
