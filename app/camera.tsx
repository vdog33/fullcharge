import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNetInfo } from '@react-native-community/netinfo';
import { Btn, Bullets, Card, Divider, H1, H2, Muted, Notice, Screen, Steps, Toggle, st } from '../src/components/ui';
import { Candidate, destination, IdResult, identifyPhoto, NO_SIGNAL_MSG } from '../src/lib/identify';
import { getSettings, logIdAttempt, setSettings, updateIdAttempt } from '../src/lib/history';
import { allReady, guideIndex } from '../src/lib/packs';
import { ergFor } from '../src/lib/chem-guide';
import { getLastId, markAccepted, saveLastId } from '../src/lib/last-id';
import { C, F, S } from '../src/theme';

type Phase = 'idle' | 'working' | 'confirm' | 'error';

export default function CameraId() {
  const r = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [res, setRes] = useState<IdResult | null>(null);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false); // false = picking from the photo cards, true = checking one
  const [accepted, setAccepted] = useState<string | null>(null); // the car opened last, if they came back
  const last = getLastId();
  // Coming back from the rescue sheet: land on the match cards, not the one they accepted.
  useFocusEffect(useCallback(() => { setOpen(false); }, []));
  function restoreLast() {
    const l = getLastId();
    if (!l) return;
    setRes(l.res); setUri(l.uri); setAt(l.at); setI(0); setOpen(false); setAccepted(l.accepted ?? null); setPhase('confirm');
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
      setAt(stamp); setRes(result); setI(0); setOpen(false); setAccepted(null);
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

  const cur: Candidate | undefined = res?.candidates[i];
  const dest = cur ? destination(cur) : null;
  const n = res?.candidates.length ?? 0;

  async function yes() {
    if (!cur || !dest) return;
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

      {/* 1) Pick: a real photo of each car it thinks it is, the likelihood, the name. */}
      {phase === 'confirm' && !open && res && (
        <View style={{ gap: S.block }}>
          <H1>Which car is it?</H1>
          {accepted && <Notice tone="info" icon="back" title={`You opened ${accepted}`}>Wrong car? Pick another below — no need to start over.</Notice>}
          {res.candidates.length === 0 && <Notice tone="warn">No match from this photo. Search manually or try another angle.</Notice>}
          {res.candidates.map((c, k) => (
            <Pressable key={c.label} onPress={() => { setI(k); setOpen(true); }} accessibilityRole="button"
              accessibilityLabel={`${c.label}, ${c.confidence} percent likely. Tap to check.`}
              style={({ pressed }) => [cs.card, k === 0 && { borderColor: C.text }, pressed && { opacity: 0.85 }]}>
              <CarPhoto c={c} h={k === 0 ? 200 : 140} />
              <View style={cs.cardBody}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={cs.name}>{c.guess.make} {c.guess.model}</Text>
                  <Text style={st.muted}>{[guessYears(c), c.guess.powertrain !== 'UNKNOWN' ? c.guess.powertrain : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[cs.pct, { color: c.confidence >= 70 ? C.green : c.confidence >= 40 ? C.hazmat : C.muted }]}>{c.confidence}%</Text>
                  <Text style={st.muted}>likely</Text>
                </View>
              </View>
            </Pressable>
          ))}
          <Btn tone="outline" icon="search" label="None of these — search" onPress={manual} />
          <Btn tone="outline" icon="cam" label="Try another photo" onPress={() => setPhase('idle')} />
          <Muted>Likelihood is the AI's estimate from one photo. Photos are examples of each model — years may differ.</Muted>
        </View>
      )}

      {/* 2) Check: what to look at on the car, then accept. Rescue sheet opens only after accept. */}
      {phase === 'confirm' && open && cur && (
        <View style={{ gap: S.block }}>
          <CarPhoto c={cur} h={220} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={cs.nameBig}>{cur.guess.make} {cur.guess.model}</Text>
              <Text style={st.muted}>{[guessYears(cur), cur.guess.powertrain !== 'UNKNOWN' ? cur.guess.powertrain : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={[cs.pct, { color: cur.confidence >= 70 ? C.green : cur.confidence >= 40 ? C.hazmat : C.muted }]}>{cur.confidence}%</Text>
          </View>
          {(() => { const e = ergFor(cur.guess.powertrain); return e.tone !== 'none' ? <Notice tone={e.tone} title={e.title}>{e.text}</Notice> : null; })()}
          {(cur.checks.length > 0 || cur.cues.length > 0) && (
            <Card>
              <Text style={st.noticeTitle}>Check on the car</Text>
              <Bullets items={cur.checks.length ? cur.checks : cur.cues} />
            </Card>
          )}
          <OnFile c={cur} />
          {dest
            ? <Btn big tone="red" icon="check" label="Accept — open rescue sheet" onPress={yes} />
            : <Btn big icon="search" label="Accept — search for its sheet" onPress={manual} />}
          <Btn label="Not this one" icon="back" onPress={() => setOpen(false)} />
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

function guessYears(c: Candidate) {
  const g = c.guess;
  return g.yearFrom && g.yearTo && g.yearFrom !== g.yearTo ? `${g.yearFrom}–${g.yearTo}` : String(g.yearFrom ?? g.yearTo ?? '');
}

/** Reference photo of the model; a plain car outline when there isn't one (no signal, or none found). */
function CarPhoto({ c, h }: { c: Candidate; h: number }) {
  const [bad, setBad] = useState(false);
  if (!c.photo || bad) {
    return (
      <View style={{ height: h * 0.6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 }}>
        <Text style={st.muted}>No photo for this model</Text>
      </View>
    );
  }
  return (
    <View>
      <Image source={{ uri: c.photo.url }} onError={() => setBad(true)} style={{ width: '100%', height: h, backgroundColor: C.surface2 }} resizeMode="cover"
        accessibilityLabel={`Example photo of a ${c.guess.make} ${c.guess.model}`} />
      <Text style={cs.credit} numberOfLines={1}>{c.photo.credit}</Text>
    </View>
  );
}

const cs = StyleSheet.create({
  card: { borderWidth: 2, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: 14 },
  name: { color: C.text, fontFamily: F.display, fontSize: 23, lineHeight: 27 },
  nameBig: { color: C.text, fontFamily: F.black, fontSize: 30, lineHeight: 33 },
  pct: { fontFamily: F.black, fontSize: 32, lineHeight: 34 },
  credit: { position: 'absolute', right: 6, bottom: 4, color: '#FFF', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, borderRadius: 4 },
});

function OnFile({ c }: { c: Candidate }) {
  if (c.vehicleId) return <Text style={[st.label, { color: C.green }]}>FULLCHARGE page{c.guides.length ? ` + ${c.guides.length} cut sheet(s)` : ''}</Text>;
  if (c.guides.length) return <Text style={[st.label, { color: C.green }]}>{c.guides.length} cut sheet(s) on file</Text>;
  if (c.guess.powertrain === 'ICE') return <Muted>Looks gas-only — NHTSA lists electric-powered vehicles only, so no EV cut sheet exists. Check for hybrid / plug-in badges.</Muted>;
  if (!allReady() && guideIndex().length === 0) return <Muted>Not in the 20 FULLCHARGE vehicles. Download "All rescue sheets" for every NHTSA vehicle.</Muted>;
  return <Muted>No NHTSA cut sheet on file for this name. Search manually.</Muted>;
}
