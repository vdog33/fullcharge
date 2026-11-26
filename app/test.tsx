// Beta Test list: the 20 vehicles we prove the dissected cut sheets on. Shows straight away what's missing.
import React, { useEffect, useMemo, useReducer } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CardBtn, H1, Muted, Notice, Pill, Screen, st } from '../src/components/ui';
import { isTestMatch, TEST_VEHICLES } from '../src/data/test-vehicles';
import { calloutStatus, ensureCallouts, subscribeCallouts } from '../src/lib/callouts';
import { guideIndex, loadPacks, subscribe } from '../src/lib/packs';
import { C } from '../src/theme';

export default function TestList() {
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { loadPacks().then(force); ensureCallouts().then(force); const a = subscribe(force), b = subscribeCallouts(force); return () => { a(); b(); }; }, []);
  const index = guideIndex();
  const rows = useMemo(() => TEST_VEHICLES.map((t) => {
    const gs = index.filter((g) => isTestMatch(t, g));
    const sheets = gs.filter((g) => g.docType === 'rescue_sheet');
    const st_ = calloutStatus(sheets.map((g) => g.key));
    return { t, gs, sheets, st: st_ };
  }), [index.length]);
  const missing = rows.filter((x) => !x.gs.length).length;
  const checked = rows.filter((x) => x.st.kind === 'checked').length;

  return (
    <Screen>
      <H1>Test vehicles</H1>
      <Muted>Beta only. Each one gets its cut sheet broken down into Cut loop, HV disconnect, 12V and more — shown in the app only after you check it.</Muted>
      {!index.length && <Notice tone="info">The vehicle list hasn't loaded yet — open the app once with signal.</Notice>}
      {!!index.length && (
        <Notice tone={missing ? 'warn' : 'ok'} title={`${checked} of 20 checked · ${missing} missing a cut sheet`}>
          {missing ? 'Missing ones are a gap in the cut-sheet data to fix.' : 'Every test vehicle has a cut sheet.'}
        </Notice>
      )}
      {rows.map(({ t, gs, sheets, st: s }) => (
        <CardBtn key={t.make + t.model} disabled={!gs.length}
          onPress={() => gs.length && r.push(`/guide?keys=${gs.map((g) => g.key).join(',')}&title=${encodeURIComponent(`${t.make} ${t.model}`)}`)}>
          <Text style={[st.body, { fontWeight: '700', fontSize: 19 }]}>{t.make} {t.model}</Text>
          {!!t.why && <Text style={st.muted}>{t.why}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {!gs.length ? <Pill tone="recall" icon="warn" label="MISSING — no cut sheet" />
              : <Pill label={`${sheets.length} rescue sheet${sheets.length === 1 ? '' : 's'} · ${gs.length - sheets.length} ERG`} />}
            {gs.length > 0 && (s.kind === 'checked'
              ? <Pill tone="ok" icon="check" label={`Checked by ${s.by}${s.at ? `, ${s.at}` : ''}`} />
              : s.kind === 'proposed' ? <Pill tone="sig" label="Broken down — waiting for your check" /> : <Pill tone="sig" label="Not broken down yet" />)}
          </View>
        </CardBtn>
      ))}
      <Text style={[st.muted, { color: C.muted }]}>Break-down and checking happen on the PC: tools/callouts (see its README).</Text>
    </Screen>
  );
}
