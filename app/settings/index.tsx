import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, H1, Muted, Screen, st } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { getSettings, setSettings } from '../../src/lib/history';
import { DATA_VERSION } from '../../src/data/catalog';
import { DISCLAIMER, USE_MOCKS, BACKEND_READY } from '../../src/config';
import { C, S } from '../../src/theme';

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

      <Text style={st.h2}>Camera ID</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[st.body, { flex: 1 }]}>Share ID photos to improve matching</Text>
        <Switch value={share} onValueChange={(v) => { setShare(v); setSettings({ sharePhotos: v }); }} />
      </View>
      <Muted>Off: only the match + your correction are logged. Avoid faces and plates in frame.</Muted>

      <Text style={st.h2}>Account (optional)</Text>
      <Muted>Not needed on scene. Links your ID feedback across devices.</Muted>
      <Card style={{ marginTop: S.sm }}>
        {user ? (
          <>
            <Text style={st.body}>Signed in: {user.email}</Text>
            <Btn tone="ghost" label="SIGN OUT" onPress={signOut} />
          </>
        ) : (
          <>
            <TextInput style={st.input} placeholder="Email" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            {sent && <TextInput style={st.input} placeholder="6-digit code" placeholderTextColor={C.muted} keyboardType="number-pad" value={code} onChangeText={setCode} />}
            {!sent
              ? <Btn label="EMAIL ME A CODE" disabled={!email.includes('@')} onPress={async () => { setMsg(''); try { await sendCode(email.trim()); setSent(true); if (USE_MOCKS) setMsg('Mock mode: code is 123456'); } catch (e) { setMsg((e as Error).message); } }} />
              : <Btn label="SIGN IN" disabled={code.length < 6} onPress={async () => { setMsg(''); try { await verifyCode(email.trim(), code.trim()); } catch (e) { setMsg((e as Error).message); } }} />}
            {!!msg && <Muted>{msg}</Muted>}
          </>
        )}
      </Card>

      <Text style={st.h2}>About</Text>
      <Muted>Data {DATA_VERSION} · {USE_MOCKS ? 'mock mode' : BACKEND_READY ? 'live backend' : 'offline only'}</Muted>
      <Text style={[st.body, { marginTop: S.sm }]}>{DISCLAIMER}</Text>
    </Screen>
  );
}
