// The manufacturer rescue sheet, full size, pinch to zoom (iOS native zoom, up to 6×). Used in command view.
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Guide } from '../lib/match-core';
import { SheetPage, sheetPageUris } from '../lib/packs';
import { C, S } from '../theme';

export function SheetZoom({ guides, height }: { guides: Guide[]; height: number }) {
  const sheet = guides.find((g) => g.docType === 'rescue_sheet' && g.images) ?? guides.find((g) => g.images);
  const [pages, setPages] = useState<SheetPage[]>([]);
  const [W, setW] = useState(0);
  useEffect(() => { setPages([]); if (sheet) sheetPageUris(sheet).then(setPages).catch(() => setPages([])); }, [sheet?.key]);
  if (!sheet) return <Text style={{ color: C.muted, fontSize: 16 }}>No picture of this cut sheet on the phone — open the full page for the PDF.</Text>;
  return (
    <View style={{ height, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <ScrollView key={`z${W}`} maximumZoomScale={6} minimumZoomScale={1} bouncesZoom pinchGestureEnabled centerContent
        contentContainerStyle={{ gap: S.sm }} accessibilityLabel="Rescue sheet — pinch to zoom">
        {W > 0 && pages.map((p) => <Image key={p.uri} source={{ uri: p.uri }} style={{ width: W, height: (W * p.h) / p.w }} resizeMode="contain" />)}
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Pinch to zoom</Text>
      </View>
    </View>
  );
}
