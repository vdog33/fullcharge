import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, Bullets, Card, Divider, H1, H2, Muted, Notice, Screen, Steps, Toggle, st } from '../src/components/ui';
import { VerifyPicture } from '../src/components/VerifyPicture';
import { Candidate, destination, IdResult, identifyPhoto, NO_SIGNAL_MSG } from '../src/lib/identify';
import { getSettings, logIdAttempt, setSettings, updateIdAttempt } from '../src/lib/history';
import { allReady, guideIndex } from '../src/lib/packs';
import { C, S } from '../src/theme';

type Phase = 'idle' | 'working' | 'confirm' | 'error';

export default function CameraId() {
  const r = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [res, setRes] = useState<IdResult | null>(null);
  const [i, setI] = useState(0);
  const [at, setAt] = useState(0);
  const [err, setErr] = useState('');
  const [share, setShare] = useState(false);
  const net = useNetInfo();
  const noSignal = net.isConnected === false || net.isInternetReachable === false;
  useEffect(() => { getSettings().then((s) => setShare(s.sharePhotos)); }, []);

  async function pick(fromCamera: boolean) {
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Permission denied — search manually.'); setPhase('error'); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
    const out = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (out.canceled || !out.assets?.[0]) return;
    setUri(out.assets[0].uri); setPhase('working');
    try {
      const result = await identifyPhoto(out.assets[0].uri, { sharePhoto: share });
      const stamp = Date.now();
      setAt(stamp); setRes(result); setI(0);
      await logIdAttempt({
        at: stamp, source: 'camera', topMatch: result.candidates[0]?.label ?? null,
        candidates: result.candidates.map((c) => ({ label: c.label, vehicleId: c.vehicleId, confidence: c.confidence })),
        confirmedId: null, attemptId: result.attemptId, feedbackToken: result.feedbackToken,
      });
      if (result.candidates.length) setPhase('confirm');
      else { setErr('Could not name this vehicle. Search manually.'); setPhase('error'); }
    } catch (e) {
      setErr((e as Error).message || NO_SIGNAL_MSG); setPhase('error');
    }
  }

  const cur: Candidate | undefined = res?.candidates[i];
  const dest = cur ? destination(cur) : null;
  const n = res?.candidates.length ?? 0;

  async function yes() {
    if (!cur || !dest) return;
    await updateIdAttempt(at, { confirmedId: dest.id, confirmedLabel: cur.label });
    r.replace(`${dest.href}${dest.href.includes('?') ? '&' : '?'}idAt=${at}`);
  }
  async function manual() {
    await updateIdAttempt(at, { confirmedId: null });
    r.replace('/search');
  }

  return (
    <Screen>
      {phase === 'idle' && (
        <View style={{ gap: S.block }}>
          {/* Photo ID needs signal and cut sheets don't — say which before the crew shoots (F31). */}
          {noSignal
            ? <Notice tone="warn" icon="signal" title="No signal">Photo ID needs signal. Search manually — downloaded cut sheets work offline.</Notice>
            : <Notice tone="ok" icon="signal"><Text style={[st.body, { fontSize: 17 }]}><Text style={{ fontWeight: '700' }}>Signal: {net.isConnected === null ? 'checking…' : 'good.'}</Text> Photo ID needs signal. Downloaded cut sheets don't.</Text></Notice>}
          <H1>Photo the car</H1>
          <Steps items={['Non-damaged side', 'Whole car in frame', 'Badge + lights if you can']} />
          <Btn big tone="red" icon="cam" label="Take photo" onPress={() => pick(true)} />
          <Btn icon="img" label="From library" onPress={() => pick(false)} />
          <Toggle label="Share photo to improve ID" sub="Off: only the match + your correction are logged. Avoid faces and plates in frame."
            value={share} onChange={(x) => { setShare(x); setSettings({ sharePhotos: x }); }} />
          <Divider />
          <Btn tone="outline" icon="search" label="Search manually" onPress={() => r.replace('/search')} />
        </View>
      )}

      {phase === 'working' && (
        <View style={{ alignItems: 'center', gap: S.md, alignSelf: 'stretch' }}>
          {uri && <Image source={{ uri }} style={{ width: '100%', height: 220, borderRadius: 14 }} />}
          <ActivityIndicator color={C.text} size="large" />
          <Muted>Identifying…</Muted>
          <Btn tone="outline" icon="search" label="Search manually" onPress={() => r.replace('/search')} />
        </View>
      )}

      {phase === 'confirm' && cur && (
        <View style={{ gap: S.block }}>
          {uri && <Image source={{ uri }} style={{ width: '100%', height: 200, borderRadius: 14 }} />}
          <Muted>Match {i + 1} of {n}</Muted>
          <Card>
            <Text style={st.h1}>{cur.label}</Text>
            <VerifyPicture guides={cur.guides} vehicleId={cur.vehicleId} compact />
            <Text style={st.body}>{cur.confidence}%{cur.guess.powertrain && cur.guess.powertrain !== 'UNKNOWN' ? ` · ${cur.guess.powertrain}` : ''}</Text>
            {cur.cues.length > 0 && <Bullets items={cur.cues} />}
            <OnFile c={cur} />
          </Card>
          <H2>Is this the car?</H2>
          {dest
            ? <Btn big tone="red" icon="check" label={cur.vehicleId ? 'Yes — open ERG page' : 'Yes — open cut sheet'} onPress={yes} />
            : <Btn big icon="search" label="Yes — search for it" onPress={manual} />}
          {i + 1 < n ? <Btn label="No, show next" onPress={() => setI(i + 1)} /> : <Btn label="No — search manually" onPress={manual} />}
          <Btn tone="outline" icon="search" label="Search manually" onPress={manual} />
          {!!res?.notes && <Muted>{res.notes}</Muted>}
        </View>
      )}

      {phase === 'error' && (
        <View style={{ gap: S.block }}>
          <Notice tone="warn">{err || NO_SIGNAL_MSG}</Notice>
          <Btn big icon="search" label="Search manually" onPress={() => r.replace('/search')} />
          <Btn tone="outline" icon="cam" label="Try another photo" onPress={() => setPhase('idle')} />
        </View>
      )}
    </Screen>
  );
}

function OnFile({ c }: { c: Candidate }) {
  if (c.vehicleId) return <Text style={[st.label, { color: C.green }]}>FULLCHARGE page{c.guides.length ? ` + ${c.guides.length} cut sheet(s)` : ''}</Text>;
  if (c.guides.length) return <Text style={[st.label, { color: C.green }]}>{c.guides.length} cut sheet(s) on file</Text>;
  if (c.guess.powertrain === 'ICE') return <Muted>Looks gas-only — NHTSA lists electric-powered vehicles only, so no EV cut sheet exists. Check for hybrid / plug-in badges.</Muted>;
  if (!allReady() && guideIndex().length === 0) return <Muted>Not in the 20 FULLCHARGE vehicles. Download "All rescue sheets" for every NHTSA vehicle.</Muted>;
  return <Muted>No NHTSA cut sheet on file for this name. Search manually.</Muted>;
}
