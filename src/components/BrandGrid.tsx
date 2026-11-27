// Two-column brand grid: logo on top, manufacturer name below. Alphabetical.
// Logos come from assets/brands/ (see the README there); brands without one show their initials.
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BRAND_LOGOS } from '../data/brand-logos';
import { C, F, S } from '../theme';

export const brandSlug = (make: string) => make.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const initials = (make: string) => {
  const words = make.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [make.slice(0, 2)]).join('').toUpperCase();
};

export type BrandItem = { make: string; models: number };

export function BrandGrid({ brands, onPick }: { brands: BrandItem[]; onPick: (make: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: S.sm }}>
      {brands.map((b) => {
        const logo = BRAND_LOGOS[brandSlug(b.make)];
        return (
          <Pressable key={b.make} onPress={() => onPick(b.make)} accessibilityRole="button" accessibilityLabel={`${b.make}, ${b.models} models`}
            style={({ pressed }) => ({
              width: '48.5%', aspectRatio: 1.1, backgroundColor: pressed ? C.surface2 : C.surface, borderColor: C.line, borderWidth: 2, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center', padding: S.md,
            })}>
            {/* Rounded white plate, wide enough for word-only logos (Lucid, Aston Martin, Tesla…) to read. */}
            <View style={{ width: '92%', maxWidth: 150, height: 84, borderRadius: 12, backgroundColor: logo ? '#fff' : C.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 8 }}>
              {logo
                ? <Image source={logo} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                : <Text style={{ color: C.text, fontFamily: F.display, fontSize: 26 }}>{initials(b.make)}</Text>}
            </View>
            <Text style={{ color: C.text, fontFamily: F.display, fontSize: 18, marginTop: S.sm, textAlign: 'center' }} numberOfLines={2}>{b.make}</Text>
            <Text style={{ color: C.muted, fontSize: 15 }}>{b.models} model{b.models === 1 ? '' : 's'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
