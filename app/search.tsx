import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, H2, Input, Muted, Notice, Row, Screen, Seg, st } from '../src/components/ui';
import { BrandGrid, BrandItem } from '../src/components/BrandGrid';
import { MatchPicker } from '../src/components/MatchPicker';
import { SheetThumb } from '../src/components/SheetThumb';
import { VoiceSearchBtn } from '../src/components/VoiceSearch';
import { Candidate, describeModel, destination, vinCandidate } from '../src/lib/identify';
import { LastVehicleBar } from '../src/components/LastVehicleBar';
import { getVehicle, searchVehicles, seedBody, Vehicle, VEHICLES } from '../src/data/catalog';
import { lookupVin, VinResult } from '../src/lib/vin';
import { looksLikeVin, matchCatalog } from '../src/lib/vin-core';
import { BODIES, Body, cleanModel, Guide, matchGuess, matchMakes, namedMake, smartSearchGuides } from '../src/lib/match-core';
import { allReady, guideIndex, loadPacks, subscribe } from '../src/lib/packs';
import { logIdAttempt, updateIdAttempt } from '../src/lib/history';
import { NHTSA_PORTAL } from '../src/config';
import { S } from '../src/theme';

type Mode = 'name' | 'vin';
const SEED = VEHICLES.map((v) => ({ id: v.id, make: v.make, model: v.model, years: v.years, type: v.type }));

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
  const [body, setBody] = useState<Body | undefined>(); // Cars · SUVs · Trucks · Vans · Heavy
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ r: VinResult; at: number; guides: Guide[] } | null>(null);
  const [vinCands, setVinCands] = useState<Candidate[]>([]); // same pick → check → accept as camera ID
  const [accepted, setAccepted] = useState<string | null>(null);
  // Coming back from the scanner with a VIN: look it up straight away.
  const params = useLocalSearchParams<{ vin?: string; mode?: string; voice?: string }>();
  useEffect(() => { if (params.vin) { setMode('vin'); setVin(params.vin); runVin(params.vin); } }, [params.vin]);
  // From Start New: VIN opens straight on the VIN tab; Voice starts listening right away.
  useEffect(() => { if (params.mode === 'vin' && !params.vin) setMode('vin'); }, [params.mode]);

  const index = guideIndex();
  const makesAll = useMemo(() => [...new Set([...VEHICLES.map((v) => v.make), ...index.map((g) => g.make)])].sort(), [index.length]);
  // Typing a make selects its chip, so the two filters never disagree (F16).
  // "chevy", "vw", "Tesla" name a make outright; anything else narrows the brand list letter by letter.
  const typedMake = useMemo(() => namedMake(q, makesAll), [q, makesAll]);
  const make = chip ?? typedMake;
  const textQ = typedMake && !chip ? '' : q;
  const seedList = useMemo(() => searchVehicles(textQ, make).filter((v) => !body || seedBody(v.id) === body), [textQ, make, body]);
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
    return [...m.entries()].map(([mk, set]) => ({ make: mk, models: set.size })).sort((a, b) => a.make.localeCompare(b.make));
  }, [index.length]);
  const filtering = q.trim().length >= 2 || !!make || !!body;
  // A body type alone lists every model of that type (not just the first 200 sheets).
  const bodyOnly = !!body && !make && !textQ.trim();
  const guideGroups = useMemo(() => (filtering
    ? groupGuides(smartSearchGuides(textQ, body ? index.filter((g) => g.body === body) : index, make, bodyOnly ? 5000 : 200))
    : []), [textQ, make, body, index.length]);
  // Brand + model names help the phone's speech recognizer hear "Ioniq", "Lyriq", "Rivian".
  const voiceHints = useMemo(() => [...makesAll, ...new Set([...VEHICLES.map((v) => v.model), ...index.map((g) => cleanModel(g.model))])].slice(0, 100), [makesAll, index.length]);
  const bodyKnown = useMemo(() => index.some((g) => g.body), [index.length]);
  // Short lists may stream the drawings; long ones show only sheets already on the phone (no 200-page download).
  const streamThumbs = guideGroups.length + seedList.length <= 30;
  // Brands that fit what's typed, from the first letter: "t" → Tesla, Toyota… "te" → Tesla.
  const brandHits = useMemo(() => {
    if (chip || typedMake || !q.trim()) return null;
    const order = matchMakes(q, brands.map((b) => b.make));
    return order.map((m) => brands.find((b) => b.make === m)!).filter(Boolean);
  }, [q, chip, typedMake, brands]);

  async function runVin(v?: string) {
    setErr(''); setRes(null); setVinCands([]); setAccepted(null); setBusy(true);
    try {
      const out = await lookupVin(v ?? vin);
      const d = out.decoded;
      // Offline decode can allow more than one model (NHTSA patterns overlap) — offer each, the crew picks.
      const variants = (out.models?.length ? out.models : [d.model]).map((model) => ({ ...d, model }));
      const picks = variants.map((dv) => {
        const mg = dv.make && dv.model ? matchGuess({ make: dv.make, model: dv.model, yearFrom: dv.year, yearTo: dv.year, powertrain: dv.electrification }, SEED, index) : null;
        return { dv, mg, guides: mg?.guides ?? [] };
      });
      const guides = picks.flatMap((p) => p.guides);
      const at = Date.now();
      await logIdAttempt({
        at, source: 'vin', topMatch: [d.year, d.make, d.model].filter(Boolean).join(' ') || null,
        candidates: out.matches.map((m) => ({ label: m.reason, vehicleId: m.vehicleId, confidence: m.strength === 'model' ? 100 : 0 })), confirmedId: null,
      });
      setRes({ r: out, at, guides });
      const cs = picks.map(({ dv, mg, guides: gs }) => {
        const vid = matchCatalog(dv, VEHICLES).find((m) => m.strength === 'model')?.vehicleId;
        const c0 = vinCandidate(dv, gs, vid);
        return c0 ? { ...c0, yearsLoose: mg?.yearsLoose } : null;
      }).filter((c): c is NonNullable<typeof c> => !!c);
      setVinCands(cs);
      // Photo + checks arrive a moment later (need signal); the card works without them.
      cs.forEach((c) => describeModel(c.guess).then((x) => setVinCands((p) => p.map((q) => (q.label === c.label ? { ...q, photo: x.photo, checks: q.checks.length ? q.checks : x.checks } : q)))).catch(() => {}));
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
          <VoiceSearchBtn autoStart={params.voice === '1'} onText={(t) => { setChip(undefined); setQ(t); }} hints={voiceHints} />
          {/* Body type: one tap narrows everything below (brands, typing, the list). */}
          <Chips label="Vehicle type" options={[{ key: 'all', label: 'All' }, ...BODIES]} value={body ?? 'all'}
            onChange={(k) => setBody(k === 'all' || k === body ? undefined : (k as Body))} />
          {!!body && !bodyKnown && !!index.length && <Muted>Only the FULLCHARGE pages have a type yet — the rest arrive with the next data update.</Muted>}
          {looksLikeVin(q) && <Btn icon="search" label="That looks like a VIN — look it up" onPress={() => { setMode('vin'); setVin(q); runVin(q); }} />}
          {make && (
            <Btn tone="outline" size="sm" icon="back" label={`All brands · showing ${make}`}
              onPress={() => { setChip(undefined); if (typedMake) setQ(''); }} />
          )}
          {brandHits && brandHits.length > 0 && (
            <>
              <H2>{brandHits.length === 1 ? 'Brand — tap it' : `Brands (${brandHits.length})`}</H2>
              <BrandGrid brands={brandHits.slice(0, 8)} onPick={(mk) => { setChip(mk); setQ(''); }} />
            </>
          )}
          {!filtering && !q.trim() && (
            <>
              <BrandGrid brands={brands} onPick={(mk) => { setChip(mk); setQ(''); }} />
              {!index.length && (
                <Card>
                  <Text style={st.body}>Only the 20 FULLCHARGE vehicles until the vehicle list loads (needs signal once).</Text>
                  <Btn tone="hazmat" size="sm" icon="dl" label="Download rescue sheets" onPress={() => r.push('/settings/downloads')} />
                </Card>
              )}
            </>
          )}

          {filtering && (
            <Muted>
              {plural(seedList.length, 'FULLCHARGE page')}{index.length ? ` · ${plural(guideGroups.length, 'cut sheet model')}` : ''} match "{make && !textQ.trim() ? make : q.trim()}"
            </Muted>
          )}

          {filtering && seedGrouped.length > 0 && <H2>FULLCHARGE pages</H2>}
          {filtering && seedGrouped.map(([mk, vs]) => (
            <View key={mk}>
              <Text style={[st.label, { paddingTop: S.sm }]}>{mk}</Text>
              {vs.map((v) => <Row key={v.id} lead={<SheetThumb vehicleId={v.id} width={THUMB_W} height={THUMB_H} remote={streamThumbs} />} title={v.model} meta={`${v.years} · ${v.type}`} onPress={() => r.push(`/vehicle/${v.id}`)} />)}
            </View>
          ))}

          {filtering && <H2>{make ? `${make} cut sheets` : 'Cut sheets'}</H2>}
          {filtering && !!index.length && !allReady() && <Notice tone="info">Download not finished — some sheets need signal.</Notice>}
          {filtering && !!index.length && !guideGroups.length && <Muted>No cut sheet matches.</Muted>}
          {filtering && !index.length && <Muted>NHTSA cut sheets appear once the vehicle list has loaded.</Muted>}
          <View>
            {guideGroups.map((gs) => {
              const label = `${gs[0].make} ${cleanModel(gs[0].model)}`;
              const years = [...new Set(gs.map((g) => g.years))].join(' · ');
              const pt = gs[0].powertrain ?? '';
              const flag = /FCEV/i.test(pt) ? 'Hydrogen · 115' : /^HEV$/i.test(pt) ? 'Hybrid · 171?' : plural(gs.length, 'sheet');
              return <Row key={label} lead={<SheetThumb guides={gs} width={THUMB_W} height={THUMB_H} remote={streamThumbs} />} title={label} meta={`${years}${pt ? ` · ${pt}` : ''}`} pill={flag} onPress={() => r.push(guideHref(gs, label))} />;
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
          <Btn icon="cam" label="Scan VIN — barcode or photo" onPress={() => r.push('/scan-vin')} />
        </>
      )}

      {busy && <ActivityIndicator color="#FFF" size="large" />}
      {!!err && <Notice tone="warn">{err}</Notice>}

      {res && mode === 'vin' && (
        <>
          <Card>
            <Text style={st.label}>Decoded · {res.r.source === 'nhtsa-vpic' ? 'NHTSA vPIC' : res.r.source === 'offline-db' ? 'offline (NHTSA data on phone)' : res.r.source === 'offline-wmi' ? 'offline' : 'mock'}</Text>
            <Text style={[st.body, { fontWeight: '700', fontSize: 20 }]}>{[res.r.decoded.year, res.r.decoded.make, res.r.decoded.model, res.r.decoded.trim].filter(Boolean).join(' ') || 'Unknown'}</Text>
            {!!res.r.decoded.electrification && <Muted>{res.r.decoded.electrification}</Muted>}
            <Muted>VIN {res.r.vin}</Muted>
          </Card>
          {res.r.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

          {vinCands.length > 0 && (
            <MatchPicker title={vinCands.length > 1 ? 'Which one is it?' : 'Is this the car?'} candidates={vinCands} accepted={accepted} noneLabel="Not this car — search by name"
              onNone={async () => { await updateIdAttempt(res.at, { confirmedId: null }); setMode('name'); setRes(null); setVinCands([]); }}
              onAccept={async (c) => {
                const d = destination(c);
                if (!d) return;
                setAccepted(c.label);
                await open(d.id, `${d.href}${d.href.includes('?') ? '&' : '?'}idAt=${res.at}`);
              }} />
          )}
          {res.r.matches.some((m) => m.vehicleId === 'wrangler-4xe') && (
            <Notice tone="danger">4xe: check 68C recall remedy on this VIN before trusting the pack.</Notice>
          )}
          {!res.r.matches.some((m) => m.strength === 'model') && !res.guides.length && (
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

// Car drawing in each row: the top of the rescue sheet (side view), wide band.
const THUMB_W = 104;
const THUMB_H = 44;
