import React, { useEffect, useReducer, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Btn, Card, H1, Muted, Screen, st } from '../../src/components/ui';
import {
  IMAGE_SET, allReady, checkRemote, coreReady, deletePack, freeSpace, getPackState, installedManifest, loadPacks, PackDef, PACKS,
  packSize, pause, pendingBytes, remoteManifest, startOrResume, subscribe, updateAvailable, usedBytes,
} from '../../src/lib/packs';
import { getSettings, setSettings } from '../../src/lib/history';
import { C, S } from '../../src/theme';

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);

export default function Downloads() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [wifiOnly, setWifi] = useState(true);
  const [free, setFree] = useState(NaN);
  const [checked, setChecked] = useState<'idle' | 'checking' | 'ok' | 'offline'>('idle');
  useEffect(() => {
    loadPacks().then(force);
    getSettings().then((s) => setWifi(s.wifiOnly));
    freeSpace().then(setFree);
    setChecked('checking');
    checkRemote().then((m) => setChecked(m ? 'ok' : 'offline'));
    return subscribe(force);
  }, []);
  const full = coreReady() && allReady();

  return (
    <Screen>
      <H1>Downloads</H1>
      <Card style={{ marginTop: S.md, borderColor: full ? C.you : C.muted }}>
        <Text style={st.body}>{full ? 'Every rescue sheet is on this device — no signal needed to open them.' : 'Rescue sheets not fully downloaded — some need signal.'}</Text>
        <Muted>Cut loops, 12V, BESS, ERG 147 and zones are built in and always work offline. Photo ID always needs signal.</Muted>
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: S.md }}>
        <Text style={st.body}>Wi-Fi only</Text>
        <Switch value={wifiOnly} accessibilityLabel="Download on Wi-Fi only" onValueChange={(v) => { setWifi(v); setSettings({ wifiOnly: v }); }} />
      </View>
      <Muted>On this device: {fmtBytes(usedBytes())} · Free: {Number.isFinite(free) ? fmtBytes(free) : '—'}</Muted>
      <Muted>Rescue sheets download as {IMAGE_SET === '300' ? 'sharper iPad' : 'iPhone'} images.</Muted>
      <Muted>Big downloads keep going if you leave the app or lock the phone — just don't swipe FULLCHARGE closed in the app switcher (iOS cancels downloads for force-quit apps).</Muted>
      {checked === 'offline' && <Muted>Can't reach the server — showing what's on the phone.</Muted>}

      <View style={{ gap: S.md, marginTop: S.md }}>
        {PACKS.map((p) => <PackRow key={p.id} p={p} free={free} />)}
      </View>
    </Screen>
  );
}

function PackRow({ p, free }: { p: PackDef; free: number }) {
  const s = getPackState(p.id);
  const [err, setErr] = useState('');
  const pct = s.bytesTotal ? Math.min(100, Math.round((s.bytesDone / s.bytesTotal) * 100)) : 0;
  const pend = pendingBytes(p.id);
  const nhtsa = p.id === 'nhtsa-rescue' || p.id === 'nhtsa-erg';
  const m = nhtsa ? remoteManifest() ?? installedManifest() : null;
  const size = packSize(p.id);
  const tooBig = pend && Number.isFinite(free) && pend.bytes > free;

  async function go() {
    setErr('');
    try { await startOrResume(p.id); } catch (e) { setErr((e as Error).message); }
  }

  if (p.id === 'maps') {
    return <Card><Text style={st.label}>{p.name}</Text><Text style={st.body}>{p.blurb}</Text></Card>;
  }

  return (
    <Card>
      <Text style={st.label}>{p.name}{p.required ? ' · GET FIRST' : ''}</Text>
      <Text style={st.body}>{p.blurb}</Text>
      {m && size && <Muted>{size.files} PDFs · {fmtBytes(size.bytes)} · list {m.version}</Muted>}
      {nhtsa && !m && <Muted>Connect once to load the cut-sheet list.</Muted>}
      {s.status === 'none' && pend && <Muted>Download size: {fmtBytes(pend.bytes)} ({pend.files} files)</Muted>}
      {s.status === 'done' && <Muted>On this device · v{s.version} · {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}</Muted>}
      {updateAvailable(p.id) && <Text style={[st.body, { color: C.hazmat }]}>Update available{pend ? ` — ${pend.files} new / changed (${fmtBytes(pend.bytes)})` : ''}.</Text>}
      {(s.status === 'downloading' || s.status === 'paused') && (
        <>
          <View style={{ height: 10, backgroundColor: C.surface2, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: C.control }}
            accessibilityRole="progressbar" accessibilityLabel={`${p.name} download`} accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={{ width: `${pct}%`, height: 8, backgroundColor: C.text }} />
          </View>
          <Muted>{s.status === 'paused' ? (s.interrupted ? 'Paused — resumes when the app is open' : 'Paused') : 'Downloading'} · {s.bytesTotal ? `${pct}% · ${fmtBytes(s.bytesDone)} of ${fmtBytes(s.bytesTotal)}` : `${s.filesDone ?? 0} of ${s.filesTotal ?? '?'} files`}</Muted>
        </>
      )}
      {tooBig && <Text style={[st.body, { color: C.hazmat }]}>Not enough free space on this device.</Text>}
      {!!s.error && <Muted>{s.error}</Muted>}
      {!!err && <Text style={[st.body, { color: C.hazmat }]}>{err}</Text>}
      <View style={{ flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' }}>
        {(s.status === 'none' || s.status === 'error') && <Btn label="DOWNLOAD" disabled={!!tooBig || (nhtsa && !m)} onPress={go} />}
        {s.status === 'downloading' && <Btn label="PAUSE" onPress={() => pause(p.id)} />}
        {s.status === 'paused' && <Btn label="RESUME" onPress={go} />}
        {(updateAvailable(p.id) || (s.status === 'done' && !!s.error)) && <Btn label="UPDATE" onPress={go} />}
        {s.status === 'done' && <Btn tone="ghost" label="DELETE" onPress={() => deletePack(p.id)} />}
      </View>
    </Card>
  );
}
