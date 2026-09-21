# Automatic letter print queue

Released backend 2026-09-20; theme staged for publication.

## Use

1. Publish **Atelier Elunora v1.38 — Automatic Letter Print Queue** (theme 191754043680). It is a duplicate of the latest live v1.36 with only the four station files replaced, including the earlier image-edge text spacing improvement. Other storefront/package changes remain intact.
2. Save a tested event template with a cut size of **3.6 inches or smaller**. Do not change a cutter-calibrated 3.75-inch design just to enable batching without testing the smaller cut. Six 3.75-inch cuts cannot fit Letter.
3. Open your existing private print-station link on the printing computer and reload once. No owner-app redeployment is needed for this feature.
4. Close any individual photo editor. Choose **Start automatic six-photo sheets** and acknowledge the paper/cut requirements.
5. The oldest six eligible pending photos are reserved together and arranged in two columns and three rows. Each gets one magnet, its saved crop and template snapshot, including wrap colors, Brown Carolina lettering and per-side text. Jobs without a template snapshot use the saved event template. Multiple-copy jobs remain manual. Unsaved individual-editor changes do not apply to automatic sheets.
6. The browser requests printing once the six photos have loaded and the sheet has rendered. Select Letter, 100% / actual size, no headers or footers, no enlargement or fit-to-page. At 3.6-inch cuts, the layout needs 0.1-inch top/bottom printable margins. Confirm sizing with a ruler and press a sample.
7. Confirm **sheet physically printed** after inspecting the actual output. This completes the batch and lets automatic mode request the next full sheet. A closed or canceled print dialog never marks jobs printed.
8. **Print remaining photos** explicitly prints a partial sheet (one to six eligible jobs). **Return sheet to pending** releases the reservation and pauses automation. Check/cancel the printer queue before returning jobs or printing again.

Keep the print desk open, awake and online. Polling occurs every five seconds while visible. Automatic mode is deliberately off after reload or a connection/rendering failure. A recovered reservation never auto-prints again; inspect printer output and either confirm it, explicitly prepare/print it, or return it to pending. Another window changing a batch pauses this window.

This is browser-assisted automatic batching, not silent unattended printing. A browser may require an interaction to show its print dialog; Prepare / print remains available. The app cannot observe physical printer success. Fully unattended printing requires a separately installed local print service and printer acknowledgements. No local print bridge is included here. A letter-capable printer is required; do not send Letter sheets to a 4×6-only print workflow.

## Deployment and preservation

- Live Supabase project: `gefdlubvqymyxrguhtnc`.
- New migration ONLY: `supabase/migrations/20260920202808_letter_print_batches.sql`. Applied successfully; old migrations were not replayed.
- Live `gallery-api` version **21**, platform `verify_jwt=false` retained; the live version 20 files were retrieved and only `station.mjs` changed. No new public credential, CORS change or service-role exposure.
- Security advisors: four existing informational RLS/no-policy findings for intentionally browser-inaccessible station/template tables; no warning or error finding.
- New RPCs are security invoker, service-role-only, require a valid print station, and scope all operations to its event.
- Batch reservations are serialized by event-row locking. Job row locks and the existing version guard protect individual printing. Individual-job operations reject jobs belonging to a batch, including old clients.
- An idempotent request UUID and `created` flag separate new claims from recovered ones. Only newly created claims trigger automatic print. Physical exactly-once printing cannot be guaranteed by a web page or after manual reprints.
- No owner-app source change was needed. Theme remains unpublished until the merchant publishes it.

## Validation

`npm test` covers database grants, capture/print and event isolation, full/partial selection, oversized-cut rollback, template snapshots, request retries/competing claims, batch confirmation/release, single-job guard, six-up geometry, five-photo wait, sixth-photo automatic print request, refresh recovery without automatic reprint, next batch after physical confirmation, image-load failure and partial sheets. Existing capture, print, color and template tests pass. `npm run check:build` passes. Shopify Liquid validation passes using bundled fallback schemas (remote documentation manifest unavailable).

The staged public demo loads the new controls in Chrome. The remote browser stalled at the confirmation dialog; native print dialog and paper output have not been verified there. Before client use, test the published page with a private event, actual Mac/browser/printer, six captures, canceled print, refresh recovery and a partial sheet. Confirm all six cuts and wrap placement with a ruler and cutter. iPad/Mac hardware acceptance remains a physical-device task.

Demo preview (synthetic photos only):
`https://www.atelierelunora.com/pages/photo-station?preview_theme_id=191754043680&demo=print&batch=1`

## Rollback

Pause automatic sheets and resolve every reserved sheet before reverting. Confirm physically printed sheets or return unprinted ones to pending after checking the printer queue. Publish the previous theme and restore `station.mjs` from branch commit `23ec0a86d96be8274599d81ffbf54c61ad0e0454` through the existing API workflow if a backend rollback is needed. Retain the additive database columns/RPCs and the individual-job guard; they do not affect unbatched jobs and preserve reservation history. Do not drop batch state while jobs are reserved, or replay historical migrations. Previously generated device links keep their existing scope and expiration.

## Vertical cutting guides

Letter sheets and their downloaded PNGs include thin gray dashed vertical guides immediately outside both sides of each full cut area. Cut along the side of the guide nearest the design; the guide ink stays on the waste. Guides include the wrap allowance, do not mark the 2.5-inch front-photo fold, and never cross any photo or wrap artwork, including mixed-size and partial sheets. The sheet dimensions and magnet sizes remain unchanged. This update is included in the unpublished v1.38 theme; publish that theme and prepare a fresh sheet to see the guides.

## Connection fix supersedes v1.38 publication

Publish v1.39 — Station Connection Fix (191755125024) instead. It retains all batching and vertical guides and fixes stale Shopify helper caching by bundling the station into one versioned asset. Older owner-app UI updates still need their separate app deployment/release; see PHOTO-STATION-START-HERE.md.

## Individual-photo copies on Letter (v1.41)

Publish **Atelier Elunora v1.41 — Letter Copy Printing** (191758926112), which includes v1.40 zero-distance support and all prior fixes. The individual-photo editor now defaults to Letter; choose 4 × 6 explicitly for photo-printer paper. Prepare sheets packs up to six copies per Letter sheet when the full cut is at most 3.6 inches, or four for cuts above 3.6 through 3.75 inches. Six copies at 3.75 therefore use two sheets (4 + 2); designs are never shrunk. Vertical cut guides are included. Automatic batching of six different photos retains its existing behavior.

Cancel the old print dialog, check/cancel any physical queued output, and return the reserved individual photo to pending before changing its layout. Choose Letter, set magnet quantity in the app, and prepare new sheets. In the browser dialog use Letter, pages per sheet 1, scale 100%, margins None, headers/footers Off, and copies 1. Printer-dialog Copies repeats the entire prepared sheet. Physical printable margins and cutter calibration still require testing.

This copy-layout update needs only theme publication. The separate zero-distance owner UI update still requires deploying/releasing the updated owner app; backend zero-distance validation is already live in gallery-api v22. Regression tests confirm six image placements in one rendered Letter page, 4 × 6 compatibility, four-up fallback without scaling, and unchanged batch recovery.
