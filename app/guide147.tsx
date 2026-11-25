import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Bullets, Chips, H2, LinkRow, Notice, Screen, useJump } from '../src/components/ui';
import { ERG147 } from '../src/data/catalog';
import { GUIDE_147_SECTIONS } from '../src/data/content';

/** Full Guide 147 text, with jump chips for its sections (F30). Embedded — works offline. */
export default function Guide147() {
  const { to } = useLocalSearchParams<{ to?: string }>();
  const { ref, mark, go } = useJump();
  const [sel, setSel] = useState(GUIDE_147_SECTIONS[0].h);
  useEffect(() => { if (to === 'pdfs') setTimeout(() => go('pdfs'), 350); }, [to]);

  return (
    <Screen ref={ref}>
      <Notice tone="ok">Guide 147 text is embedded and works offline.</Notice>
      <Chips square label="Jump to section" value={sel} options={GUIDE_147_SECTIONS.map((g) => ({ key: g.h, label: g.h }))}
        onChange={(k) => { setSel(k); go(k); }} />
      {GUIDE_147_SECTIONS.map((g) => (
        <View key={g.h} onLayout={mark(g.h)} style={{ gap: 8 }}>
          <H2>{g.h}</H2>
          <Bullets items={g.lines} size={17} />
        </View>
      ))}
      <View onLayout={mark('pdfs')} style={{ gap: 8 }}>
        <H2 sub="Need signal">Official PDFs</H2>
        <LinkRow external title="Guide 147 PDF (NOAA CAMEO)" onPress={() => Linking.openURL(ERG147.guide_147_pdf_url)} />
        <LinkRow external title="Full ERG 2024 (PHMSA)" onPress={() => Linking.openURL(ERG147.full_erg_2024_pdf_url)} />
        <LinkRow external title="CAMEO UN3480" onPress={() => Linking.openURL(ERG147.cameo_un3480_url)} />
      </View>
    </Screen>
  );
}
