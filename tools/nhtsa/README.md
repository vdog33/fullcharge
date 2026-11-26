# Put every NHTSA cut sheet on the phone

These tools run **on your PC**, not in the app. They do three things:
1. **scrape**: open the NHTSA ERG portal in a real Chrome and list every ERG and rescue sheet.
2. **download**: download every PDF once, to `out/pdfs/`.
3. **compress**: shrink them. Rescue sheets become page images (200 dpi for iPhone, 300 dpi for iPad); full ERGs become screen-quality PDFs.
4. **publish**: upload the shrunk files and a manifest to your Supabase project.

The app then copies them onto each phone, so they open with no signal. There are two packs:

| Pack | What | Size (first scrape, Nov 2026) |
|---|---|---|
| **All rescue sheets** | the 1–2 page cut sheets: cut points, HV, 12V, airbags | ~435 PDFs · ~1.3 GB |
| **All full ERGs** | the long emergency response guides | ~481 PDFs · ~3.0 GB |

Those are the original sizes. After `compress`, a test on 4 sheets cut rescue sheets by about 60% (and the 33 MB
Rolls-Royce sheet to 0.7 MB), with the smallest print still readable zoomed in 3×.
Your PC keeps the originals (about 4.6 GB). Each phone picks which packs to get.

**Needs Ghostscript:** ghostscript.com → Ghostscript → "Ghostscript AGPL Release", Windows (64 bit). Install with defaults.

## One-time setup (PowerShell)
```powershell
cd fullcharge\tools\nhtsa
npm run setup            # installs Playwright + its Chromium (~150 MB) and the image tool (sharp)
```

## Run
```powershell
npm run scrape           # ~5–15 min. A Chrome window opens — leave it alone until "Done"
#   → out\guides.json (the list). Prints the PDF count + listed sizes.
npm run download         # ~4.6 GB for the full set. Re-run any time; finished files are skipped
npm run compress         # 30–90 min the first time; later runs only do new / changed sheets. Prints the real sizes.
$env:SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "YOUR-SERVICE-ROLE-KEY"   # Supabase → Project Settings → API. Never put this in the app.
npm run publish          # uploads only new / changed PDFs, then the manifest
```
To update weekly (or whenever NHTSA adds sheets), run `npm run all`, which does all four steps. Phones download only what changed,
and a sheet stays on the phone until its replacement has fully downloaded.

## Car pictures + phone numbers from the guides themselves
Most manufacturer guides open with a photo of the exact car (e.g. the Acura MDX cover) and print a phone line
("Acura Client Relations (800) 382-2238"). One pass reads them all:
```powershell
$env:GEMINI_API_KEY = "..."   # same key as the app's server
npm run guide:scan            # crops the car off page 1–2 of every guide, lists every phone number
#   → open out\contacts-review.html, tick the numbers a responder should call, Save, move contacts-approved.json into out\
```
The cropped car pictures then appear FIRST (pre-selected) on the photos review page below. Ticked numbers show on the
vehicle's **Contacts** tab after `npm run publish`.

## Vehicle photos (real photos, approved by you)
The app shows a real photo of each model on the "Which car is it?" cards — from the phone, no signal needed. Nothing
is looked up live any more (the old Wikipedia search picked wrong cars). You approve every photo:
```powershell
npm run photos:find      # finds candidate photos (Wikimedia Commons, free licences) → out\photos-review.html
#   open it in Chrome, click the right photo per model (right model AND years) or "None fit", press Save approvals,
#   move the downloaded photos-approved.json into out\
npm run photos:build     # downloads + shrinks the approved ones (~60 KB each) → out\photos.json
npm run publish          # ships them inside the "All rescue sheets" pack
```
Your own photos (department photos, ones you have rights to) beat Commons: name them with the model's code from
`out\photos-codes.txt` and drop them in `out\photos-manual\` (optional `.txt` with the same name = the credit line).
Re-running is safe: decisions are kept, only new models need a look.

## Brand logos (manufacturer grid)
```powershell
npm run logos:find       # → out\logos-review.html: click the current logo per brand, Save approvals, move the file into out\
npm run logos:build      # → assets\brands\*.png + src\data\brand-logos.ts. Commit both, then rebuild the app.
```
`npm run pictures` runs both "find" steps (logos + vehicle photos) in one go.

## Vehicles NHTSA doesn't list (e.g. BMW i3)
NHTSA's portal only carries what manufacturers upload — mostly current models. Older / discontinued EVs (BMW i3
2014–2022 and others) are missing. Add them in **`extra-guides.csv`** (in this folder), one row per sheet, using the
manufacturer's OWN PDF (BMW: aos.bmwgroup.com → rescue sheets; Euro NCAP's Euro Rescue app also links them):
```
make,model,years,powertrain,docType,sourceUrl
BMW,i3,2014–2022,BEV,rescue_sheet,https://…the BMW PDF link…
```
Then `npm run download`, `npm run compress`, `npm run publish` — it ships like any NHTSA sheet.

## Vehicles with no rescue sheet
Some NHTSA entries (Autocar and other trucks / buses) only have a full ERG. Those ERGs now go in the
"All rescue sheets" pack too, so every vehicle has its cut info offline with just that one pack.

## Sheets NHTSA has broken
Some files on NHTSA's server are empty or deleted. To fill one in, get the sheet from the manufacturer (or Euro NCAP),
name it with the code `download` prints for it (e.g. `54f3a1dec7cf.pdf`), put it in `out\manual\`, and re-run `npm run download`.

## Review step (usually empty)
The NHTSA list has a fixed format, so normally nothing needs review. If `out\review.csv` has rows, those are sheets where make, model or years couldn't be read. Open it in Excel and fix
the `make`, `model`, `years`, `powertrain` and `docType` columns. Put `DELETE` in `make` to drop a row.
Save it as **`out\review-fixed.csv`**, then run `npm run download` and `npm run publish` again.
Sheets with no make or model are held back from the phones until they're fixed (listed in `out\held-back.json`).

## If the numbers look wrong
The first scrape (Nov 2026) found 917 PDFs. If a later run finds far fewer, NHTSA probably changed the page.
Zip `out\debug\` and send it to Claude. That folder holds the page snapshots and the data the page loaded.

## Before shipping to other departments
Copies of the manufacturer PDFs are re-hosted on your Supabase storage. Check with a lawyer, or ask NHTSA or the
manufacturers, that redistributing them inside the app is OK. The fallback: phones download from the original URLs instead (less reliable).
