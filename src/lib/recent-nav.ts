import { getBess, getVehicle } from '../data/catalog';
import { Recent } from './history';

export function recentName(x: Recent): string | null {
  if (x.kind === 'vehicle') { const v = getVehicle(x.id); return v ? `${v.make} ${v.model}` : null; }
  if (x.kind === 'bess') return getBess(x.id)?.name ?? x.label ?? null;
  return x.label ?? 'Cut sheet';
}
export function recentHref(x: Recent): string {
  if (x.kind === 'vehicle') return `/vehicle/${x.id}`;
  if (x.kind === 'bess') return getBess(x.id) ? `/bess/${x.id}` : `/bess/family?id=${encodeURIComponent(x.id)}`; // verified card, else catalog system
  return `/guide?keys=${x.id}&title=${encodeURIComponent(x.label ?? '')}`;
}
export const recentKind = (x: Recent) => (x.kind === 'bess' ? 'BESS' : x.kind === 'guide' ? 'CUT SHEET' : 'VEHICLE');
