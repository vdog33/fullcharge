// "Offline VIN decoder" row — used in Downloads and in Scene-ready setup.
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, Card, Muted, st } from './ui';
import { Icon } from './Icon';
import { downloadVinDb, vinDbState, VinDbState } from '../lib/vin-offline';
import { C } from '../theme';

export function VinDbRow({ onChange }: { onChange?: (s: VinDbState) => void }) {
  const [s, setS] = useState<VinDbState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const refresh = () => vinDbState().then((x) => { setS(x); onChange?.(x); });
  useEffect(() => { refresh(); }, []);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={s?.onPhone ? 'check' : 'cloud'} size={22} color={s?.onPhone ? C.green : C.muted} />
        <Text style={[st.body, { fontWeight: '700', flex: 1 }]}>Offline VIN decoder</Text>
      </View>
      <Muted>{s?.onPhone
        ? `On this phone${s.bytes ? ` · ${(s.bytes / 1e6).toFixed(1)} MB` : ''}${s.version ? ` · NHTSA data ${s.version}` : ''}. VINs decode to make + model with no signal.`
        : 'Decodes a VIN to make + model with no signal (NHTSA data, makes with cut sheets).'}</Muted>
      <Btn size="sm" tone={s?.onPhone ? 'outline' : 'hazmat'} icon="dl" disabled={busy}
        label={busy ? 'Downloading…' : s?.onPhone ? 'Check for update' : 'Download'}
        onPress={async () => { setBusy(true); setMsg(''); const r = await downloadVinDb(); setMsg(r.msg); setBusy(false); refresh(); }} />
      {!!msg && <Muted>{msg}</Muted>}
    </Card>
  );
}
