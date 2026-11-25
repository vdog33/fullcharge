import React, { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { Btn, Card, Muted, st } from '../src/components/ui';
import { guideLabel } from '../src/lib/match-core';
import { getGuide, loadPacks, SheetPage, sheetPageUris, subscribe } from '../src/lib/packs';
import { C, S } from '../src/theme';

/** Rescue sheet shown as page images. Pinch to zoom (iOS). Works offline once the rescue-sheet pack is on the device. */
export default function Sheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const r = useRouter();
  const { width } = useWindowDimensions();
  const [, force] = useReducer((x) => x + 1, 0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(0);
  useEffect(() => { loadPacks().then(force); NetInfo.fetch().then((n) => setOnline(n.isConnected !== false)); return subscribe(force); }, []);

  const g = getGuide(key);
  const [pages, setPages] = useState<SheetPage[] | null>(null);
  useEffect(() => { if (g) sheetPageUris(g).then(setPages).catch(() => setPages([])); }, [g?.key]);
  if (!g) return <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg }}><Text style={st.body}>Sheet not found on this device.</Text></View>;
  if (!pages) return <View style={{ flex: 1, backgroundColor: C.bg }}><ActivityIndicator color={C.text} style={{ marginTop: 40 }} /></View>;
  const local = pages.length > 0 && pages[0].local;
  const pageW = Math.min(width, 1100);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: `${g.make} ${g.model}` }} />
      <Text style={[st.muted, { padding: S.sm, textAlign: 'center' }]}>
        {guideLabel(g)} · {local ? 'on this device' : 'streaming — download rescue sheets for offline'}
      </Text>
      {!local && online === false ? (
        <View style={{ padding: S.lg, gap: S.md }}>
          <Card><Text style={st.body}>No signal, and this sheet isn't downloaded yet.</Text></Card>
          <Btn label="GET THE RESCUE-SHEET PACK" onPress={() => r.push('/settings/downloads')} />
        </View>
      ) : (
        <ScrollView
          maximumZoomScale={4} minimumZoomScale={1} bouncesZoom pinchGestureEnabled
          contentContainerStyle={{ alignItems: 'center', paddingBottom: 40, gap: 8 }}
          style={{ flex: 1 }}
        >
          {pages.map((p, i) => (
            <PageView key={p.file} uri={p.uri} w={pageW} h={(pageW * p.h) / p.w} n={i + 1} of={pages.length} onFail={() => setFailed((x) => x + 1)} />
          ))}
          {failed > 0 && <Muted>{failed} page(s) didn't load. Check signal, or update the pack.</Muted>}
          <View style={{ width: Math.min(pageW, 600), paddingHorizontal: S.lg, gap: S.sm, marginTop: S.md }}>
            <Btn tone="ghost" label="ORIGINAL PDF (needs signal)" onPress={() => r.push(`/erg-pdf?kind=guide&id=${g.key}&original=1`)} />
            <Muted>Pinch to zoom. Confirm in the ERG / EVR app on scene.</Muted>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function PageView({ uri, w, h, n, of, onFail }: { uri: string; w: number; h: number; n: number; of: number; onFail: () => void }) {
  const [loading, setLoading] = useState(true);
  return (
    <View style={{ width: w, height: h, backgroundColor: '#fff' }} accessible accessibilityRole="image" accessibilityLabel={`Rescue sheet page ${n} of ${of}`}>
      <Image source={{ uri }} style={{ width: w, height: h }} resizeMode="contain"
        onLoadEnd={() => setLoading(false)} onError={() => { setLoading(false); onFail(); }} />
      {loading && <ActivityIndicator color={C.bg} style={{ position: 'absolute', top: h / 2 - 10, alignSelf: 'center' }} />}
    </View>
  );
}
