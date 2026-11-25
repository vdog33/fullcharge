import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Muted, Screen, st } from '../src/components/ui';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { BrandGrid, BrandItem } from '../src/components/BrandGrid';
import { VerifyPicture } from '../src/components/VerifyPicture';
import { getVehicle, searchVehicles, Vehicle, VEHICLES } from '../src/data/catalog';
import { lookupVin, VinResult } from '../src/lib/vin';
import { looksLikeVin } from '../src/lib/vin-core';
import { Guide, matchGuess, searchGuides } from '../src/lib/match-core';
import { allReady, guideIndex, loadPacks, subscribe } from '../src/lib/packs';
import { logIdAttempt, updateIdAttempt } from '../src/lib/history';
import { NHTSA_PORTAL } from '../src/config';
import { C, F, S } from '../src/theme';

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
  // Coming back from the scanner with a VIN: look it up straight away.
  const params = useLocalSearchParams<{ vin?: string }>();
  useEffect(() => { if (params.vin) { setMode('vin'); setVin(params.vin); runVin(params.vin); } }, [params.vin]);

  const index = guideIndex();
  const seedList = useMemo(() => searchVehicles(q, make), [q, make]);
  const seedGrouped = useMemo(() => {
    const g: Record<string, Vehicle[]> = {};
    seedList.forEach((v) => (g[v.make] ??= []).push(v));
    return Object.entries(g);
  }, [seedList]);
  // Brand grid: every make (FULLCHARGE + NHTSA) with its number of distinct models, A–Z.
  const brands: BrandItem[] = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (mk: string, model: string) => m.set(mk, (m.get(mk) ?? new Set()).add(model.toLowerCase()));
    VEHICLES.forEach((v) => add(v.make, v.model));
    index.forEach((g) => add(g.make, g.model));
    return [...m.entries()].map(([make, set]) => ({ make, models: set.size })).sort((a, b) => a.make.localeCompare(b.make));
  }, [index.length]);
  const browsing = q.trim().length < 2 && !make; // nothing typed or picked -> show the brand grid
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
      <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.md }}>
        {(['name', 'vin'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => { setMode(m); setErr(''); setRes(null); }}
            style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: mode === m ? C.surface2 : 'transparent', borderWidth: 1, borderColor: mode === m ? C.text : C.border }}>
            <Text style={{ color: C.text, textAlign: 'center', fontFamily: F.narrowBold }}>{m === 'name' ? 'MAKE / MODEL' : 'VIN'}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'name' && (
        <>
          <TextInput style={st.input} placeholder="Make or model (e.g. ioniq 6)" placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoCorrect={false} />
          {looksLikeVin(q) && <View style={{ marginTop: S.sm }}><Btn label="THAT LOOKS LIKE A VIN — LOOK IT UP" onPress={() => { setMode('vin'); setVin(q); runVin(q); }} /></View>}
          {make && (
            <Pressable onPress={() => setMake(undefined)} style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: S.md }}>
              <Text style={{ color: C.text, fontFamily: F.narrowBold }}>‹ ALL BRANDS</Text>
              <Text style={st.muted}>· {make}</Text>
            </Pressable>
          )}
          {browsing && (
            <View style={{ marginTop: S.md }}>
              <BrandGrid brands={brands} onPick={(mk) => { setMake(mk); setQ(''); }} />
              {!index.length && (
                <Card style={{ marginTop: S.md }}>
                  <Text style={st.body}>Only the 20 FULLCHARGE vehicles until the vehicle list loads (needs signal once).</Text>
                  <Btn label="DOWNLOAD RESCUE SHEETS" onPress={() => r.push('/settings/downloads')} />
                </Card>
              )}
            </View>
          )}

          {!browsing && seedGrouped.length > 0 && <Text style={st.h2}>FULLCHARGE pages</Text>}
          {!browsing && seedGrouped.map(([mk, vs]) => (
            <View key={mk} style={{ marginBottom: S.md }}>
              <Text style={st.label}>{mk}</Text>
              {vs.map((v) => (
                <Pressable key={v.id} onPress={() => r.push(`/vehicle/${v.id}`)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
                  <Text style={st.body}>{v.model} <Text style={st.muted}>· {v.years} · {v.type}</Text></Text>
                </Pressable>
              ))}
            </View>
          ))}

          {!browsing && <Text style={st.h2}>{make ? `${make} cut sheets` : 'Cut sheets'}</Text>}
          {!browsing && !!index.length && !allReady() && <Muted>Download not finished — some sheets need signal.</Muted>}
          {!browsing && !!index.length && !guideGroups.length && <Muted>No cut sheet matches.</Muted>}
          {!browsing && !index.length && <Muted>NHTSA cut sheets appear once the vehicle list has loaded.</Muted>}
          {guideGroups.map((gs) => {
            const label = `${gs[0].make} ${gs[0].model}`;
            const years = [...new Set(gs.map((g) => g.years))].join(' · ');
            return (
              <Pressable key={label} onPress={() => r.push(guideHref(gs, label))} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border }}>
                <Text style={st.body}>{label} <Text style={st.muted}>· {gs.length} sheet{gs.length > 1 ? 's' : ''}</Text></Text>
                <Muted>{years}{gs[0].powertrain ? ` · ${gs[0].powertrain}` : ''}</Muted>
              </Pressable>
            );
          })}
        </>
      )}

      {mode === 'vin' && (
        <View style={{ gap: S.sm }}>
          <TextInput style={st.input} placeholder="17-character VIN" placeholderTextColor={C.muted} value={vin}
            onChangeText={(t) => setVin(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={20} />
          <Muted>Dash (driver side, through windshield) or driver door jamb.</Muted>
          <Btn tone="red" label="LOOK UP VIN" onPress={() => runVin()} disabled={busy} />
          <Btn label="SCAN VIN — BARCODE OR PHOTO" onPress={() => r.push('/scan-vin')} />
        </View>
      )}

      {busy && <ActivityIndicator color={C.text} style={{ marginTop: S.lg }} />}
      {!!err && <Card style={{ marginTop: S.md }}><Text style={st.body}>{err}</Text></Card>}

      {res && mode === 'vin' && (
        <View style={{ gap: S.sm, marginTop: S.md }}>
          <Card>
            <Text style={st.label}>Decoded · {res.r.source === 'nhtsa-vpic' ? 'NHTSA vPIC' : res.r.source === 'offline-wmi' ? 'offline' : 'mock'}</Text>
            <Text style={st.body}>{[res.r.decoded.year, res.r.decoded.make, res.r.decoded.model, res.r.decoded.trim].filter(Boolean).join(' ') || 'Unknown'}</Text>
            {!!res.r.decoded.electrification && <Muted>{res.r.decoded.electrification}</Muted>}
            <Muted>VIN {res.r.vin}</Muted>
            {res.r.warnings.map((w) => <Muted key={w}>⚠ {w}</Muted>)}
          </Card>

          {(res.r.matches.length > 0 || res.guides.length > 0) && <Text style={st.h2}>Is this the car?</Text>}
          {(res.guides.length > 0 || res.r.matches[0]?.strength === 'model') && (
            <VerifyPicture guides={res.guides} vehicleId={res.r.matches[0]?.strength === 'model' ? res.r.matches[0].vehicleId : undefined} compact />
          )}
          {res.r.matches.map((m) => {
            const v = getVehicle(m.vehicleId)!;
            return <Btn key={m.vehicleId} tone={m.strength === 'model' ? 'red' : 'neutral'} label={`${v.make} ${v.model}`.toUpperCase()} sub={m.reason} onPress={() => open(m.vehicleId, `/vehicle/${m.vehicleId}`)} />;
          })}
          {res.guides.length > 0 && (() => {
            const label = [res.r.decoded.year, res.r.decoded.make, res.r.decoded.model].filter(Boolean).join(' ');
            return <Btn tone="red" label="OPEN CUT SHEET" sub={`${res.guides.length} sheet(s) · ${label}`} onPress={() => open(`guide:${res.guides[0].key}`, guideHref(res.guides, label))} />;
          })()}
          {res.r.matches.some((m) => m.vehicleId === 'wrangler-4xe') && (
            <Card style={{ borderColor: C.red }}><Text style={st.body}>4xe: check 68C recall remedy on this VIN before trusting the pack.</Text></Card>
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
