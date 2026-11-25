# Home-battery (BESS) catalog

Builds the list of every home battery system that can legally be installed in the US, so crews can look any of
them up (and the camera can recognise them).

**Source:** the California Energy Commission's Energy Storage System list. A system is listed only with a
UL 9540 certificate, which the US model installation codes require for home batteries. It's public data.

```powershell
cd tools\bess
npm run setup      # first time only (Playwright + Chromium)
npm run scrape     # a Chrome window opens and pages through the list. Leave it alone until "Done".
$env:SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."
npm run publish    # uploads out\bess-catalog.json; phones pick it up next launch
```

Re-run monthly. New systems get listed all the time.

## What the app shows
- **Brands → product families → listed models** (kWh, kW, voltage, listing text). Home-sized (≤ 20 kWh per unit) by default; commercial on request.
- **Chemistry** read from the listing text (LFP, NMC…). If it just says "lithium-ion", the app treats it as the worse case.
- **Shutdown:** the FULLCHARGE verified card if one exists for that product, otherwise the generic NEC 706.15 steps, clearly marked "not verified".
- **Camera ID:** Gemini reads the brand, product name and model number off the unit or its label. The model number is matched against the listing's wildcard numbers (`XX` = digits, `Y` = a letter).

## Still to do (needs manufacturer documents)
Verified shutdown cards and emergency phone numbers for more products. Those must come from each manufacturer's
emergency-response / installation guide, never from guesswork.
