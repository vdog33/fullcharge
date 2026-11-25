// The last camera ID for this app session, so a wrong pick never means starting over.
import type { IdResult } from './identify';

type LastId = { res: IdResult; uri: string | null; at: number; accepted?: string; t: number };
let last: LastId | null = null;
const KEEP_MS = 30 * 60_000;

export const saveLastId = (v: Omit<LastId, 't'>) => { last = { ...v, t: Date.now() }; };
export const markAccepted = (label: string) => { if (last) last = { ...last, accepted: label }; };
export const getLastId = () => (last && Date.now() - last.t < KEEP_MS ? last : null);
