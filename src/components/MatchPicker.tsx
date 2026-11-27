// Pick → check → accept, shared by camera ID and VIN lookup.
// 1) Cards: photo of the car it thinks it is, name, likelihood (or "VIN match"). 2) Tap: checks to look at on the car.
// 3) Accept → caller opens the rescue sheet. Back from the sheet lands on the cards again.
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Btn, Bullets, Card, H1, Muted, Notice, st } from './ui';
import { Candidate, destination } from '../lib/identify';
import { ergFor } from '../lib/chem-guide';
import { allReady, CarPhotoSrc, guideIndex, photoFor } from '../lib/packs';
import { C, F, S } from '../theme';
import { SheetThumb } from './SheetThumb';

export function MatchPicker({ candidates, accepted, onAccept, onNone, noneLabel = 'None of these — search', extra, note, title = 'Which car is it?' }: {
  candidates: Candidate[]; accepted?: string | null; onAccept: (c: Candidate) => void; onNone: () => void;
  noneLabel?: string; extra?: React.ReactNode; note?: string; title?: string;
}) {
  const [i, setI] = useState<number | null>(null);
  useFocusEffect(useCallback(() => { setI(null); }, [])); // back from the sheet → the cards
  const cur = i !== null ? candidates[i] : undefined;

  if (cur) {
    const dest = destination(cur);
    const e = ergFor(cur.guess.powertrain);
    return (
      <View style={{ gap: S.block }}>
        <CarPhoto c={cur} h={220} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: S.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={cs.nameBig}>{cur.guess.make} {cur.guess.model}</Text>
            <Text style={st.muted}>{meta(cur)}</Text>
          </View>
          <Likely c={cur} />
        </View>
        {e.tone !== 'none' && <Notice tone={e.tone} title={e.title}>{e.text}</Notice>}
        {(cur.checks.length > 0 || cur.cues.length > 0) && (
          <Card>
            <Text style={st.noticeTitle}>Check on the car</Text>
            <Bullets items={cur.checks.length ? cur.checks : cur.cues} />
          </Card>
        )}
        <OnFile c={cur} />
        {dest
          ? <Btn big tone="red" icon="check" label="Accept — open rescue sheet" onPress={() => onAccept(cur)} />
          : <Btn big icon="search" label="Accept — search for its sheet" onPress={onNone} />}
        <Btn icon="back" label={candidates.length > 1 ? 'Not this one' : 'Back'} onPress={() => setI(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: S.block }}>
      <H1>{title}</H1>
      {!!accepted && <Notice tone="info" icon="back" title={`You opened ${accepted}`}>Wrong car? Pick another below — no need to start over.</Notice>}
      {candidates.map((c, k) => (
        <Pressable key={c.label + k} onPress={() => setI(k)} accessibilityRole="button"
          accessibilityLabel={`${c.label}, ${c.exact ? 'VIN match' : `${c.confidence} percent likely`}. Tap to check.`}
          style={({ pressed }) => [cs.card, k === 0 && { borderColor: C.text }, pressed && { opacity: 0.85 }]}>
          <CarPhoto c={c} h={k === 0 ? 200 : 140} />
          <View style={cs.cardBody}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={cs.name}>{c.guess.make} {c.guess.model}</Text>
              <Text style={st.muted}>{meta(c)}</Text>
            </View>
            <Likely c={c} />
          </View>
        </Pressable>
      ))}
      <Btn tone="outline" icon="search" label={noneLabel} onPress={onNone} />
      {extra}
      {!!note && <Muted>{note}</Muted>}
    </View>
  );
}

const meta = (c: Candidate) => {
  const g = c.guess;
  const y = g.yearFrom && g.yearTo && g.yearFrom !== g.yearTo ? `${g.yearFrom}–${g.yearTo}` : String(g.yearFrom ?? g.yearTo ?? '');
  return [y, g.powertrain && !['UNKNOWN', 'ICE'].includes(g.powertrain) ? g.powertrain : ''].filter(Boolean).join(' · ');
};

function Likely({ c }: { c: Candidate }) {
  if (c.exact) return <View style={{ alignItems: 'flex-end' }}><Text style={[cs.pct, { color: C.green, fontSize: 22 }]}>VIN</Text><Text style={st.muted}>match</Text></View>;
  const col = c.confidence >= 70 ? C.green : c.confidence >= 40 ? C.hazmat : C.muted;
  return <View style={{ alignItems: 'flex-end' }}><Text style={[cs.pct, { color: col }]}>{c.confidence}%</Text><Text style={st.muted}>likely</Text></View>;
}

/** Car picture: an approved photo if one exists, else the top of the model's own rescue sheet (side-view drawing). */
function CarPhoto({ c, h }: { c: Candidate; h: number }) {
  const [bad, setBad] = useState(false);
  const [w, setW] = useState(0);
  const [p, setP] = useState<CarPhotoSrc | null | undefined>(undefined);
  const k = c.guides.map((g) => g.key).join(',');
  useEffect(() => { let on = true; photoFor(c.guides).then((x) => on && setP(x)).catch(() => on && setP(null)); return () => { on = false; }; }, [k]);
  if (p === undefined) return <View style={{ height: h * 0.6, backgroundColor: C.surface2 }} />;
  if (!p || bad) {
    if (!c.guides.length && !c.vehicleId) {
      return <View style={{ height: h * 0.6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 }}><Text style={st.muted}>No cut sheet on file for this model</Text></View>;
    }
    return (
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ backgroundColor: '#fff' }}>
        {w > 0 && <SheetThumb guides={c.guides} vehicleId={c.vehicleId} width={w} height={Math.round(h * 0.8)} />}
        <Text style={cs.credit} numberOfLines={1}>Rescue sheet drawing</Text>
      </View>
    );
  }
  return (
    <View>
      <Image source={{ uri: p.uri }} onError={() => setBad(true)} style={{ width: '100%', height: h, backgroundColor: C.surface2 }} resizeMode="cover"
        accessibilityLabel={`Example photo of a ${c.guess.make} ${c.guess.model}`} />
      <Text style={cs.credit} numberOfLines={1}>{p.credit}</Text>
    </View>
  );
}

function OnFile({ c }: { c: Candidate }) {
  if (c.yearsLoose && c.guides.length) {
    const ys = [...new Set(c.guides.map((g) => g.years))].join(', ');
    return <Notice tone="warn" title="Sheet is listed for other years">{`Closest cut sheet: ${ys}. NHTSA often lists a sheet only under its newest year — check the drawing matches this car before you cut.`}</Notice>;
  }
  if (c.vehicleId) return <Text style={[st.label, { color: C.green }]}>FULLCHARGE page{c.guides.length ? ` + ${c.guides.length} cut sheet(s)` : ''}</Text>;
  if (c.guides.length) return <Text style={[st.label, { color: C.green }]}>{c.guides.length} cut sheet(s) on file</Text>;
  if (c.guess.powertrain === 'ICE') return <Muted>Looks gas-only — NHTSA lists electric-powered vehicles only, so no EV cut sheet exists. Check for hybrid / plug-in badges.</Muted>;
  if (!allReady() && guideIndex().length === 0) return <Muted>Not in the 20 FULLCHARGE vehicles. Download "All rescue sheets" for every NHTSA vehicle.</Muted>;
  return <Muted>No NHTSA cut sheet on file for this name. Search manually.</Muted>;
}

const cs = StyleSheet.create({
  card: { borderWidth: 2, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: 14 },
  name: { color: C.text, fontFamily: F.display, fontSize: 23, lineHeight: 27 },
  nameBig: { color: C.text, fontFamily: F.black, fontSize: 30, lineHeight: 33 },
  pct: { fontFamily: F.black, fontSize: 32, lineHeight: 34 },
  credit: { position: 'absolute', right: 6, bottom: 4, color: '#FFF', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 5, borderRadius: 4 },
});
