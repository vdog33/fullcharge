// ERG Guide PDF viewer (Guide 147 etc.). Saved on the phone the first time it opens, so it works with no signal after.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as FS from 'expo-file-system/legacy';
import { Btn, Muted, st } from '../src/components/ui';
import { ERG_GUIDE_PDF } from '../src/lib/chem-guide';
import { C, S } from '../src/theme';

export default function GuidePdf() {
  const { guide = '147' } = useLocalSearchParams<{ guide?: string }>();
  const r = useRouter();
  const n = String(guide).replace(/[^0-9]/g, '').slice(0, 3) || '147';
  const file = `${FS.documentDirectory}erg/Guide_${n}.pdf`;
  const [uri, setUri] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if ((await FS.getInfoAsync(file)).exists) return setUri(file);
        await FS.makeDirectoryAsync(`${FS.documentDirectory}erg/`, { intermediates: true }).catch(() => {});
        const d = await FS.downloadAsync(ERG_GUIDE_PDF(n), file);
        if (d.status !== 200) { await FS.deleteAsync(file, { idempotent: true }); throw new Error(); }
        setUri(file);
      } catch { setFail(true); }
    })();
  }, [n]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: `ERG Guide ${n}` }} />
      {uri ? <WebView source={{ uri }} originWhitelist={['*']} allowFileAccess style={{ flex: 1, backgroundColor: '#fff' }} />
        : fail ? (
          <View style={{ padding: S.lg, gap: S.block }}>
            <Text style={st.body}>No signal and the Guide {n} PDF isn't saved on this phone yet.</Text>
            {n === '147' && <Btn tone="hazmat" icon="book" label="Guide 147 text — works offline" onPress={() => r.replace('/guide147')} />}
            <Muted>Open it once with signal and it's kept for next time.</Muted>
          </View>
        ) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.text} size="large" /></View>}
    </View>
  );
}
