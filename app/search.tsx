import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chip, H2, LabeledInput, Muted, RadioGroup, Screen, st } from '../src/components/ui';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { getVehicle, searchVehicles, Vehicle, VEHICLES } from '../src/data/catalog';
import { lookupVin, VinResult } from '../src/lib/vin';
import { looksLikeVin } from '../src/lib/vin-core';
import { Guide, matchGuess, searchGuides } from '../src/lib/match-core';
import { allReady, guideIndex, loadPacks, subscribe } from '../src/lib/packs';
import { logIdAttempt, updateIdAttempt } from '../src/lib/history';
import { NHTSA_PORTAL } from '../src/config';
import { C, S, TAP } from '../src/theme';

type Mode = 'name' | 'vin';
const SEED = VEHICLES.map((v) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));

/** One row per make + model; the guide page lists every year / doc type. */
function groupGuides(gs: Guide[]) {
  const m = new Map<string, Guide[]>();
  gs.forEach((g) => { const k = `${g.make}|${g.model}`; m.set(k, [...(m.get(k) ?? []), g]); });
  return [...m.values()];
}
const guideHref = (gs: Guide[], label: string) => `/guide?keys=${gs.map((g) => g.key).join(',')}&title=${encodeURIComponent(label)}`;

export default function Search() {
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  const [mode, setMode] = useState<Mode>('name');
  const [q, setQ] = useState('');
  const [make, setMake] = useState<string | undefined>();
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ r: VinResult; at: number; guides: Guide[] } | null>(null);

  const index = guideIndex();
  const makesAll = useMemo(() => [...new Set([...VEHICLES.map((v) => v.make), ...index.map((g) => g.make)])].sort(), [index.length]);
  const seedList = useMemo(() => searchVehicles(q, make), [q, make]);
  const seedGrouped = useMemo(() => {
    const g: Record<string, Vehicle[]> = {};
    seedList.forEach((v) => (g[v.make] ??= []).push(v));
    return Object.entries(g);
  }, [seedList]);
  // Browse list: every make with how many distinct models it has.
  const makeCounts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    index.forEach((g) => m.set(g.make, (m.get(g.make) ?? new Set()).add(g.model)));
    return [...m.entries()].map(([mk, set]) => [mk, set.size] as const).sort((a, b) => a[0].localeCompare(b[0]));
  }, [index.length]);
  const guideGroups = useMemo(
    () => (q.trim().length >= 2 || make ? groupGuides(searchGuides(q, index, make, 200)) : []),
    [q, make, index.length],
  );

  async function runVin(v?: string) {
    setErr(''); setRes(null); setBusy(true);
    try {
      const out = await lookupVin(v ?? vin);
      const d = out.decoded;
      const guides = d.make && d.model ? matchGuess({ make: d.make, model: d.model, yearFrom: d.year, yearTo: d.year, powertrain: d.electrification }, SEED, index).guides : [];
      const at = Date.now();
      await logIdAttempt({
        at, source: 'vin', topMatch: [d.year, d.make, d.model].filter(Boolean).join(' ') || null,
        candidates: out.matches.map((m) => ({ label: m.reason, vehicleId: m.vehicleId, confidence: m.strength === 'model' ? 100 : 0 })), confirmedId: null,
      });
      setRes({ r: out, at, guides });
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function open(id: string, href: string) {
    if (res) await updateIdAttempt(res.at, { confirmedId: id });
    r.push(href);
  }

  return (
    <Screen>
      <LastVehicleBar />
      <RadioGroup label="Search by" style={{ marginBottom: S.md }}>
        {(['name', 'vin'] as Mode[]).map((m) => (
          <Chip key={m} on={mode === m} label={m === 'name' ? 'MAKE / MODEL' : 'VIN'} style={{ flex: 1, minHeight: TAP.primary }}
            onPress={() => { setMode(m); setErr(''); setRes(null); }} />
        ))}
      </RadioGroup>

      {mode === 'name' && (
        <>
          <LabeledInput label="Make or model" placeholder="e.g. ioniq 6" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
          {looksLikeVin(q) && <View style={{ marginTop: S.sm }}><Btn label="THAT LOOKS LIKE A VIN — LOOK IT UP" onPress={() => { setMode('vin'); setVin(q); runVin(q); }} /></View>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: S.md }} contentContainerStyle={{ gap: S.sm }}
            accessibilityRole="radiogroup" accessibilityLabel="Filter by make">
            {[undefined, ...makesAll].map((m) => (
              <Chip key={m ?? 'all'} on={make === m} label={m ?? 'All makes'} onPress={() => setMake(m === make ? undefined : m)} />
            ))}
          </ScrollView>

          {seedGrouped.length > 0 && <H2>FULLCHARGE pages</H2>}
          {seedGrouped.map(([mk, vs]) => (
            <View key={mk} style={{ marginBottom: S.md }}>
              <Text style={st.label}>{mk}</Text>
              {vs.map((v) => (
                <Pressable key={v.id} onPress={() => r.push(`/vehicle/${v.id}`)} accessibilityRole="button" style={{ minHeight: TAP.primary, justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={st.body}>{v.model} <Text style={st.muted}>· {v.years} · {v.type}</Text></Text>
                </Pressable>
              ))}
            </View>
          ))}

          <H2>All cut sheets{index.length ? ` (${index.length})` : ''}</H2>
          {!index.length && (
            <Card>
              <Text style={st.body}>No cut sheets on this phone yet.</Text>
              <Btn label="DOWNLOAD RESCUE SHEETS" onPress={() => r.push('/settings/downloads')} />
            </Card>
          )}
          {!!index.length && !allReady() && <Muted>Download not finished — some sheets need signal.</Muted>}
          {!!index.length && !guideGroups.length && (q.trim().length >= 2 || make) && <Muted>No cut sheet matches.</Muted>}
          {!!index.length && q.trim().length < 2 && !make && makeCounts.map(([mk, n]) => (
            <Pressable key={mk} onPress={() => setMake(mk)} accessibilityRole="button" accessibilityLabel={`${mk}, ${n} model${n > 1 ? 's' : ''}`} style={{ minHeight: TAP.primary, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={st.body}>{mk}</Text>
              <Text style={st.muted}>{n} model{n > 1 ? 's' : ''} ›</Text>
            </Pressable>
          ))}
          {guideGroups.map((gs) => {
            const label = `${gs[0].make} ${gs[0].model}`;
            const years = [...new Set(gs.map((g) => g.years))].join(' · ');
            return (
              <Pressable key={label} onPress={() => r.push(guideHref(gs, label))} accessibilityRole="button" style={{ minHeight: TAP.primary, justifyContent: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
                <Text style={st.body}>{label} <Text style={st.muted}>· {gs.length} sheet{gs.length > 1 ? 's' : ''}</Text></Text>
                <Muted>{years}{gs[0].powertrain ? ` · ${gs[0].powertrain}` : ''}</Muted>
              </Pressable>
            );
          })}
        </>
      )}

      {mode === 'vin' && (
        <View style={{ gap: S.sm }}>
          <LabeledInput label="VIN (17 characters)" value={vin}
            onChangeText={(t) => setVin(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={20} returnKeyType="search" onSubmitEditing={() => runVin()} />
          <Muted>Dash (driver side, through windshield) or driver door jamb.</Muted>
          <Btn tone="red" label="LOOK UP VIN" onPress={() => runVin()} disabled={busy} />
        </View>
      )}

      {busy && <ActivityIndicator color={C.text} style={{ marginTop: S.lg }} accessibilityLabel="Looking up VIN" />}
      {!!err && <Card style={{ marginTop: S.md }}><Text style={st.body} accessibilityLiveRegion="polite" accessibilityRole="alert">{err}</Text></Card>}

      {res && mode === 'vin' && (
        <View style={{ gap: S.sm, marginTop: S.md }}>
          <Card>
            <Text style={st.label}>Decoded · {res.r.source === 'nhtsa-vpic' ? 'NHTSA vPIC' : res.r.source === 'offline-wmi' ? 'offline' : 'mock'}</Text>
            <Text style={st.body}>{[res.r.decoded.year, res.r.decoded.make, res.r.decoded.model, res.r.decoded.trim].filter(Boolean).join(' ') || 'Unknown'}</Text>
            {!!res.r.decoded.electrification && <Muted>{res.r.decoded.electrification}</Muted>}
            <Muted>VIN {res.r.vin}</Muted>
            {res.r.warnings.map((w) => <Muted key={w}>⚠ {w}</Muted>)}
          </Card>

          {(res.r.matches.length > 0 || res.guides.length > 0) && <H2>Is this the car?</H2>}
          {res.r.matches.map((m) => {
            const v = getVehicle(m.vehicleId)!;
            return <Btn key={m.vehicleId} tone={m.strength === 'model' ? 'red' : 'neutral'} label={`${v.make} ${v.model}`.toUpperCase()} sub={m.reason} onPress={() => open(m.vehicleId, `/vehicle/${m.vehicleId}`)} />;
          })}
          {res.guides.length > 0 && (() => {
            const label = [res.r.decoded.year, res.r.decoded.make, res.r.decoded.model].filter(Boolean).join(' ');
            return <Btn tone="red" label="OPEN CUT SHEET" sub={`${res.guides.length} sheet(s) · ${label}`} onPress={() => open(`guide:${res.guides[0].key}`, guideHref(res.guides, label))} />;
          })()}
          {res.r.matches.some((m) => m.vehicleId === 'wrangler-4xe') && (
            <Card style={{ borderColor: C.red }}><Text style={st.body}>⚠ 4xe: check 68C recall remedy on this VIN before trusting the pack.</Text></Card>
          )}
          {!res.r.matches.length && !res.guides.length && (
            <Card>
              {/^(ICE|)$/.test(res.r.decoded.electrification ?? '') && res.r.source === 'nhtsa-vpic'
                ? <Text style={st.body}>No electrification listed for this VIN — likely gas-only. NHTSA cut sheets cover electric-powered vehicles only.</Text>
                : <Text style={st.body}>No cut sheet on this phone for this vehicle.</Text>}
              {!index.length && <Btn label="DOWNLOAD RESCUE SHEETS" onPress={() => r.push('/settings/downloads')} />}
              <Btn tone="ghost" label="OPEN NHTSA ERG PORTAL (needs signal)" onPress={() => Linking.openURL(NHTSA_PORTAL)} />
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}
