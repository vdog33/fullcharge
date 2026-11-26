import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Bullets, Card, Field, H1, Input, Muted, Notice, Screen, st } from '../../src/components/ui';
import { ChemistryPanel, ContactsPanel, TabKey, VehicleTabs } from '../../src/components/VehicleTabs';
import { guideIndex } from '../../src/lib/packs';
import { VerifyPicture } from '../../src/components/VerifyPicture';
import { getVehicle, searchVehicles } from '../../src/data/catalog';
import { getIdHistory, logView, updateIdAttempt } from '../../src/lib/history';
import { sendFeedback } from '../../src/lib/identify';
import { C, S } from '../../src/theme';

export default function VehicleScreen() {
  const { id, idAt } = useLocalSearchParams<{ id: string; idAt?: string }>();
  const r = useRouter();
  const v = getVehicle(id);
  const [tab, setTab] = useState<TabKey>('Cut');
  useEffect(() => { if (v) logView('vehicle', v.id); }, [v?.id]);
  if (!v) return <Screen><H1>Not found</H1><Btn icon="search" label="Search" onPress={() => r.replace('/search')} /></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: `${v.make} ${v.model}` }} />
      <View>
        <H1>{v.make} {v.model}</H1>
        <Text style={[st.body, { color: C.muted, fontSize: 17 }]}>{v.years} · {v.type}</Text>
      </View>
      <VehicleTabs tabs={['Cut', 'Chemistry', 'Contacts', 'Notes'] as const} value={tab} onChange={setTab} />

      {tab === 'Cut' && (
        <>
          {/* Picture first: the manufacturer rescue sheet shows cut zones, HV and 12V on the car itself. */}
          {!!v.watch_for && <Notice tone="warn" title="Watch for">{v.watch_for}</Notice>}
          <VerifyPicture vehicleId={v.id} hero />
          <Btn tone="red" icon="book" label="Manufacturer cut sheet (PDF)" onPress={() => r.push(`/erg-pdf?kind=vehicle&id=${v.id}`)} />
          <Btn icon="pin" label="Isolation zones + map" onPress={() => r.push(`/zones?kind=vehicle&id=${v.id}`)} />
          <Btn tone="outline" size="sm" label="Quick sheet — offline" onPress={() => r.push(`/quick?kind=vehicle&id=${v.id}`)} />
        </>
      )}

      {tab === 'Chemistry' && (
        <ChemistryPanel powertrain={v.type} chemistry={[v.chemistry, v.pack].filter(Boolean).join(' · ')} verified={v.chemistry_verified}
          onHazmat={() => r.push(`/hazmat?kind=vehicle&id=${v.id}`)} />
      )}

      {tab === 'Contacts' && <ContactsPanel guides={guideIndex().filter((g) => g.vehicleId === v.id)} />}

      {tab === 'Notes' && (
        <>
          <Notice tone="info">Written notes — not yet verified against the manufacturer guide. The cut sheet wins.</Notice>
          <Field label="Cut loop" value={v.cut_loop} />
          <Field label="12V" value={v.lv_location} />
          <Field label="No-cut" value={v.no_cut_zones} />
          <Field label="Airbag / HV" value={v.airbag_hv} />
          <Field label="Tow" value={v.tow} />
          <Field label="Release" value={v.release} />
          <Text style={st.label}>ID cues</Text>
          <Bullets items={v.id_cues} />
          {!!v.warning && <Notice tone="info" icon="warn" title="Data note">{v.warning}</Notice>}
          <Field label="ERG source" value={v.erg_pdf_label} />
          <Muted>Link check: {v.erg_verified_note}</Muted>
        </>
      )}

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

  if (done) return <Notice tone="ok">Logged. Thanks — this trains the next ID.</Notice>;
  return (
    <Card>
      <Text style={st.noticeTitle}>Was this right?</Text>
      {!no ? (
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <View style={{ flex: 1 }}><Btn icon="check" label="Yes" onPress={() => submit(shownId)} /></View>
          <View style={{ flex: 1 }}><Btn tone="outline" label="No, it was…" onPress={() => setNo(true)} /></View>
        </View>
      ) : (
        <View style={{ gap: S.sm }}>
          <Input label="What was it?" placeholder="Make + model" value={text} onChangeText={setText} autoCorrect={false} />
          {sugg.map((s) => <Btn key={s.id} label={`${s.make} ${s.model}`} onPress={() => submit(s.id, `${s.make} ${s.model}`)} />)}
          <Btn tone="outline" label="Save as typed" disabled={!text.trim()} reason="Type the make and model first." onPress={() => submit(null, text.trim())} />
        </View>
      )}
    </Card>
  );
}
