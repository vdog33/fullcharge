import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigNav, Btn, CardBtn, Grid, Icon, Input, Muted, Notice, Screen, TabBar, Wordmark, st } from '../src/components/ui';
import { IconName } from '../src/components/Icon';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { SceneBadge } from '../src/components/SceneBadge';
import { startIncident } from '../src/components/ShareToZoneBtn';
import { useAuth } from '../src/lib/auth';
import { ago, getMyIncident, Incident, liveIncidents, myGroups, OPEN_ZONE, pastIncidents, setMyUnit, watchIncidents } from '../src/lib/zone-share';
import { toCompass } from '../src/lib/geo';
import { BESS } from '../src/data/catalog';
import { BETA } from '../src/config';
import { C, R } from '../src/theme';

// Corner menu: things you set up at the station, not on scene.
const MENU: [string, string, IconName][] = [
  ['Zone sharing', '/zone', 'users'], ['Downloads', '/settings/downloads', 'dl'], ['ID History', '/history', 'id'], ['Settings', '/settings', 'gear'],
];

type HomeTab = 'Active' | 'Past' | 'Start new';
const TABS: { key: HomeTab; label: string; icon: IconName }[] = [
  { key: 'Active', label: 'Active', icon: 'fire' }, { key: 'Past', label: 'Past', icon: 'clock' }, { key: 'Start new', label: 'Start new', icon: 'plus' },
];

export default function Home() {
  const r = useRouter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const { width: W, height: H } = useWindowDimensions();
  // iPad: the big buttons share the screen below the logo, badge, tabs and Start incident.
  const tilesH = W >= 700 ? H - 520 : undefined;
  const { user } = useAuth();
  const [tab, setTab] = useState<HomeTab>('Start new');
  const picked = useRef(false);
  const [active, setActive] = useState<Incident[]>([]);
  const [past, setPast] = useState<Incident[]>([]);
  const [mine, setMine] = useState<Incident | null>(null);
  const [askUnit, setAskUnit] = useState(false);
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    if (!user && !OPEN_ZONE) return;
    try {
      const ids = (await myGroups()).map((g) => g.id);
      const [a, p, m] = await Promise.all([liveIncidents(ids), pastIncidents(ids), getMyIncident()]);
      setActive(a); setPast(p); setMine(m);
      // Open on Active when something is going on, else Start new — only until the crew picks a tab.
      if (!picked.current) setTab(a.length ? 'Active' : 'Start new');
    } catch { /* no signal: Start new still works */ }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => (user || OPEN_ZONE ? watchIncidents(() => load()) : undefined), [user?.id]);

  async function start() {
    setErr(''); setBusy(true);
    try {
      if (askUnit && unit.trim()) await setMyUnit(unit);
      const out = await startIncident();
      if (out.needUnit) setAskUnit(true);
      else if (out.incident) { setAskUnit(false); r.push(`/command?incident=${out.incident.id}`); }
    } catch (e) { setErr((e as Error).message || 'No signal — try again.'); }
    setBusy(false);
  }
  useFocusEffect(useCallback(() => () => setMenu(false), []));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Screen>
        {/* FULLCHARGE wordmark — big enough to read at arm's length, not a whole banner. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, alignItems: 'center' }}><Wordmark fill /></View>
          {/* Labelled, not just an icon — easy for everyone to find. */}
          <Pressable onPress={() => setMenu(!menu)} accessibilityRole="button" accessibilityState={{ expanded: menu }} accessibilityLabel="Menu: Zone sharing, Downloads, ID History, Settings"
            style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 56, paddingHorizontal: 8, borderRadius: R.card, borderWidth: 2, borderColor: menu ? C.text : C.line, backgroundColor: pressed || menu ? C.surface2 : 'transparent' })}>
            <Icon name={menu ? 'x' : 'menu'} size={24} />
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{menu ? 'Close' : 'Menu'}</Text>
          </Pressable>
        </View>
        {menu && (
          <View style={{ borderWidth: 2, borderColor: C.text, borderRadius: R.card, backgroundColor: C.surface, overflow: 'hidden' }}>
            {MENU.map(([l, p, ic], i) => (
              <Pressable key={p} onPress={() => { setMenu(false); r.push(p); }} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: C.border, backgroundColor: pressed ? C.surface2 : 'transparent' })}>
                <Icon name={ic} size={24} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 18, flex: 1 }}>{l}</Text>
                <Icon name="chev" size={22} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Scene-ready: green when this phone works with no signal; yellow when it needs a re-check. */}
        <SceneBadge />

        <TabBar tabs={TABS} value={tab} onChange={(t) => { picked.current = true; setTab(t); }} label="Incidents" />

        {tab === 'Active' && <>
          {!active.length && <Notice tone="info" title="No active incidents">Start one from Start new — or share from any vehicle page.</Notice>}
          {active.map((i) => <IncidentCard key={i.id} i={i} mine={mine?.id === i.id} onPress={() => r.push(`/command?incident=${i.id}`)} />)}
        </>}

        {tab === 'Past' && <>
          {!past.length && <Muted>No completed incidents in the last 7 days.</Muted>}
          {past.map((i) => <IncidentCard key={i.id} i={i} past onPress={() => r.push(`/command?incident=${i.id}`)} />)}
        </>}

        {tab === 'Start new' && <>
          {/* Big choice 1: run the incident on the command screen. A unit runs one at a time. */}
          {mine
            ? <BigNav tone="red" icon="fire" title="Back to your incident" sub={`${mine.vehicle || 'Vehicle not set'} · started ${ago(mine.created_at)}`} onPress={() => r.push(`/command?incident=${mine.id}`)} />
            : <BigNav tone="red" icon="users" title={busy ? 'Starting…' : 'Start incident'} sub="Command screen: map, weather, cut sheet — shared to your zone" onPress={start} />}
          {askUnit && (
            <View style={{ gap: 8 }}>
              <Input label="Your unit (once — remembered)" placeholder="e.g. Vista E151" value={unit} onChangeText={setUnit} autoFocus />
              <Btn tone="red" label="Start incident" disabled={!unit.trim() || busy} reason="Type your unit." onPress={start} />
            </View>
          )}
          {!!err && <Notice tone="warn">{err}</Notice>}

          {/* Big choice 2: just look something up. */}
          <Text style={[st.label, { marginTop: 4 }]}>Or look up a cut sheet</Text>
          <LastVehicleBar />
          <Grid fillH={tilesH}>
            <BigNav icon="cam" title="Identify by camera" sub="Photograph the non-damaged side" onPress={() => r.push('/camera')} />
            <BigNav icon="search" title="Search a vehicle" sub="Make / model · VIN" onPress={() => r.push('/search')} />
            <BigNav icon="batt" title="BESS" sub={`${BESS.length} home battery systems`} onPress={() => r.push('/bess')} />
            <BigNav icon="pin" title="Isolation zones + map" sub="Starts on your location" onPress={() => r.push('/zones')} />
            {BETA && <BigNav icon="flask" title="Test" sub="Beta: 20 vehicles — cut sheets broken down" onPress={() => r.push('/test')} />}
          </Grid>

          {/* Small link — Recents can matter on scene, but it isn't one of the big ones. */}
          <Pressable onPress={() => r.push('/recents')} accessibilityRole="button"
            style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: pressed ? C.surface : 'transparent' })}>
            <Icon name="clock" size={20} color={C.muted} />
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 17, textDecorationLine: 'underline' }}>Recents</Text>
          </Pressable>
        </>}
      </Screen>
    </View>
  );
}

function IncidentCard({ i, mine, past, onPress }: { i: Incident; mine?: boolean; past?: boolean; onPress: () => void }) {
  return (
    <CardBtn onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[st.label, { color: past ? C.muted : C.redText, flex: 1 }]}>
          {past ? `${i.status === 'cleared' ? 'Ended' : 'Timed out'} · ${new Date(i.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : `Live · started ${ago(i.created_at)}`}
        </Text>
        {mine && <Text style={{ color: C.hazmatText, backgroundColor: C.hazmat, fontWeight: '800', fontSize: 13, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>YOURS</Text>}
      </View>
      <Text style={[st.body, { fontWeight: '700', fontSize: 20 }]}>{i.vehicle || 'Vehicle not set'}</Text>
      <Text style={st.body}>{[i.unit, i.place, i.wind_from_deg != null ? `wind from ${toCompass(i.wind_from_deg)}` : ''].filter(Boolean).join(' · ')}</Text>
    </CardBtn>
  );
}
