import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Btn, Bullets, Card, H1, Muted, Screen, st } from '../../src/components/ui';
import { BessIdResult, identifyBessPhoto } from '../../src/lib/identify';
import { C, S } from '../../src/theme';

const HOW: Record<string, string> = { 'model-number': 'Model number on the label matches the listing', product: 'Brand + product name match', brand: 'Brand only — pick the product' };

export default function BessCamera() {
  const r = useRouter();
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<BessIdResult | null>(null);
  const [err, setErr] = useState('');

  async function pick(fromCamera: boolean) {
    setErr(''); setRes(null);
    const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Permission denied — browse by brand instead.'); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85, exif: false };
    const out = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (out.canceled || !out.assets?.[0]) return;
    setUri(out.assets[0].uri); setBusy(true);
    try { setRes(await identifyBessPhoto(out.assets[0].uri)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Identify home battery' }} />
      {!res && !busy && (
        <View style={{ gap: S.md }}>
          <H1>Photo the unit</H1>
          <Bullets items={[
            'Best: the label (model / part number, kWh) — usually on the side or under a cover',
            'Or the whole unit front-on, logo visible',
            'Do NOT open the enclosure or go near a hot / venting unit for a photo',
          ]} />
          <Btn big tone="red" label="TAKE PHOTO" onPress={() => pick(true)} />
          <Btn label="FROM LIBRARY" onPress={() => pick(false)} />
          <Btn tone="ghost" label="BROWSE BY BRAND" onPress={() => r.back()} />
        </View>
      )}
      {busy && (
        <View style={{ alignItems: 'center', gap: S.md }}>
          {uri && <Image source={{ uri }} style={{ width: '100%', height: 220, borderRadius: 10 }} />}
          <ActivityIndicator color={C.text} size="large" />
          <Muted>Reading the unit…</Muted>
        </View>
      )}
      {!!err && <Card style={{ marginTop: S.md }}><Text style={st.body}>{err}</Text><Btn tone="ghost" label="BROWSE BY BRAND" onPress={() => r.back()} /></Card>}
      {res && (
        <View style={{ gap: S.md }}>
          {uri && <Image source={{ uri }} style={{ width: '100%', height: 200, borderRadius: 10 }} />}
          {res.guesses.map((g, i) => (
            <Card key={i}>
              <Text style={st.label}>Read from the photo</Text>
              <Text style={st.h1}>{g.label}</Text>
              {!!g.modelNumbers?.length && <Text style={st.body}>Label: {g.modelNumbers.join(' · ')}</Text>}
              {!!g.kwh && <Text style={st.body}>{g.kwh} kWh</Text>}
              {!!g.cues?.length && <Bullets items={g.cues} />}
            </Card>
          ))}
          <Text style={st.h2}>{res.matches.length ? 'Is this the system?' : 'No listed system matched'}</Text>
          {res.matches.map((m) => (
            <Btn key={m.family.id} tone={m.how === 'model-number' ? 'red' : 'neutral'} label={`${m.family.brand} ${m.family.family}`.toUpperCase()}
              sub={`${HOW[m.how]}${m.family.curatedId ? ' · verified card' : ''}`} onPress={() => r.replace(`/bess/family?id=${encodeURIComponent(m.family.id)}`)} />
          ))}
          {!res.matches.length && <Muted>It may be unlisted (DIY or a portable power station wired in) — treat as lithium-ion, generic shutdown, Guide 147.</Muted>}
          {!!res.notes && <Muted>{res.notes}</Muted>}
          <Btn tone="ghost" label="TRY ANOTHER PHOTO" onPress={() => { setRes(null); setUri(null); }} />
        </View>
      )}
    </Screen>
  );
}
