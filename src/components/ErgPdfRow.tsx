// "ERG guides (PDF)" row — Downloads and Scene-ready setup.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, LinkRow, Muted, st } from './ui';
import { Icon } from './Icon';
import { ensureErgPdfs, ERG_DOCS, ergState } from '../lib/erg-pdfs';
import { C } from '../theme';

export function ErgPdfRow({ list }: { list?: boolean }) {
  const r = useRouter();
  const [s, setS] = useState<{ have: number; total: number; missing: string[] } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => ergState().then(setS);
  useEffect(() => { refresh(); }, []);
  const all = s && !s.missing.length;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={all ? 'check' : 'cloud'} size={22} color={all ? C.green : C.muted} />
        <Text style={[st.body, { fontWeight: '700', flex: 1 }]}>ERG guides (PDF)</Text>
      </View>
      <Muted>{s ? `${s.have} of ${s.total} on this phone — Guides 147, 138, 171, 154, 115, 125 and the full ERG 2024.` : 'Checking…'}</Muted>
      {!all && <Btn size="sm" tone="hazmat" icon="dl" disabled={busy} label={busy ? msg || 'Downloading…' : 'Download'}
        onPress={async () => { setBusy(true); const o = await ensureErgPdfs((d, t) => setMsg(`Downloading ${d} of ${t}…`)); setBusy(false); setMsg(o.failed ? `${o.failed} didn't download — try again with signal.` : ''); refresh(); }} />}
      {!!msg && !busy && <Muted>{msg}</Muted>}
      {list && ERG_DOCS.map((d) => <LinkRow key={d.key} icon="book" title={d.title} onPress={() => r.push(d.key === 'full' ? '/pdf?doc=full' : `/pdf?guide=${d.key}`)} />)}
    </Card>
  );
}
