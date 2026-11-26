import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, H1, H2, Input, LinkRow, Muted, Screen, Toggle, st } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import { getSettings, setSettings } from '../../src/lib/history';
import { DATA_VERSION } from '../../src/data/catalog';
import { USE_MOCKS, BACKEND_READY } from '../../src/config';

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
      <LinkRow icon="check" title="Scene-ready setup" sub="Role, cut sheets, VIN decoder, map areas, airplane test" onPress={() => r.push('/setup')} />
      <LinkRow icon="dl" title="Downloads (data packs)" onPress={() => r.push('/settings/downloads')} />

      <H2>Camera ID</H2>
      <Toggle label="Share ID photos to improve matching" sub="Off: only the match + your correction are logged. Avoid faces and plates in frame."
        value={share} onChange={(v) => { setShare(v); setSettings({ sharePhotos: v }); }} />

      <H2 sub="Not needed on scene. Links your ID feedback across devices.">Account (optional)</H2>
      {user ? (
        <Card>
          <Text style={st.body}>Signed in: {user.email}</Text>
          <Btn tone="outline" size="sm" label="Sign out" onPress={signOut} />
        </Card>
      ) : (
        <>
          <Input label="Email" placeholder="name@department.gov" autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" value={email} onChangeText={setEmail} />
          {sent && <Input label="6-digit code" placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={setCode} />}
          {!sent
            ? <Btn label="Email me a code" disabled={!email.includes('@')} reason="Type your email first."
                onPress={async () => { setMsg(''); try { await sendCode(email.trim()); setSent(true); if (USE_MOCKS) setMsg('Mock mode: code is 123456'); } catch (e) { setMsg((e as Error).message); } }} />
            : <Btn label="Sign in" disabled={code.length < 6} reason="Type the 6-digit code from the email."
                onPress={async () => { setMsg(''); try { await verifyCode(email.trim(), code.trim()); } catch (e) { setMsg((e as Error).message); } }} />}
          {!!msg && <Muted>{msg}</Muted>}
        </>
      )}

      <H2>About</H2>
      <Muted>Data {DATA_VERSION} · {USE_MOCKS ? 'mock mode' : BACKEND_READY ? 'live backend' : 'offline only'}</Muted>
    </Screen>
  );
}
