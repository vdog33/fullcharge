// "Is this the car?" picture: page 1 of the manufacturer rescue sheet (side + top drawings of the vehicle).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Guide } from '../lib/match-core';
import { Picture, pictureFor, pictureForVehicle } from '../lib/packs';
import { C, S } from '../theme';

export function VerifyPicture({ guides, vehicleId, compact }: { guides?: Guide[]; vehicleId?: string; compact?: boolean }) {
  const r = useRouter();
  const [pic, setPic] = useState<Picture | null | undefined>(undefined);
  const [w, setW] = useState(320);
  const key = (guides ?? []).map((g) => g.key).join(',') + '|' + (vehicleId ?? '');
  useEffect(() => {
    let alive = true;
    const p = guides?.length ? pictureFor(guides) : vehicleId ? pictureForVehicle(vehicleId) : Promise.resolve(null);
    p.then(async (x) => (x ?? (vehicleId && guides?.length ? await pictureForVehicle(vehicleId) : null)))
      .then((x) => { if (alive) setPic(x); }).catch(() => { if (alive) setPic(null); });
    return () => { alive = false; };
  }, [key]);

  if (pic === undefined) return <ActivityIndicator color={C.text} style={{ marginVertical: S.md }} />;
  if (!pic) return <Text style={{ color: C.muted, fontSize: 13, marginVertical: S.sm }}>No picture on file for this vehicle — check the badge.</Text>;
  const h = Math.min(compact ? 200 : 320, (w * pic.h) / pic.w);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginVertical: S.sm }}>
      <Pressable onPress={() => r.push(`/sheet?key=${pic.guideKey}`)} accessibilityLabel="Vehicle drawing from the rescue sheet. Tap to open the full sheet.">
        <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <Image source={{ uri: pic.uri }} style={{ width: '100%', height: h }} resizeMode="contain" />
        </View>
      </Pressable>
      <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
        Manufacturer drawing (rescue sheet p. 1) — check the shape matches. Tap to open.{pic.local ? '' : ' Needs signal until downloaded.'}
      </Text>
    </View>
  );
}
