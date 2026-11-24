import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as FS from 'expo-file-system/legacy';
import { Btn, Card, Muted, Screen, st } from '../src/components/ui';
import { getBess, getVehicle, pdfUrl } from '../src/data/catalog';
import { allReady, cachedGuidePdf, cachedPdf, coreReady, getGuide, guideRemoteUrl, linkedSheetOnPhone, loadPacks, originalUrl } from '../src/lib/packs';
import { guideLabel } from '../src/lib/match-core';
import { C, S } from '../src/theme';

const FALLBACK = 'Manufacturer PDF not available — in-app sheet from verified ERG data, confirm in the EVR app on scene.';

type View_ = { mode: 'loading' } | { mode: 'pdf'; uri: string; local: boolean } | { mode: 'fallback'; why: 'failed' | 'no-pack' | 'none' };

export default function ErgPdf() {
  const { kind = 'vehicle', id, original } = useLocalSearchParams<{ kind?: string; id: string; original?: string }>();
  const r = useRouter();
  const v = kind === 'vehicle' ? getVehicle(id) : undefined;
  const b = kind === 'bess' ? getBess(id) : undefined;
  const [g, setG] = useState(kind === 'guide' ? getGuide(id) : undefined);
  const [view, setView] = useState<View_>({ mode: 'loading' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      if (kind === 'guide') {
        await loadPacks();
        const gg = getGuide(id); setG(gg);
        if (!gg) return setView({ mode: 'fallback', why: 'no-pack' });
        if (original === '1') {
          const net0 = await NetInfo.fetch();
          if (net0.isConnected === false) return setView({ mode: 'fallback', why: 'failed' });
          return setView({ mode: 'pdf', uri: originalUrl(gg), local: false });
        }
        if (gg.images) return r.replace(`/sheet?key=${gg.key}`); // image sheets have their own viewer
        const local = await cachedGuidePdf(gg.key);
        if (local) return setView({ mode: 'pdf', uri: local, local: true });
        const net = await NetInfo.fetch();
        if (net.isConnected === false) return setView({ mode: 'fallback', why: allReady() ? 'failed' : 'no-pack' });
        return setView({ mode: 'pdf', uri: guideRemoteUrl(gg), local: false });
      }
      if (!v) return setView({ mode: 'fallback', why: 'none' }); // BESS: no manufacturer PDF in the verified data
      const local = await cachedPdf(v.id);
      if (local) return setView({ mode: 'pdf', uri: local, local: true });
      const net = await NetInfo.fetch();
      if (net.isConnected === false) {
        const sheet = linkedSheetOnPhone(v.id); // NHTSA rescue sheet for this vehicle, on the device
        if (sheet) return r.replace(`/sheet?key=${sheet.key}`);
        return setView({ mode: 'fallback', why: coreReady() ? 'failed' : 'no-pack' });
      }
      setView({ mode: 'pdf', uri: pdfUrl(v.erg_pdf_url), local: false });
    })();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [id]);

  const fail = () => setView({ mode: 'fallback', why: 'failed' });
  const title = v ? `${v.make} ${v.model}` : g ? `${g.make} ${g.model}` : b?.name ?? 'ERG';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title }} />
      {view.mode === 'loading' && <ActivityIndicator color={C.text} style={{ marginTop: 40 }} />}

      {view.mode === 'pdf' && (
        <>
          <Text style={[st.muted, { padding: S.sm, textAlign: 'center' }]}>
            {v ? v.erg_pdf_label : g ? guideLabel(g) : ''} · {view.local ? 'on this device' : original === '1' ? 'original PDF — needs signal' : `live — download ${g ? (g.docType === 'rescue_sheet' ? 'All rescue sheets' : 'All full ERGs') : 'Core'} for offline`}
          </Text>
          <WebView
            source={{ uri: view.uri }}
            originWhitelist={['*']}
            allowingReadAccessToURL={view.local ? `${FS.documentDirectory}packs/` : undefined}
            allowFileAccess
            style={{ flex: 1, backgroundColor: C.bg }}
            onLoadStart={() => { if (!view.local) timer.current = setTimeout(fail, 20000); }}
            onLoadEnd={() => { if (timer.current) clearTimeout(timer.current); }}
            onError={fail}
            onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) fail(); }}
            startInLoadingState
            renderLoading={() => <ActivityIndicator color={C.text} style={{ position: 'absolute', top: 40, alignSelf: 'center' }} />}
          />
        </>
      )}

      {view.mode === 'fallback' && (
        <Screen>
          <Card style={{ marginBottom: S.md }}>
            <Text style={st.body}>{kind === 'guide' ? 'Cut sheet could not open here.' : FALLBACK}</Text>
            {view.why === 'no-pack' && (
              <>
                <Muted>No signal, and the {g ? (g.docType === 'rescue_sheet' ? 'All rescue sheets' : 'All full ERGs') : 'Core'} pack (holds this PDF) is not downloaded.</Muted>
                <Btn label="GET THE PACK" onPress={() => r.push('/settings/downloads')} />
              </>
            )}
          </Card>
          {kind !== 'guide' && <Btn tone="neutral" label="QUICK SHEET — OFFLINE" onPress={() => r.replace(`/quick?kind=${kind}&id=${id}`)} />}
        </Screen>
      )}
    </View>
  );
}
