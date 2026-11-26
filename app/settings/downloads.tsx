import React, { useEffect, useReducer, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn, H1, Muted, Notice, Pill, Screen, Toggle, st } from '../../src/components/ui';
import {
  IMAGE_SET, allReady, checkRemote, coreReady, deletePack, freeSpace, getPackState, incomplete, installedManifest, loadPacks, PackDef, PACKS,
  packSize, pause, pendingBytes, remoteManifest, startOrResume, subscribe, transferRate, updateAvailable, usedBytes,
} from '../../src/lib/packs';
import { getSettings, setSettings } from '../../src/lib/history';
import { C, F, R } from '../../src/theme';

const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(0)} MB`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "20261124-0901" → "24 Nov 2026, 09:01" (F28). Anything else is shown as is. */
const fmtVersion = (v: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(v);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}` : v;
};
const fmtEta = (s: number) => (s < 90 ? 'under 2 min left' : s < 3600 ? `about ${Math.round(s / 60)} min left` : `about ${(s / 3600).toFixed(1)} h left`);

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
  const used = usedBytes();
  const usedPct = Number.isFinite(free) && used + free > 0 ? Math.max(1, Math.round((used / (used + free)) * 100)) : 1;

  return (
    <Screen>
      <H1>Downloads</H1>
      <Notice tone={full ? 'ok' : 'warn'} icon={full ? 'check' : 'cloud'}>
        <Text style={[st.body, { fontSize: 17, fontWeight: '700' }]}>{full ? 'Every rescue sheet is on this device — no signal needed to open them.' : 'Rescue sheets not fully downloaded — some need signal.'}</Text>
        <Text style={st.muted}>Cut loops, 12V, BESS, ERG 147 and zones are built in and always work offline. Photo ID always needs signal.</Text>
      </Notice>

      <View style={{ gap: 6 }}>
        <View style={{ height: 12, borderRadius: 6, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }} importantForAccessibility="no">
          <View style={{ width: `${usedPct}%`, height: '100%', backgroundColor: C.hazmat }} />
        </View>
        <Muted>On this device: {fmtBytes(used)} · Free: {Number.isFinite(free) ? fmtBytes(free) : '—'}</Muted>
      </View>

      <Toggle label="Wi-Fi only" sub={`Rescue sheets download as ${IMAGE_SET === '300' ? 'sharper iPad' : 'iPhone'} images.`}
        value={wifiOnly} onChange={(v) => { setWifi(v); setSettings({ wifiOnly: v }); }} />
      <Muted>Big downloads keep going if you leave the app or lock the phone — just don't swipe FULLCHARGE closed in the app switcher (iOS cancels downloads for force-quit apps).</Muted>
      {checked === 'offline' && <Notice tone="info">Can't reach the server — showing what's on the phone.</Notice>}

      {PACKS.map((p) => <PackRow key={p.id} p={p} free={free} />)}
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
  const rec = p.required;
  const rate = s.status === 'downloading' ? transferRate(p.id) : null;
  const left = rate && s.bytesTotal ? (s.bytesTotal - s.bytesDone) / rate : null;

  async function go() {
    setErr('');
    try { await startOrResume(p.id); } catch (e) { setErr((e as Error).message); }
  }

  const head = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <Text style={[st.label, { flexShrink: 1 }]}>{p.name}{rec ? ' · get first' : ''}</Text>
      {p.id === 'maps' ? <Pill tone="sig" label="Not published yet" />
        : <Text style={{ color: C.text, fontFamily: F.black, fontSize: 24 }}>{size ? fmtBytes(size.bytes) : 'Small'}</Text>}
    </View>
  );
  const box = { borderWidth: 2, borderColor: rec ? C.hazmat : C.line, borderRadius: 16, backgroundColor: C.surface, padding: 14, gap: 8 } as const;

  if (p.id === 'maps') return <View style={box}>{head}<Text style={[st.body, { fontSize: 17 }]}>{p.blurb}</Text></View>;

  return (
    <View style={box}>
      {head}
      <Text style={[st.body, { fontSize: 17 }]}>{p.blurb}</Text>
      {m && size && <Muted>{size.files} files · list updated {fmtVersion(m.version)}</Muted>}
      {nhtsa && !m && <Muted>Connect once to load the cut-sheet list.</Muted>}
      {s.status === 'done' && <Text style={[st.muted, { color: C.green }]}>On this device · {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}</Text>}
      {incomplete(p.id) && !updateAvailable(p.id) && pend && (
        <Text style={[st.body, { color: C.hazmat, fontSize: 17 }]}>{pend.files} file(s) missing from this device ({fmtBytes(pend.bytes)}).</Text>
      )}
      {updateAvailable(p.id) && <Text style={[st.body, { color: C.hazmat, fontSize: 17 }]}>Update available{pend ? ` — ${pend.files} new / changed (${fmtBytes(pend.bytes)})` : ''}.</Text>}
      {(s.status === 'downloading' || s.status === 'paused') && (
        <>
          <View style={{ height: 12, backgroundColor: C.surface2, borderRadius: 6, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}
            accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.hazmat }} />
          </View>
          <Muted>
            {s.status === 'paused' ? (s.interrupted ? 'Paused — resumes when the app is open' : 'Paused') : 'Downloading'}
            {' · '}{s.bytesTotal ? `${pct}% · ${fmtBytes(s.bytesDone)} of ${fmtBytes(s.bytesTotal)}` : `${s.filesDone ?? 0} of ${s.filesTotal ?? '?'} files`}
          </Muted>
          {rate !== null && rate > 0 && <Muted>{(rate / 1e6).toFixed(1)} MB/s{left !== null ? ` · ${fmtEta(left)}` : ''}</Muted>}
        </>
      )}
      {tooBig && <Text style={[st.body, { color: C.hazmat, fontSize: 17 }]}>Not enough free space on this device.</Text>}
      {!!s.error && <Muted>{s.error}</Muted>}
      {!!err && <Text style={[st.body, { color: C.hazmat, fontSize: 17 }]}>{err}</Text>}
      <View style={{ gap: 8 }}>
        {(s.status === 'none' || s.status === 'error') && (
          <Btn tone={rec ? 'hazmat' : 'neutral'} size="sm" icon="dl" label={pend && pend.bytes ? `Download ${fmtBytes(pend.bytes)}` : 'Download'}
            disabled={!!tooBig || (nhtsa && !m)} reason={nhtsa && !m ? 'Needs signal once to load the list.' : tooBig ? 'Free up space first.' : undefined} onPress={go} />
        )}
        {s.status === 'downloading' && <Btn size="sm" label="Pause" onPress={() => pause(p.id)} />}
        {s.status === 'paused' && <Btn tone="hazmat" size="sm" icon="dl" label="Resume" onPress={go} />}
        {(updateAvailable(p.id) || (s.status === 'done' && !!s.error)) && <Btn tone="hazmat" size="sm" icon="dl" label="Update" onPress={go} />}
        {incomplete(p.id) && !updateAvailable(p.id) && !s.error && <Btn tone="hazmat" size="sm" icon="dl" label="Download missing files" onPress={go} />}
        {s.status === 'done' && <Btn tone="danger" size="sm" label="Delete from this device" onPress={() => deletePack(p.id)} />}
      </View>
    </View>
  );
}
