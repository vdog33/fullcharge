// Vehicle pages broken into tabs, so each part is one big tap away and never a long scroll on scene:
//   Cut · Chemistry · Contacts (· Notes on FULLCHARGE pages)
import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Btn, Card, Field, Muted, Notice, st } from './ui';
import { IconName } from './Icon';
import { SHARED_CONTACTS } from '../data/catalog';
import { ergFor, ERG_GUIDE_PDF } from '../lib/chem-guide';
import { Contact, Guide } from '../lib/match-core';
import { getGuide, loadPacks } from '../lib/packs';
import { C, S } from '../theme';

export type TabKey = 'Cut' | 'Chemistry' | 'Tow' | 'Contacts' | 'Notes' | 'Sheets';
const TAB_ICON: Record<TabKey, IconName> = { Cut: 'cut', Chemistry: 'flask', Tow: 'truck', Contacts: 'phone', Notes: 'doc', Sheets: 'book' };

/** Must be a direct child of <Screen> so it stays pinned (Screen looks for TabBar). */
export const vehicleTabs = (keys: readonly TabKey[]) => keys.map((k) => ({ key: k, label: k, icon: TAB_ICON[k] }));

const tel = (p: string) => Linking.openURL(`tel:${p.replace(/[^\d+]/g, '')}`);

/** Which hazmat guide applies — the main thing the Chemistry tab answers. */
export function ChemistryPanel({ powertrain, chemistry, verified, onHazmat }: {
  powertrain?: string; chemistry?: string; verified?: boolean | 'partial'; onHazmat: () => void;
}) {
  const e = ergFor(powertrain);
  const g = e.guides[0];
  return (
    <View style={{ gap: S.block }}>
      <Card>
        <Text style={st.label}>Hazmat guide</Text>
        <Text style={{ color: C.text, fontSize: 30, fontWeight: '900' }}>Guide {e.guides.join(' + ')}</Text>
        <Muted>{g === '147' && e.tone === 'none' ? 'Lithium-ion battery (ERG 2024).' : e.text}</Muted>
      </Card>
      {e.tone !== 'none' && <Notice tone={e.tone} title={e.title}>{e.text}</Notice>}
      {e.guides.includes('147') && <Btn tone="hazmat" icon="book" label="Guide 147 — distances, fire, map" onPress={onHazmat} />}
      {e.guides.filter((x) => x !== '147').map((x) => (
        <Btn key={x} tone="outline" icon="ext" label={`Guide ${x} PDF (needs signal)`} onPress={() => Linking.openURL(ERG_GUIDE_PDF(x))} />
      ))}
      <Card>
        <Text style={st.label}>Battery</Text>
        <Text style={[st.body, { fontSize: 19 }]}>{chemistry || (powertrain ? `${powertrain} — cell chemistry not listed` : 'Not listed')}</Text>
        <Muted>{verified === true ? 'Chemistry verified against the manufacturer guide.' : verified === 'partial' ? 'Chemistry partly verified.' : 'Chemistry not verified — treat as lithium-ion, Guide 147.'}</Muted>
      </Card>
    </View>
  );
}

/** Manufacturer lines (approved, from their own guide) first, then the 24/7 chemical lines. Each is one tap to call. */
export function ContactsPanel({ guides }: { guides: Guide[] }) {
  const [list, setList] = useState<Contact[]>([]);
  const k = guides.map((g) => g.key).join(',');
  useEffect(() => {
    loadPacks().then(() => {
      const seen = new Set<string>();
      const all = guides.flatMap((g) => (g.contacts ?? getGuide(g.key)?.contacts ?? []))
        .filter((c) => { const d = c.phone.replace(/\D/g, ''); return seen.has(d) ? false : (seen.add(d), true); });
      setList(all);
    });
  }, [k]);
  return (
    <View style={{ gap: S.sm }}>
      <Text style={st.label}>Manufacturer</Text>
      {list.length
        ? list.map((c) => <Btn key={c.phone} tone="neutral" icon="phone" label={`Call ${c.name}`} sub={`${c.phone}${c.note ? ` · ${c.note}` : ''}`} onPress={() => tel(c.phone)} />)
        : <Muted>No manufacturer line checked for this vehicle yet. Use the lines below, or the number on the cut sheet.</Muted>}
      <Text style={[st.label, { marginTop: S.sm }]}>24/7 chemical emergency</Text>
      {SHARED_CONTACTS.map((c) => <Btn key={c.phone} tone="neutral" icon="phone" label={`Call ${c.name}`} sub={`${c.phone} · ${c.note}`} onPress={() => tel(c.phone)} />)}
    </View>
  );
}

/** Tow tab: the vehicle's own tow / release lines, then the manufacturer guide (its towing section wins). */
export function TowPanel({ tow, release, verified, onSheet }: { tow?: string; release?: string; verified?: boolean; onSheet?: () => void }) {
  return (
    <View style={{ gap: S.block }}>
      {tow || release ? <>
        {!verified && <Notice tone="info">Written notes — not yet verified against the manufacturer guide. The guide's towing section wins.</Notice>}
        {!!tow && <Field label="Tow" value={tow} />}
        {!!release && <Field label="Release to tow" value={release} />}
      </> : <Notice tone="info" icon="truck">No tow notes for this vehicle yet — use the towing section of the manufacturer guide.</Notice>}
      {onSheet && <Btn tone="neutral" icon="book" label="Manufacturer guide — towing section" onPress={onSheet} />}
    </View>
  );
}
