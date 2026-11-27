// Car picture = the top of the vehicle's own rescue sheet (the manufacturer's side-view drawing).
// No photo approvals, no web: the page images already ship with the rescue-sheet pack.
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Guide } from '../lib/match-core';
import { Picture, pictureFor, pictureForVehicle } from '../lib/packs';
import { C } from '../theme';

/** Shows the top band of page 1, full width (the side view sits at the top of the sheet).
 *  remote=false: only show it when the sheet is on the phone (long lists shouldn't stream dozens of pages). */
export function SheetThumb({ guides, vehicleId, width, height, remote = true }:
  { guides?: Guide[]; vehicleId?: string; width: number; height: number; remote?: boolean }) {
  const [pic, setPic] = useState<Picture | null | undefined>(undefined);
  const [bad, setBad] = useState(false);
  const key = (guides ?? []).map((g) => g.key).join(',') + '|' + (vehicleId ?? '');
  useEffect(() => {
    let alive = true;
    setBad(false);
    (async () => {
      let p = guides?.length ? await pictureFor(guides) : null;
      if (!p && vehicleId) p = await pictureForVehicle(vehicleId);
      if (alive) setPic(p);
    })().catch(() => alive && setPic(null));
    return () => { alive = false; };
  }, [key]);

  const empty = <View style={{ width, height, borderRadius: 8, backgroundColor: C.surface2 }} />;
  if (!pic || bad || (!remote && !pic.local)) return empty;
  const imgH = (width * pic.h) / pic.w; // page scaled to the box's width; the box shows its top
  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}
      accessible accessibilityLabel="Vehicle drawing from the manufacturer rescue sheet">
      <Image source={{ uri: pic.uri }} onError={() => setBad(true)} resizeMode="stretch"
        style={{ position: 'absolute', left: 0, top: 0, width, height: imgH }} />
    </View>
  );
}
