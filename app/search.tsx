import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, H2, Input, Muted, Notice, Row, Screen, Seg, st } from '../src/components/ui';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { getVehicle, searchVehicles, Vehicle, VEHICLES } from '../src/data/catalog';
import { lookupVin, VinResult } from '../src/lib/vin';
import { looksLikeVin } from '../src/lib/vin-core';
import { Guide, matchGuess, searchGuides } from '../src/lib/match-core';
import { allReady, guideIndex, loadPacks, subscribe } from '../src/lib/packs';
import { logIdAttempt, updateIdAttempt } from '../src/lib/history';
import { NHTSA_PORTAL } from '../src/config';
import { S } from '../src/theme';

type Mode = 'name' | 'vin';
const SEED = VEHICLES.map((v) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));
const ALL = '__all';

/** One row per make + model; the guide page lists every year / doc type. */
function groupGuides(gs: Guide[]) {
  const m = new Map<string, Guide[]>();
  gs.forEach((g) => { const k = `${g.make}|${g.model}`; m.set(k, [...(m.get(k) ?? []), g]); });
  return [...m.values()];
}
const guideHref = (gs: Guide[], label: string) => `/guide?keys=${gs.map((g) => g.key).join(',')}&title=${encodeURIComponent(label)}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function Search() {
  const r = useRouter();
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { loadPacks().then(force); return subscribe(force); }, []);
  const [mode, setMode] = useState<Mode>('name');
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<string | undefined>();
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ r: VinResult; at: number; guides: Guide[] } | null>(null);

  const index = guideIndex();
  const makesAll = useMemo(() => [...new Set([...VEHICLES.map((v) => v.make), ...index.map((g) => g.make)])].sort(), [index.length]);
  // Typing a make selects its chip, so the two filters never disagree (F16).
  const typedMake = useMemo(() => makesAll.find((m) => m.toLowerCase() === q.trim().toLowerCase()), [q, makesAll]);
  const make = chip ?? typedMake;
  const textQ = typedMake && !chip ? '' : q;
  const seedList = useMemo(() => searchVehicles(textQ, make), [textQ, make]);
  const seedGrouped = useMemo(() => {
    const g: Record<string, Vehicle[]> = {};
    seedList.forEach((v) => (g[v.make] ??= []).push(v));
    return Object.entries(g);
  }, [seedList]);
  const makeCounts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    index.forEach((g) => m.set(g.make, (m.get(g.make) ?? new Set()).add(g.model)));
    return [...m.entries()].map(([mk, set]) => [mk, set.size] as const).sort((a, b) => a[0].localeCompare(b[0]));
  }, [index.length]);
  const filtering = q.trim().length >= 2 || !!make;
  const guideGroups = useMemo(() => (filtering ? groupGuides(searchGuides(textQ, index, make, 200)) : []), [textQ, make, index.length]);
  // Put the selected make first so it's visible without scrolling the chip row.
  const chipOpts = useMemo(() => {
    const rest = makesAll.filter((m) => m !== make);
    return [{ key: ALL, label: 'All' }, ...(make ? [{ key: make, label: make }] : []), ...rest.map((m) => ({ key: m, label: m }))];
  }, [makesAll, make]);

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
      <Seg label="Search by" options={['name', 'vin'] as const} value={mode} render={(m) => (m === 'name' ? 'Make / model' : 'VIN')}
        onChange={(m) => { setMode(m); setErr(''); setRes(null); }} />

      {mode === 'name' && (
        <>
          <Input label="Make or model" icon="search" placeholder="e.g. ioniq 6" value={q} onChangeText={setQ}
            onClear={() => { setQ(''); setChip(undefined); }} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
          {looksLikeVin(q) && <Btn icon="search" label="That looks like a VIN — look it up" onPress={() => { setMode('vin'); setVin(q); runVin(q); }} />}
          <Chips label="Make" options={chipOpts} value={make ?? ALL}
            onChange={(k) => { if (k === ALL) { setChip(undefined); if (typedMake) setQ(''); } else setChip(k === chip ? undefined : k); }} />

          {filtering && (
            <Muted>
              {plural(seedList.length, 'FULLCHARGE page')}{index.length ? ` · ${plural(guideGroups.length, 'cut sheet model')}` : ''} match "{make && !textQ.trim() ? make : q.trim()}"
            </Muted>
          )}

          {seedGrouped.length > 0 && <H2 sub={filtering ? undefined : 'Quick-reference pages written for responders'}>FULLCHARGE pages</H2>}
          {seedGrouped.map(([mk, vs]) => (
            <View key={mk}>
              <Text style={[st.label, { paddingTop: S.sm }]}>{mk}</Text>
              {vs.map((v) => <Row key={v.id} title={v.model} meta={`${v.years} · ${v.type}`} onPress={() => r.push(`/vehicle/${v.id}`)} />)}
            </View>
          ))}

          <H2 sub="Manufacturer rescue sheets, PDF">All cut sheets{index.length ? ` (${index.length})` : ''}</H2>
          {!index.length && (
            <Card>
              <Text style={st.body}>No cut sheets on this phone yet.</Text>
              <Btn tone="hazmat" size="sm" icon="dl" label="Download rescue sheets" onPress={() => r.push('/settings/downloads')} />
            </Card>
          )}
          {!!index.length && !allReady() && <Notice tone="info">Download not finished — some sheets need signal.</Notice>}
          {!!index.length && !guideGroups.length && filtering && <Muted>No cut sheet matches.</Muted>}
          <View>
            {!!index.length && !filtering && makeCounts.map(([mk, n]) => (
              <Row key={mk} title={mk} pill={plural(n, 'model')} onPress={() => setChip(mk)} />
            ))}
            {guideGroups.map((gs) => {
              const label = `${gs[0].make} ${gs[0].model}`;
              const years = [...new Set(gs.map((g) => g.years))].join(' · ');
              return <Row key={label} title={label} meta={`${years}${gs[0].powertrain ? ` · ${gs[0].powertrain}` : ''}`} pill={plural(gs.length, 'sheet')} onPress={() => r.push(guideHref(gs, label))} />;
            })}
          </View>
        </>
      )}

      {mode === 'vin' && (
        <>
          <Input label="VIN" placeholder="17 characters" value={vin} onChangeText={(t) => setVin(t.toUpperCase())}
            autoCapitalize="characters" autoCorrect={false} maxLength={20} returnKeyType="search" onSubmitEditing={() => runVin()} />
          <Muted>Dash (driver side, through windshield) or driver door jamb.</Muted>
          <Btn tone="red" icon="search" label="Look up VIN" onPress={() => runVin()} disabled={busy || !vin.trim()} reason={busy ? undefined : "Type the VIN first."} />
        </>
      )}

      {busy && <ActivityIndicator color="#FFF" size="large" />}
      {!!err && <Notice tone="warn">{err}</Notice>}

      {res && mode === 'vin' && (
        <>
          <Card>
            <Text style={st.label}>Decoded · {res.r.source === 'nhtsa-vpic' ? 'NHTSA vPIC' : res.r.source === 'offline-wmi' ? 'offline' : 'mock'}</Text>
            <Text style={[st.body, { fontWeight: '700', fontSize: 20 }]}>{[res.r.decoded.year, res.r.decoded.make, res.r.decoded.model, res.r.decoded.trim].filter(Boolean).join(' ') || 'Unknown'}</Text>
            {!!res.r.decoded.electrification && <Muted>{res.r.decoded.electrification}</Muted>}
            <Muted>VIN {res.r.vin}</Muted>
          </Card>
          {res.r.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

          {(res.r.matches.length > 0 || res.guides.length > 0) && <H2>Is this the car?</H2>}
          {res.r.matches.map((m) => {
            const v = getVehicle(m.vehicleId)!;
            return <Btn key={m.vehicleId} tone={m.strength === 'model' ? 'red' : 'neutral'} label={`${v.make} ${v.model}`} sub={m.reason} onPress={() => open(m.vehicleId, `/vehicle/${m.vehicleId}`)} />;
          })}
          {res.guides.length > 0 && (() => {
            const label = [res.r.decoded.year, res.r.decoded.make, res.r.decoded.model].filter(Boolean).join(' ');
            return <Btn tone="red" icon="book" label="Open cut sheet" sub={`${plural(res.guides.length, 'sheet')} · ${label}`} onPress={() => open(`guide:${res.guides[0].key}`, guideHref(res.guides, label))} />;
          })()}
          {res.r.matches.some((m) => m.vehicleId === 'wrangler-4xe') && (
            <Notice tone="danger">4xe: check 68C recall remedy on this VIN before trusting the pack.</Notice>
          )}
          {!res.r.matches.length && !res.guides.length && (
            <Card>
              {/^(ICE|)$/.test(res.r.decoded.electrification ?? '') && res.r.source === 'nhtsa-vpic'
                ? <Text style={st.body}>No electrification listed for this VIN — likely gas-only. NHTSA cut sheets cover electric-powered vehicles only.</Text>
                : <Text style={st.body}>No cut sheet on this phone for this vehicle.</Text>}
              {!index.length && <Btn tone="hazmat" size="sm" icon="dl" label="Download rescue sheets" onPress={() => r.push('/settings/downloads')} />}
              <Btn tone="outline" size="sm" icon="ext" label="NHTSA ERG portal (needs signal)" onPress={() => Linking.openURL(NHTSA_PORTAL)} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
