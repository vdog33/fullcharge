# FULLCHARGE v1 — first run (Windows PC)

This build already has Muse's first-run fixes in it:
- bZ4X and Prius Prime split into two vehicles, each with its own verified ERG.
- Real FULLCHARGE branding (shield logo, wordmark, app icon) instead of placeholders.
- `babel-preset-expo` added — the app would not bundle without it.
- Typecheck clean, logic tests 3/3, all 23 ERG/Guide 147 links live-checked.

## Run it

In PowerShell or Command Prompt:

```bat
cd fullcharge
copy .env.example .env
npm install
npx expo install --fix
npx expo start --tunnel
```

Mock mode comes from the `.env` file, so plain `npx expo start --tunnel`
runs in mock mode on Windows.

You need Node.js 20 or newer installed first: https://nodejs.org — grab
the LTS version. Then open Expo Go on your iPhone and scan the QR code
the terminal prints.
Mock mode needs no accounts. Mock sign-in code: `123456`.
Mock VINs: `7SAYGDEEXPF000001` (Model Y), `1C4JJXP63MW000002` (Wrangler 4xe).
Mock mode includes a sample "All cut sheets" pack (the 20 vehicles) so search and downloads can be tested.

## Notes

- `npx expo install --fix` may hit a peer-dependency error on npm; if it does,
  the included `.npmrc` (legacy-peer-deps=true) fixes it — just run it again.
- Before sending real scene photos through it, turn off Gemini request
  storage in the Gemini project — paid projects store requests by default.
