import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Card, Field, H1, More, Muted, PageTabs, Screen, st } from '../../src/components/ui';
import { getVehicle, searchVehicles } from '../../src/data/catalog';
import { getIdHistory, logView, updateIdAttempt } from '../../src/lib/history';
import { sendFeedback } from '../../src/lib/identify';
import { C, S } from '../../src/theme';

export default function VehicleScreen() {
  const { id, idAt } = useLocalSearchParams<{ id: string; idAt?: string }>();
  const r = useRouter();
  const v = getVehicle(id);
  useEffect(() => { if (v) logView('vehicle', v.id); }, [v?.id]);
  if (!v) return <Screen><H1>Not found</H1><Btn label="SEARCH" onPress={() => r.replace('/search')} /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: `${v.make} ${v.model}` }} />
      <Muted>{v.make} · {v.years} · {v.type}</Muted>
      <H1>{v.model}</H1>
      <PageTabs kind="vehicle" id={v.id} />

      {!!v.warning && <Card style={{ borderColor: C.muted, marginBottom: S.sm }}><Text style={st.label}>Data note</Text><Text style={st.body}>{v.warning}</Text></Card>}
      {!!v.watch_for && <Card style={{ borderColor: C.red, marginBottom: S.sm }}><Text style={[st.label, { color: C.red }]}>Watch for</Text><Text style={st.body}>{v.watch_for}</Text></Card>}

      <Text style={st.h2}>ID cues</Text>
      <Bullets items={v.id_cues} />

      <Text style={st.h2}>On scene</Text>
      <Field label="Immobilise" value="Chock. Park / brake. No engine noise ≠ off." />
      <Field label="Cut loop" value={v.cut_loop} />
      <Field label="12V" value={v.lv_location} />
      <Field label="No-cut" value={v.no_cut_zones} />
      <Field label="Airbag / HV" value={v.airbag_hv} />
      <Field label="Pack" value={v.pack} />
      <Field label="Chemistry" value={v.chemistry} />
      <Field label="Tow" value={v.tow} />
      <Field label="Release" value={v.release} />

      <More title="Details">
        <Field label="ERG source" value={v.erg_pdf_label} />
        <Muted>Link check: {v.erg_verified_note}</Muted>
        <Muted>Chemistry verified: {v.chemistry_verified === true ? 'yes' : v.chemistry_verified === 'partial' ? 'partly' : 'no'}</Muted>
      </More>

      {!!idAt && <WasThisRight at={Number(idAt)} shownId={v.id} />}
    </Screen>
  );
}

/** Learning loop: "Was this right? Yes / No, it was ___". */
function WasThisRight({ at, shownId }: { at: number; shownId: string }) {
  const [done, setDone] = useState(false);
  const [no, setNo] = useState(false);
  const [text, setText] = useState('');
  const sugg = text.length > 1 ? searchVehicles(text).slice(0, 4) : [];

  async function submit(confirmedId: string | null, correction?: string) {
    await updateIdAttempt(at, { confirmedId, correction });
    const a = (await getIdHistory()).find((x) => x.at === at);
    await sendFeedback({ attemptId: a?.attemptId, feedbackToken: a?.feedbackToken, confirmed: confirmedId, correction });
    setDone(true);
  }

  if (done) return <Card style={{ marginTop: S.lg }}><Text style={st.body}>Logged. Thanks — this trains the next ID.</Text></Card>;
  return (
    <Card style={{ marginTop: S.lg }}>
      <Text style={st.label}>Was this right?</Text>
      {!no ? (
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn label="YES" onPress={() => submit(shownId)} /></View>
          <View style={{ flex: 1 }}><Btn tone="ghost" label="NO, IT WAS…" onPress={() => setNo(true)} /></View>
        </View>
      ) : (
        <View style={{ gap: S.sm }}>
          <TextInput style={st.input} placeholder="Make + model" placeholderTextColor={C.muted} value={text} onChangeText={setText} />
          {sugg.map((s) => <Btn key={s.id} label={`${s.make} ${s.model}`} onPress={() => submit(s.id, `${s.make} ${s.model}`)} />)}
          <Btn tone="ghost" label="SAVE AS TYPED" disabled={!text.trim()} onPress={() => submit(null, text.trim())} />
        </View>
      )}
    </Card>
  );
}
