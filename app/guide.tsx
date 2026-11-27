import React, { useEffect, useReducer, useState } from 'react';
import { Linking, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { Btn, CardBtn, Disclose, H1, H2, Icon, Muted, Notice, Screen, Steps, TabBar, st } from '../src/components/ui';
import { SheetZoom } from '../src/components/SheetZoom';
import { SheetItems } from '../src/components/SheetItems';
import { ShareToZoneBtn } from '../src/components/ShareToZoneBtn';
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
  const { height: winH } = useWindowDimensions();
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
  // Chemistry printed on the maker's sheet (approved) decides the ERG guide; newest sheet with one wins.
  const battery = guides.find((g) => g.battery)?.battery;
  const erg = ergFor(guides.find((g) => /FCEV/i.test(g.powertrain ?? ''))?.powertrain ?? g0?.powertrain, battery?.chem);
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
      <ShareToZoneBtn vehicleRef={`guide:${keys}`} title={name} />

      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'Chemistry' && (
        <ChemistryPanel battery={battery} powertrain={guides.find((g) => /FCEV/i.test(g.powertrain ?? ''))?.powertrain ?? g0?.powertrain}
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
          action={<Btn size="sm" tone="outline" icon="book" label={`Guide ${erg.guides[0]} PDF`} onPress={() => r.push(`/pdf?guide=${erg.guides[0]}`)} />}>
          {erg.text}
        </Notice>
      )}
      {/* The manufacturer's picture is the answer: HV parts, cut zones, 12V — on the car. */}
      {/* Checked break-down first (cut loop, HV disconnect, 12V), then the whole sheet. */}
      {guides.length > 0 && <SheetItems guides={guides} />}
      {/* The sheet itself, right here: pinch to zoom — no need to open it first. No picture on the phone → tap-to-open card. */}
      {guides.length > 0 && (guides.some((g) => g.images)
        ? <SheetZoom guides={guides} height={Math.round(winH * 0.7)} />
        : (() => {
          // No cut sheet pulled out yet: the cut info is inside the maker's full guide — one tap to it, never a blank page.
          const full = guides.find((x) => x.docType !== 'rescue_sheet') ?? guides[0];
          return (
            <Notice tone="warn" title="Cut sheet is inside the manufacturer's guide"
              action={<Btn tone="red" icon="book" label="Open the guide" onPress={() => r.push(`/erg-pdf?kind=guide&id=${full.key}`)} />}>
              No separate cut sheet for this model. Look for the vehicle drawing with the high-voltage parts and cut zones.
            </Notice>
          );
        })())}
      {guides.some((g) => g.fromErg) && (
        <Muted>{`Cut sheet taken from the manufacturer's full guide (page ${guides.find((g) => g.fromErg)!.fromErg!.pages.join(', ')}).`}</Muted>
      )}

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
            <Text style={[st.label, { color: C.redText }]}>{g.fromErg ? `Cut sheet · from the full guide, p. ${g.fromErg.pages.join(', ')}` : g.docType === 'rescue_sheet' ? 'Rescue sheet' : 'Emergency response guide'}</Text>
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
