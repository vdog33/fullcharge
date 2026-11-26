import React, { useEffect, useReducer, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { Btn, CardBtn, Disclose, H1, H2, Icon, Muted, Notice, Screen, Steps, TabBar, st } from '../src/components/ui';
import { VerifyPicture } from '../src/components/VerifyPicture';
import { ChemistryPanel, ContactsPanel, TabKey, TowPanel, vehicleTabs } from '../src/components/VehicleTabs';
import { EV_FIRST_MOVES } from '../src/data/content';
import { getVehicle } from '../src/data/catalog';
import { guideLabel } from '../src/lib/match-core';
import { ergFor, ERG_GUIDE_PDF } from '../src/lib/chem-guide';
import { downloadGuides, getGuide, guideOnPhone, loadPacks, subscribe } from '../src/lib/packs';
import { logView } from '../src/lib/history';
import { C, S } from '../src/theme';

const TABS = vehicleTabs(['Cut', 'Chemistry', 'Tow', 'Contacts', 'Sheets']);

/** Page for any NHTSA vehicle — the cut sheets themselves, plus the shared on-scene tools. */
export default function GuidePage() {
  const { keys = '', title } = useLocalSearchParams<{ keys?: string; title?: string }>();
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlMsg, setDlMsg] = useState('');
  const [tab, setTab] = useState<TabKey>('Cut');
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  const guides = keys.split(',').filter(Boolean).map(getGuide).filter((g): g is NonNullable<typeof g> => !!g)
    .sort((a, b) => Number(b.docType === 'rescue_sheet') - Number(a.docType === 'rescue_sheet') || (b.yearFrom ?? 0) - (a.yearFrom ?? 0));
  const g0 = guides[0];
  const name = title || (g0 ? `${g0.make} ${g0.model}` : 'Cut sheet');
  const linked = guides.find((g) => g.vehicleId)?.vehicleId;
  const missing = guides.filter((g) => !guideOnPhone(g));
  const erg = ergFor(guides.find((g) => /FCEV/i.test(g.powertrain ?? ''))?.powertrain ?? g0?.powertrain);
  useEffect(() => { if (keys) logView('guide', keys, name); }, [keys]);

  async function getThese() {
    setDlMsg('');
    const n = await NetInfo.fetch();
    if (n.isConnected === false) return setDlMsg('No signal — try again when you have signal.');
    const out = await downloadGuides(missing, (done, total) => setDl({ done, total }));
    setDl(null);
    setDlMsg(out.failed ? `${out.failed} file(s) didn't download — try again.` : 'On this device — works offline.');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <View>
        <H1>{name}</H1>
        {g0 && <Text style={[st.body, { color: C.muted, fontSize: 17 }]}>{g0.years}{g0.powertrain ? ` · ${g0.powertrain}` : ''}</Text>}
      </View>

      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'Chemistry' && (
        <ChemistryPanel powertrain={guides.find((g) => /FCEV/i.test(g.powertrain ?? ''))?.powertrain ?? g0?.powertrain}
          onHazmat={() => r.push('/hazmat')} />
      )}
      {tab === 'Contacts' && <ContactsPanel guides={guides} />}
      {tab === 'Tow' && (() => {
        const lv = linked ? getVehicle(linked) : undefined;
        const erg = guides.find((x) => x.docType !== 'rescue_sheet') ?? g0;
        return <TowPanel tow={lv?.tow} release={lv?.release}
          onSheet={erg ? () => r.push(erg.images ? `/sheet?key=${erg.key}` : `/erg-pdf?kind=guide&id=${erg.key}`) : undefined} />;
      })()}

      {tab === 'Cut' && <>
      {/* Which ERG guide: hydrogen and hybrids are not plain Guide 147. */}
      {erg.tone !== 'none' && (
        <Notice tone={erg.tone} title={erg.title}
          action={<Btn size="sm" tone="outline" icon="ext" label={`Guide ${erg.guides[0]} PDF (needs signal)`} onPress={() => Linking.openURL(ERG_GUIDE_PDF(erg.guides[0]))} />}>
          {erg.text}
        </Notice>
      )}
      {/* The manufacturer's picture is the answer: HV parts, cut zones, 12V — on the car. */}
      {guides.length > 0 && <VerifyPicture guides={guides} hero />}

      {new Set(guides.map((x) => `${x.make}|${x.model}`)).size > 1 && (
        <Notice tone="info" icon="warn">More than one model matches — check the badge and pick the sheet for that exact model.</Notice>
      )}

      {linked && getVehicle(linked) && <Btn label="FULLCHARGE page — cut loop, 12V, tow" onPress={() => r.push(`/vehicle/${linked}`)} />}
      <Btn tone="red" icon="pin" label="Isolation zones + map" onPress={() => r.push('/zones')} />
      <Btn tone="outline" icon="book" label={`All sheets (${guides.length})`} onPress={() => setTab('Sheets')} />
      </>}

      {tab === 'Sheets' && <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <H2>Sheets (PDF)</H2>
        {missing.length > 0 && (
          <Btn size="sm" icon="dl" disabled={!!dl}
            label={dl ? `Downloading ${dl.done} of ${dl.total}` : missing.length === guides.length ? `Download all ${guides.length}` : `Download ${missing.length} more`}
            onPress={getThese} />
        )}
      </View>
      {!!dlMsg && <Muted>{dlMsg}</Muted>}

      {guides.map((g) => {
        const on = guideOnPhone(g);
        return (
          <CardBtn key={g.key} onPress={() => r.push(g.images ? `/sheet?key=${g.key}` : `/erg-pdf?kind=guide&id=${g.key}`)}>
            <Text style={[st.label, { color: C.redText }]}>{g.docType === 'rescue_sheet' ? 'Rescue sheet' : 'Emergency response guide'}</Text>
            <Text style={[st.body, { fontWeight: '700', lineHeight: 23 }]}>{guideLabel(g)}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <View style={{ marginTop: 2 }}><Icon name={on ? 'check' : 'cloud'} size={18} color={on ? C.green : C.muted} /></View>
              <Text style={[st.muted, { flex: 1 }]}>
                {on ? 'On this device — works offline' : 'Not downloaded — needs signal'}{g.pages ? ` · ${g.pages} page${g.pages > 1 ? 's' : ''}` : ''}{g.date ? ` · ${g.date}` : ''}
              </Text>
            </View>
          </CardBtn>
        );
      })}
      {!guides.length && <Notice tone="info">Cut sheet not found on this phone. Update the rescue-sheet pack in Downloads.</Notice>}

      <Disclose title="EV first moves" count={`${EV_FIRST_MOVES.length} steps`}>
        <Steps items={EV_FIRST_MOVES} />
      </Disclose>
      </>}
      <View style={{ height: S.xs }} />
    </Screen>
  );
}
