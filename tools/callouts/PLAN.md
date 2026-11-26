# Wish list: rescue-sheet callouts (parked 2026-11-25)

Boxes drawn on the manufacturer rescue sheet at the cut loop, 12V, HV disconnect and no-cut areas,
plus a short numbered list underneath — tap an item to zoom into that part of the sheet.

Plan
1. `propose.mjs` (runs on the PC): send each rescue-sheet page to Gemini, get proposed boxes (box_2d).
2. `review.html`: a person drags boxes into place and confirms the sheet. Name + date recorded.
3. `publish.mjs`: upload `callouts.json` to Supabase `packs/callouts/`.
4. App: draws ONLY confirmed boxes on the hero picture (VerifyPicture), numbered, with crops below.

Done so far: data format + checks (`src/lib/callouts-core.ts`), phone loader (`src/lib/callouts.ts`).
Rule: nothing proposed by AI is shown on scene until a person confirms it against the sheet.
