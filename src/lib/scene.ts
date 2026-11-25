// Scene state shared between screens for this app session (not stored): the wind the crew set on
// Isolation zones also drives the map snapshot on Hazmat ERG 147.
import { Compass } from './geo';

type Scene = { windFrom: Compass; night: boolean; windMph: number };
let scene: Scene = { windFrom: 'NW', night: false, windMph: 0 };
const subs = new Set<() => void>();
export const getScene = () => scene;
export function setScene(p: Partial<Scene>) { scene = { ...scene, ...p }; subs.forEach((f) => f()); }
export const subscribeScene = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
