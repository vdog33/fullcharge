import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Chips, H2, LinkRow, Notice, Screen, useJump } from '../src/components/ui';
import { ErgPdfRow } from '../src/components/ErgPdfRow';
import { GUIDE_147_SECTIONS } from '../src/data/content';

/** Full Guide 147 text, with jump chips for its sections (F30). Embedded — works offline. */
export default function Guide147() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const { ref, mark, go } = useJump();
  const r = useRouter();
  const [sel, setSel] = useState(GUIDE_147_SECTIONS[0].h);
  useEffect(() => { if (to === 'pdfs') setTimeout(() => go('pdfs'), 350); }, [to]);

  return (
    <Screen ref={ref}>
      {/* The official PDF first — then the same guide as text, which works with no signal. */}
      <Btn big tone="hazmat" icon="book" label="Guide 147 PDF" sub="Official ERG page — on the phone, works offline" onPress={() => r.push('/pdf?guide=147')} />
      <Notice tone="ok">Below: Guide 147 text, embedded — works offline.</Notice>
      <Chips square label="Jump to section" value={sel} options={GUIDE_147_SECTIONS.map((g) => ({ key: g.h, label: g.h }))}
        onChange={(k) => { setSel(k); go(k); }} />
      {GUIDE_147_SECTIONS.map((g) => (
        <View key={g.h} onLayout={mark(g.h)} style={{ gap: 8 }}>
          <H2>{g.h}</H2>
          <Bullets items={g.lines} size={17} />
        </View>
      ))}
      <View onLayout={mark('pdfs')} style={{ gap: 8 }}>
        <H2 sub="On this phone — work with no signal">Official ERG PDFs</H2>
        <ErgPdfRow list />
      </View>
    </Screen>
  );
}
