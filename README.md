# FULLCHARGE — ERG · EVR · BESS EXPERT

React Native (Expo SDK 54, expo-router) · Supabase (auth, Postgres, storage, edge functions) · Gemini vision (server-side).
**Responder aid — NOT a replacement for the manufacturer ERG.**

## Quick start (mock data, no accounts needed)

```bash
npm install
npx expo install --fix          # aligns native package versions to the installed SDK
cp .env.example .env            # EXPO_PUBLIC_USE_MOCKS=true by default
npm run mock:tunnel             # Expo via ngrok tunnel → scan QR with iPhone camera (Expo Go)
```

Mock mode = no network calls: embedded catalog, sample camera-ID result (Model Y 92 %…),
mock VINs `7SAYGDEEXPF000001` (Model Y) and `1C4JJXP63MW000002` (Wrangler 4xe),
sign-in code `123456`, simulated pack downloads.

## Live backend

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
2. Seed: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed`
3. Secrets: `supabase secrets set GEMINI_API_KEY=… GEMINI_MODEL=gemini-3.8-flash`
4. Deploy: `supabase functions deploy identify-vehicle`
5. `.env`: `EXPO_PUBLIC_USE_MOCKS=false`, URL + anon key. Auth → Email → enable OTP (code, 6 digits).

### Testing functions locally through ngrok
```bash
supabase start && supabase functions serve --env-file supabase/.env.local
ngrok http 54321
# .env → EXPO_PUBLIC_FUNCTIONS_URL=https://<id>.ngrok-free.app/functions/v1
```
Set `IDENTIFY_MOCK=true` in `supabase/.env.local` to test the round-trip without spending Gemini calls.

### iOS build
`npx eas build -p ios --profile preview` → TestFlight. Needs Apple Developer ($99/yr).

## Layout
```
app/                 screens (expo-router)
  index              Home — Camera ID / Search / BESS
  camera             photo → ranked matches → "Is this the car?" confirm
  search             make/model (FULLCHARGE pages + every downloaded NHTSA cut sheet) · VIN
  guide              any NHTSA vehicle: its cut sheets (offline once downloaded) + ERG 147 + zones
  vehicle/[id]       ERG page + 4 non-sticky tabs + "Was this right?" loop
  bess/ , bess/[id]  8 systems, shutdown cards, size-up, playbooks
  erg-pdf            in-app PDF (offline copy → live → fallback sheet)
  hazmat             Guide 147, per-item chemistry, honest limit
  zones              environment → location → map (true-scale rings, app-controlled zoom)
  quick              offline quick sheet
  recents, history, settings/, settings/downloads (ForeFlight-style packs)
src/data/            fullcharge-data.json (source of truth), catalog.ts, content.ts
src/lib/             supabase, auth, identify, vin(-core), geo, packs, history
supabase/            migrations + edge function (identify-vehicle)
tools/nhtsa/         scrape → download → publish every NHTSA cut sheet (runs on your PC)
scripts/             seed, check-urls (run before every release), logic tests
```

## Checks
- `npm test` — VIN check digit / year / catalog mapping, true-scale ring maths.
- `npm run check-urls` — live-checks all 19 ERG PDFs + 3 Guide 147 URLs.

## Decisions taken (flag to Vince / Muse)
- **Sign-in is optional.** Packet §(i) says no accounts in v1; you asked for Supabase auth. It never gates a scene screen — only links ID feedback.
- **Gemini key lives in the edge function**, never in the app.
- **Photo sharing is OFF by default** (crash photos can show faces / plates). Learning loop still logs match + correction.
- **VIN results always go through a confirm tap**, same as camera ID. Gas Wrangler / F-150 VINs don't map to the EV pages.
- **No plate search** (decided 2026-11-23).
- **Camera ID is open-world**: Gemini names make / model / years from its own knowledge — nothing to train per car. The phone matches that name to its stored cut sheets. Photo ID needs signal; the cut sheets don't.
- **All NHTSA cut sheets live on the device** via two packs: "All rescue sheets" (page images: 200 dpi iPhone / 300 dpi iPad, roughly 300–650 MB) and "All full ERGs" (shrunk PDFs, optional). Delta updates; a sheet stays usable until its replacement lands. See tools/nhtsa/README.md.
- **iPad supported** (portrait, full screen); pages cap at 760 pt wide; rescue sheets get the sharper image set.
- **bZ4X / Prius Prime stays merged** with its data-note banner until Vince decides (open question 3).
- **Core pack = the 19 PDFs downloaded direct from manufacturers** (avoids redistribution question). Top ~100, NHTSA, regional, map packs show "Not published yet" until ingestion exists.
- Branding `.webp` files weren't in the upload → vector bolt-shield placeholder + `assets/icon.png` placeholder.
- Gemini paid tier now stores generateContent requests by default for new projects — turn storage off in the project before sending scene photos.

- **On-scene rule (applies to every screen):** this is used at an emergency where time matters, with gloves,
  glare and smoke. The big stuff (distances, cut loop, 12V, shutdown steps) is readable at 0–1 taps; detail is one
  tap further in. No instructions to read in the moment, no extra steps, nothing a crew has to set up first.
  Pictures over text: lead with the manufacturer's drawing; no checklists on the main view — long text goes behind one tap.
- **Design system v2** (design sheet, 24 Nov 2026): tokens in `src/theme.ts`, components in `src/components/ui.tsx`.
  18px body / 15px floor, 48px minimum targets, solid-white selection with a check, safety caveats in the warning style.
  The rescue-sheet / PDF viewers (`sheet`, `erg-pdf`) keep the v1 look on purpose — `src/components/legacy.tsx`.
- **Downloads:** bundles run in the normal session while the app is on screen (full speed) and are handed to iOS's
  background session when it leaves; failed bundles retry twice; 12 single files at a time; live MB/s + time left.
  Vehicle pages can fetch just their own sheets ("Download all N") without the whole pack.

## Not built yet
NHTSA ingestion job (portal is JS-filtered + bot-blocked — needs a browser fetch), on-device ID model, offline map tiles, Android PDF viewer (iOS WebView renders PDFs natively).
