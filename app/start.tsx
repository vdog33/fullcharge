// START NEW: pick the car — Camera, VIN, Voice, Manual (in that order). BESS / Test below, smaller.
import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../src/components/Icon';
import { BESS } from '../src/data/catalog';
import { BETA } from '../src/config';
import { C, F } from '../src/theme';

export default function StartNew() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const opts: { title: string; sub: string; icon: IconName; href: string; red?: boolean }[] = [
    { title: 'Camera', sub: 'Photograph the non-damaged side', icon: 'cam', href: '/camera', red: true },
    { title: 'VIN', sub: 'Scan the barcode or type it', icon: 'id', href: '/search?mode=vin' },
    { title: 'Voice', sub: 'Say the make and model', icon: 'mic', href: '/search?voice=1' },
    { title: 'Manual', sub: 'Pick the brand, then the model', icon: 'search', href: '/search' },
  ];
  const more: { title: string; sub: string; icon: IconName; href: string }[] = [
    { title: 'BESS', sub: `${BESS.length} home batteries`, icon: 'batt', href: '/bess' },
    ...(BETA ? [{ title: 'Test', sub: '20 test vehicles', icon: 'flask' as IconName, href: '/test' }] : []),
  ];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, paddingBottom: insets.bottom + 12, gap: 12 }}>
      {opts.map((o) => (
        <Pressable key={o.href} onPress={() => r.push(o.href)} accessibilityRole="button" accessibilityLabel={`${o.title}. ${o.sub}`}
          style={({ pressed }) => ({ flex: 1, minHeight: 110, flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 28, borderRadius: 18, borderWidth: 3,
            borderColor: o.red ? C.red : C.line, backgroundColor: o.red ? C.red : C.surface, opacity: pressed ? 0.85 : 1 })}>
          <Icon name={o.icon} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontFamily: F.black, fontSize: 32 }} adjustsFontSizeToFit numberOfLines={1}>{o.title}</Text>
            <Text style={{ color: o.red ? '#FFF' : C.muted, fontSize: 18 }}>{o.sub}</Text>
          </View>
          <Icon name="chev" size={30} />
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {more.map((o) => (
          <Pressable key={o.href} onPress={() => r.push(o.href)} accessibilityRole="button" accessibilityLabel={`${o.title}. ${o.sub}`}
            style={({ pressed }) => ({ flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2,
              borderColor: C.line, backgroundColor: pressed ? C.surface2 : C.surface })}>
            <Icon name={o.icon} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontFamily: F.black, fontSize: 22 }} numberOfLines={1}>{o.title}</Text>
              <Text style={{ color: C.muted, fontSize: 15 }} numberOfLines={1}>{o.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
