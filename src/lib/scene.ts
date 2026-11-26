// Scene state shared between screens for this app session (not stored): the wind the crew set on
// Isolation zones also drives the map snapshot on Hazmat ERG 147.
import { Compass } from './geo';

/** windDeg: exact bearing the wind comes FROM when it was marked by facing into it; null = set by hand (windFrom). */
/** windSource: where the wind came from — 'none' (default guess), 'weather' (auto, NWS/Open-Meteo), 'marked' (faced it), 'manual'. */
export type WindSource = 'none' | 'weather' | 'marked' | 'manual';
type Scene = { windFrom: Compass; windDeg: number | null; night: boolean; windMph: number; windSource: WindSource; tempF: number | null; weatherNote: string };
let scene: Scene = { windFrom: 'NW', windDeg: null, night: false, windMph: 0, windSource: 'none', tempF: null, weatherNote: '' };
const subs = new Set<() => void>();
export const getScene = () => scene;
export function setScene(p: Partial<Scene>) { scene = { ...scene, ...p }; subs.forEach((f) => f()); }
export const subscribeScene = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
