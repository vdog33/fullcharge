// Phone / iPad compass: which way the responder is facing. Face into the wind, tap Mark, and "Wind from" is set.
// Shared by Command view. (Isolation zones has the same logic inline.)
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { angleDiff, circularMean } from './geo';

export type Facing = { deg: number; acc: number } | null;

/** Live heading while `on` (off = compass not running, saves battery). mark() locks it if held steady for ~1 s. */
export function useFacing(on: boolean) {
  const [facing, setFacing] = useState<Facing>(null);
  const lastDeg = useRef(-999);
  const recent = useRef<{ t: number; d: number }[]>([]);
  useEffect(() => {
    if (!on) return;
    let sub: { remove: () => void } | null = null;
    let alive = true;
    (async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || !alive) return;
        sub = await Location.watchHeadingAsync((h) => {
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (deg < 0) return;
          const now = Date.now();
          recent.current.push({ t: now, d: deg });
          while (recent.current.length && now - recent.current[0].t > 1500) recent.current.shift();
          if (Math.abs(((deg - lastDeg.current + 540) % 360) - 180) < 3) return; // re-render only on a real turn
          lastDeg.current = deg;
          setFacing({ deg, acc: h.accuracy });
        });
        if (!alive) sub?.remove();
      } catch { /* no compass on this device */ }
    })();
    return () => { alive = false; sub?.remove(); };
  }, [on]);

  function mark(): { deg: number } | { err: string } {
    const now = Date.now();
    const pts = recent.current.filter((x) => now - x.t <= 1000).map((x) => x.d);
    if (pts.length < 2 && facing) pts.push(facing.deg);
    if (!pts.length) return { err: 'No compass reading yet — hold it flat and try again.' };
    const mean = circularMean(pts);
    if (Math.max(...pts.map((d) => angleDiff(d, mean))) > 25) return { err: 'Moving — hold still and tap Mark again.' };
    return { deg: Math.round(mean) % 360 };
  }
  return { facing, mark };
}
