// ERG PDF viewer — opens the copy saved ON THE PHONE (works with no signal). If it isn't saved yet and there's
// signal, it downloads it first and keeps it.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Btn, Muted, st } from '../src/components/ui';
import { ergDoc, ergFile, fetchErg, haveErg } from '../src/lib/erg-pdfs';
import { C, S } from '../src/theme';

export default function ErgPdf() {
  const { guide, doc } = useLocalSearchParams<{ guide?: string; doc?: string }>();
  const r = useRouter();
  const key = doc === 'full' ? 'full' : (String(guide ?? '147').replace(/[^0-9]/g, '').slice(0, 3) || '147');
  const d = ergDoc(key);
  const [uri, setUri] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    (async () => {
      if (await haveErg(key)) return setUri(ergFile(key));
      if (await fetchErg(key)) return setUri(ergFile(key));
      setFail(true);
    })();
  }, [key]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: key === 'full' ? 'ERG 2024' : `ERG Guide ${key}` }} />
      {uri ? <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess allowingReadAccessToURL={uri} style={{ flex: 1, backgroundColor: '#fff' }} />
        : fail ? (
          <View style={{ padding: S.lg, gap: S.block }}>
            <Text style={st.body}>{d.title || `Guide ${key}`} isn't on this phone yet, and there's no signal to get it.</Text>
            {key === '147' && <Btn tone="hazmat" icon="book" label="Guide 147 text — works offline" onPress={() => r.replace('/guide147')} />}
            <Muted>Downloads → ERG guides gets all of them at once, with signal.</Muted>
          </View>
        ) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.text} size="large" /></View>}
    </View>
  );
}
