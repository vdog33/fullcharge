import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, Bullets, Card, Divider, H1, H2, Muted, Notice, Screen, Steps, Toggle, st } from '../src/components/ui';
import { Candidate, destination, IdResult, identifyPhoto, NO_SIGNAL_MSG } from '../src/lib/identify';
import { getSettings, logIdAttempt, setSettings, updateIdAttempt } from '../src/lib/history';
import { allReady, guideIndex } from '../src/lib/packs';
import { ergFor } from '../src/lib/chem-guide';
import { getLastId, markAccepted, saveLastId } from '../src/lib/last-id';
import { MatchPicker } from '../src/components/MatchPicker';
import { C, F, S } from '../src/theme';

type Phase = 'idle' | 'working' | 'confirm' | 'error';

export default function CameraId() {
  const r = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [res, setRes] = useState<IdResult | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null); // the car opened last, if they came back
  const last = getLastId();
  // Coming back from the rescue sheet: land on the match cards, not the one they accepted.
  function restoreLast() {
    const l = getLastId();
    if (!l) return;
    setRes(l.res); setUri(l.uri); setAt(l.at); setAccepted(l.accepted ?? null); setPhase('confirm');
  }
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
      setAt(stamp); setRes(result); setAccepted(null);
      saveLastId({ res: result, uri: out.assets[0].uri, at: stamp });
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


  async function yes(cur: Candidate) {
    const dest = destination(cur);
    if (!dest) return;
    await updateIdAttempt(at, { confirmedId: dest.id, confirmedLabel: cur.label });
    markAccepted(cur.label); setAccepted(cur.label);
    // push, not replace: Back from the sheet returns to these matches.
    r.push(`${dest.href}${dest.href.includes('?') ? '&' : '?'}idAt=${at}`);
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
          {last && (
            <Btn tone="outline" icon="back" label={`Back to last matches (${Math.max(1, Math.round((Date.now() - last.t) / 60000))} min ago)`} onPress={restoreLast} />
          )}
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

      {phase === 'confirm' && res && (
        <MatchPicker candidates={res.candidates} accepted={accepted} onAccept={yes} onNone={manual}
          extra={<Btn tone="outline" icon="cam" label="Try another photo" onPress={() => setPhase('idle')} />}
          note="Likelihood is the AI's estimate from one photo. Photos show each model (approved, stored on the phone) — check the badge." />
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
