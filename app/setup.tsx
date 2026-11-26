// Scene-ready setup: one time, at the station, with Wi-Fi. Role → cut sheets → VIN decoder → map areas →
// airplane-mode test. After it passes, everything a crew needs works with no signal.
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import MapView, { Polygon } from 'react-native-maps';
import { Btn, Card, H1, Input, Muted, Notice, Screen, Toggle, st } from '../src/components/ui';
import { Icon, IconName } from '../src/components/Icon';
import { VinDbRow } from '../src/components/VinDbRow';
import { allReady, coreReady, getPackState, guideIndex, loadPacks, sheetPageUris, startOrResume, subscribe, transferRate } from '../src/lib/packs';
import { vinDbState } from '../src/lib/vin-offline';
import { addArea, deleteArea, downloadArea, getAreas, isDownloading, loadAreas, spotCheckTiles, subscribeAreas } from '../src/lib/tiles';
import { AVG_TILE_BYTES, boxFromRegion, boxKm, countTiles, inUsgsCoverage, MAX_AREA_TILES, MAX_AREAS, BBox } from '../src/lib/tiles-core';
import { commandDefault, getSetup, Role, ROLES, setSetup, SetupState } from '../src/lib/setup';
import { lastFix, quickFix } from '../src/lib/here';
import { isTestMatch, TEST_VEHICLES } from '../src/data/test-vehicles';
import { C, F, R, S } from '../src/theme';

const STEPS: { key: string; title: string; icon: IconName; line: string }[] = [
  { key: 'role', title: 'Who are you?', icon: 'users', line: 'One tap. Sets what the app puts first.' },
  { key: 'sheets', title: 'Cut sheets', icon: 'book', line: 'Every manufacturer rescue sheet, on this phone.' },
  { key: 'vin', title: 'VIN decoder', icon: 'id', line: 'Decode a VIN with no signal.' },
  { key: 'maps', title: 'Your map areas', icon: 'pin', line: 'Aerial map of your district — works with no signal.' },
  { key: 'test', title: 'Airplane-mode test', icon: 'check', line: 'Prove it works before you need it.' },
];
const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

export default function Setup() {
  const r = useRouter();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<SetupState>({});
  useEffect(() => { getSetup().then(setS); }, []);
  const go = (n: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  const cur = STEPS[step];

  return (
    <Screen>
      {/* Progress: five big dots, tap any to jump. */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {STEPS.map((x, i) => (
          <Pressable key={x.key} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${x.title}`}
            style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i <= step ? C.red : C.surface2 }} />
        ))}
      </View>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: S.md }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={cur.icon} size={42} />
        </View>
        <Text style={{ color: C.muted, fontFamily: F.narrowBold, fontSize: 15, letterSpacing: 1 }}>STEP {step + 1} OF {STEPS.length}</Text>
        <Text style={{ color: C.text, fontFamily: F.display, fontSize: 30, textAlign: 'center' }}>{cur.title}</Text>
        <Text style={[st.body, { color: C.muted, textAlign: 'center' }]}>{cur.line}</Text>
      </View>

      {cur.key === 'role' && <RoleStep s={s} onChange={async (p) => { await setSetup(p); setS(await getSetup()); }} />}
      {cur.key === 'sheets' && <SheetsStep />}
      {cur.key === 'vin' && <VinDbRow />}
      {cur.key === 'maps' && <MapsStep />}
      {cur.key === 'test' && <TestStep onPass={async (checks) => { await setSetup({ readyAt: Date.now(), checks }); setS(await getSetup()); }} done={!!s.readyAt} onHome={() => r.back()} />}

      <View style={{ flexDirection: 'row', gap: S.sm }}>
        {step > 0 && <View style={{ flex: 1 }}><Btn tone="outline" icon="back" label="Back" onPress={() => go(step - 1)} /></View>}
        {step < STEPS.length - 1
          ? <View style={{ flex: 2 }}><Btn tone="red" label="Next" icon="chev" onPress={() => go(step + 1)} /></View>
          : <View style={{ flex: 2 }}><Btn tone={s.readyAt ? 'red' : 'neutral'} icon="check" label="Finish setup"
              sub={s.readyAt ? 'Scene-ready' : 'Saved — badge stays yellow until the test passes'} onPress={async () => { await setSetup({ setupDoneAt: Date.now() }); r.replace('/'); }} /></View>}
      </View>
      <Muted>Text size follows your iPhone: Settings → Display & Brightness → Text Size.</Muted>
    </Screen>
  );
}

function RoleStep({ s, onChange }: { s: SetupState; onChange: (p: Partial<SetupState>) => void }) {
  return (
    <View style={{ gap: S.sm }}>
      {ROLES.map((x) => {
        const on = s.role === x.key;
        return (
          <Pressable key={x.key} onPress={() => onChange({ role: x.key, commandView: commandDefault(x.key) })} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 14, borderRadius: R.card, borderWidth: 2,
              borderColor: on ? '#FFF' : C.line, backgroundColor: on ? '#FFF' : pressed ? C.surface2 : C.surface })}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: on ? C.hazmatText : C.text, fontFamily: F.display, fontSize: 20 }}>{x.label}</Text>
              <Text style={{ color: on ? C.hazmatText : C.muted, fontSize: 15 }}>{x.sub}</Text>
            </View>
            {on && <Icon name="check" size={26} color={C.hazmatText} />}
          </Pressable>
        );
      })}
      {s.role === 'captain' && (
        <Toggle label="Command view" sub="On iPad: map on the left, cut sheet or ERG on the right." value={!!s.commandView} onChange={(v) => onChange({ commandView: v })} />
      )}
    </View>
  );
}

function SheetsStep() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [msg, setMsg] = useState('');
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  const ps = getPackState('nhtsa-rescue');
  const ready = coreReady() && allReady();
  const pct = ps.bytesTotal ? Math.round((100 * ps.bytesDone) / ps.bytesTotal) : 0;
  const rate = transferRate('nhtsa-rescue');
  async function get() {
    setMsg('');
    if ((await NetInfo.fetch()).isConnected === false) return setMsg('No signal — do this on Wi-Fi at the station.');
    try { await startOrResume('core'); await startOrResume('nhtsa-rescue'); } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={ready ? 'check' : 'cloud'} size={24} color={ready ? C.green : C.muted} />
        <Text style={[st.body, { fontWeight: '700', flex: 1 }]}>{ready ? 'All rescue sheets on this phone' : ps.status === 'downloading' ? `Downloading… ${pct}%` : 'Not all on this phone yet'}</Text>
      </View>
      {ps.status === 'downloading' && (
        <>
          <View style={{ height: 14, borderRadius: 7, backgroundColor: C.surface2, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.red }} />
          </View>
          <Muted>{mb(ps.bytesDone)} of {mb(ps.bytesTotal)}{rate ? ` · ${(rate / 1e6).toFixed(1)} MB/s` : ''} — keeps going if you leave this screen.</Muted>
        </>
      )}
      {!ready && ps.status !== 'downloading' && <Btn tone="hazmat" icon="dl" label="Download cut sheets" onPress={get} />}
      {!!msg && <Muted>{msg}</Muted>}
    </Card>
  );
}

function MapsStep() {
  const { height } = useWindowDimensions();
  const [, force] = useReducer((x) => x + 1, 0);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  const [start, setStart] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const prog = useRef<Record<string, string>>({});
  useEffect(() => {
    loadAreas().then(force);
    const f = lastFix();
    const at = (p: { lat: number; lng: number }) => setStart({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 });
    if (f) at(f); else quickFix().then((x) => (x && x !== 'denied' ? at(x) : setStart({ latitude: 33.2, longitude: -117.3, latitudeDelta: 0.3, longitudeDelta: 0.3 })));
    return subscribeAreas(force);
  }, []);
  const box: BBox | null = region ? boxFromRegion(region) : null;
  const tiles = box ? countTiles(box) : 0;
  const km = box ? boxKm(box) : null;
  const areas = getAreas();
  const tooBig = tiles > MAX_AREA_TILES;

  async function save() {
    setMsg('');
    if (!box) return;
    if (!inUsgsCoverage(box)) return setMsg('Offline aerial covers the US and territories only.');
    if ((await NetInfo.fetch()).isConnected === false) return setMsg('No signal — do this on Wi-Fi.');
    const a = await addArea(name, box);
    if (typeof a === 'string') return setMsg(a);
    setName('');
    const out = await downloadArea(a.id, (d, t) => { prog.current[a.id] = `${Math.round((100 * d) / t)}%`; force(); });
    setMsg(out.failed ? `${out.failed} map pieces didn't download — tap Finish to retry.` : `${a.name} saved — works with no signal.`);
  }

  return (
    <View style={{ gap: S.sm }}>
      <Muted>Move and zoom the map until the box covers your area (first-in district, a zone). Up to {MAX_AREAS} areas.</Muted>
      {start && (
        <View style={{ height: Math.min(420, height * 0.5), borderRadius: R.card, overflow: 'hidden', borderWidth: 2, borderColor: tooBig ? C.redText : C.hazmat }}>
          <MapView style={{ flex: 1 }} initialRegion={start} mapType="hybrid" rotateEnabled={false} pitchEnabled={false} userInterfaceStyle="dark"
            showsUserLocation onRegionChangeComplete={setRegion}>
            {areas.map((a) => (
              <Polygon key={a.id} strokeColor={C.green} strokeWidth={2} fillColor="rgba(126,226,160,0.12)"
                coordinates={[{ latitude: a.box.n, longitude: a.box.w }, { latitude: a.box.n, longitude: a.box.e }, { latitude: a.box.s, longitude: a.box.e }, { latitude: a.box.s, longitude: a.box.w }]} />
            ))}
          </MapView>
          <View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: 8 }}>
            <Text style={{ color: tooBig ? C.redText : C.text, fontWeight: '700', fontSize: 16 }}>
              {km ? `This box: ${km.w.toFixed(0)} × ${km.h.toFixed(0)} km · about ${mb(tiles * AVG_TILE_BYTES)}` : 'Move the map'}{tooBig ? ' — too big, zoom in' : ''}
            </Text>
          </View>
        </View>
      )}
      <Input label="Name this area" placeholder="e.g. Station 3 first-in, North Zone" value={name} onChangeText={setName} />
      <Btn tone="hazmat" icon="dl" label={areas.length >= MAX_AREAS ? `${MAX_AREAS} areas saved — delete one first` : 'Save this area for offline'}
        disabled={!box || tooBig || areas.length >= MAX_AREAS} reason={tooBig ? 'Zoom in — the box is too big.' : 'Move the map first.'} onPress={save} />
      {!!msg && <Muted>{msg}</Muted>}
      {areas.map((a) => {
        const done = (a.done ?? 0) >= a.tiles * 0.95;
        const busy = isDownloading(a.id);
        return (
          <Card key={a.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name={done ? 'check' : 'cloud'} size={22} color={done ? C.green : C.muted} />
              <Text style={[st.body, { fontWeight: '700', flex: 1 }]}>{a.name}</Text>
            </View>
            <Muted>{busy ? `Downloading ${prog.current[a.id] ?? ''}` : done ? `On this phone · ${mb(a.tiles * AVG_TILE_BYTES)}` : 'Not finished'}</Muted>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              {!done && !busy && <View style={{ flex: 1 }}><Btn size="sm" icon="dl" label="Finish" onPress={() => downloadArea(a.id, (d, t) => { prog.current[a.id] = `${Math.round((100 * d) / t)}%`; force(); })} /></View>}
              <View style={{ flex: 1 }}>
                <Btn size="sm" tone={sure === a.id ? 'danger' : 'outline'} label={sure === a.id ? 'Tap again to delete' : 'Delete'}
                  onPress={() => (sure === a.id ? (deleteArea(a.id), setSure(null)) : setSure(a.id))} />
              </View>
            </View>
          </Card>
        );
      })}
      <Muted>Offline aerial: USGS The National Map (public domain). With signal you get Apple Maps as usual.</Muted>
    </View>
  );
}

type Check = { key: 'sheets' | 'vin' | 'maps'; label: string; ok: boolean | null; fix?: string };
function TestStep({ onPass, done, onHome }: { onPass: (c: Record<string, boolean>) => void; done: boolean; onHome: () => void }) {
  const [res, setRes] = useState<Check[] | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    setMsg(''); setRes(null);
    const n = await NetInfo.fetch();
    if (n.isConnected !== false && n.isInternetReachable !== false) return setMsg('Still has signal. Swipe down from the top-right corner, tap the airplane, then test again.');
    setBusy(true);
    await loadPacks();
    // Open a real cut sheet page from the phone: a Test vehicle's sheet must be a local file.
    const g = guideIndex().find((x) => x.docType === 'rescue_sheet' && TEST_VEHICLES.some((t) => isTestMatch(t, x)));
    const page = g ? (await sheetPageUris(g).catch(() => []))[0] : undefined;
    const sheets = coreReady() && allReady() && !!page?.local;
    const vin = (await vinDbState()).onPhone;
    const maps = await spotCheckTiles();
    const out: Check[] = [
      { key: 'sheets', label: 'Cut sheets open', ok: sheets, fix: 'Step 2 — download cut sheets' },
      { key: 'vin', label: 'VIN decodes', ok: vin, fix: 'Step 3 — get the VIN decoder' },
      { key: 'maps', label: 'Map shows your area', ok: maps, fix: 'Step 4 — save a map area' },
    ];
    setRes(out); setBusy(false);
    if (out.every((c) => c.ok)) onPass({ sheets, vin, maps });
  }
  const pass = res?.every((c) => c.ok);
  return (
    <View style={{ gap: S.sm }}>
      {!res && <Notice tone="info" icon="signal" title="Turn on Airplane Mode">Then tap Test. Turn it back off after.</Notice>}
      <Btn tone="red" icon="check" label={busy ? 'Testing…' : 'Test — no signal'} disabled={busy} onPress={run} />
      {!!msg && <Notice tone="warn">{msg}</Notice>}
      {res?.map((c) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, padding: 12, borderRadius: R.card, backgroundColor: C.surface, borderWidth: 2, borderColor: c.ok ? '#2F7A4D' : C.redText }}>
          <Icon name={c.ok ? 'check' : 'x'} size={28} color={c.ok ? C.green : C.redText} />
          <View style={{ flex: 1 }}>
            <Text style={[st.body, { fontWeight: '700' }]}>{c.label}</Text>
            {!c.ok && <Text style={st.muted}>{c.fix}</Text>}
          </View>
        </View>
      ))}
      {(pass || (done && !res)) && (
        <View style={{ alignItems: 'center', gap: 8, padding: S.lg, borderRadius: R.card, borderWidth: 3, borderColor: C.green, backgroundColor: '#0F2A1A' }}>
          <Icon name="check" size={48} color={C.green} />
          <Text style={{ color: C.green, fontFamily: F.display, fontSize: 30 }}>SCENE-READY</Text>
          <Text style={[st.body, { textAlign: 'center' }]}>This phone works with no signal. Turn Airplane Mode back off.</Text>
          <Btn tone="neutral" label="Done" onPress={onHome} />
        </View>
      )}
    </View>
  );
}
