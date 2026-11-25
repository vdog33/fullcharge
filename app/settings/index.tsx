import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, H1, H2, LabeledInput, Muted, Screen, st } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { getSettings, setSettings } from '../../src/lib/history';
import { DATA_VERSION } from '../../src/data/catalog';
import { DISCLAIMER, USE_MOCKS, BACKEND_READY } from '../../src/config';
import { S } from '../../src/theme';

export default function Settings() {
  const r = useRouter();
  const { user, sendCode, verifyCode, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [share, setShare] = useState(false);
  useEffect(() => { getSettings().then((s) => setShare(s.sharePhotos)); }, []);

  return (
    <Screen>
      <H1>Settings</H1>
      <View style={{ marginTop: S.md }}><Btn label="DOWNLOADS (DATA PACKS)" onPress={() => r.push('/settings/downloads')} /></View>

      <H2>Camera ID</H2>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[st.body, { flex: 1 }]}>Share ID photos to improve matching</Text>
        <Switch value={share} accessibilityLabel="Share ID photos to improve matching" onValueChange={(v) => { setShare(v); setSettings({ sharePhotos: v }); }} />
      </View>
      <Muted>Off: only the match + your correction are logged. Avoid faces and plates in frame.</Muted>

      <H2>Account (optional)</H2>
      <Muted>Not needed on scene. Links your ID feedback across devices.</Muted>
      <Card style={{ marginTop: S.sm }}>
        {user ? (
          <>
            <Text style={st.body}>Signed in: {user.email}</Text>
            <Btn tone="ghost" label="SIGN OUT" onPress={signOut} />
          </>
        ) : (
          <>
            <LabeledInput label="Email" autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
            {sent && <LabeledInput label="6-digit code" keyboardType="number-pad" textContentType="oneTimeCode" value={code} onChangeText={setCode} />}
            {!sent
              ? <Btn label="EMAIL ME A CODE" disabled={!email.includes('@')} onPress={async () => { setMsg(''); try { await sendCode(email.trim()); setSent(true); if (USE_MOCKS) setMsg('Mock mode: code is 123456'); } catch (e) { setMsg((e as Error).message); } }} />
              : <Btn label="SIGN IN" disabled={code.length < 6} onPress={async () => { setMsg(''); try { await verifyCode(email.trim(), code.trim()); } catch (e) { setMsg((e as Error).message); } }} />}
            {!!msg && <Muted live>{msg}</Muted>}
          </>
        )}
      </Card>

      <H2>About</H2>
      <Muted>Data {DATA_VERSION} · {USE_MOCKS ? 'mock mode' : BACKEND_READY ? 'live backend' : 'offline only'}</Muted>
      <Text style={[st.body, { marginTop: S.sm }]}>{DISCLAIMER}</Text>
    </Screen>
  );
}
