# Magnet wrap templates — September 20, 2026

Implemented on development/photo-station-owner-app. Approximate precut paper width: 3.25 inches straight across, supplied by owner; finished front: 2.5 inches. One design per landscape 6 × 4 sheet at 300 pixels/inch. Both sizes are kept separate; the front is 750 pixels wide. Print at actual size and calibrate with a ruler and pressed sample before client use.

## Use

In the owner app, open an event, then Photo station → Magnet wrap template. Turn template printing on, enter company/couple/date text, select a source for each side and save. Existing events stay photo-only until explicitly enabled. Sources are blank, company, couple, event date text, gallery name, photo reference and custom text. Date text is explicitly entered so its format matches the event's design.

Open a pending photo in the print desk to load current event defaults. Expand Magnet wrap template to preview, override lines, rotate them, change colors and adjust text size/position. The dashed front fold guide never prints. Per-side position adjustments are in the owner settings. The preview is flat artwork, not a measured simulation of the crimp. Corner clearance is reserved for text; there are no printed cutting guides because actual clipped-corner dimensions are unconfirmed.

Preparing sheets atomically saves a snapshot of the resolved template with the print job. Retry/reopen uses that snapshot; Reload event template deliberately replaces it with current defaults. Original gallery photos remain untouched. Existing manual physical-print confirmation is unchanged. Brown Carolina is loaded from the theme's existing brown-carolina-sans.woff2 asset; template print preparation stops if the font cannot load.

## Deployment status

- Backed up and compared currently deployed gallery-api v19 and live theme v1.34 before edits. Later live API content matched the baseline aside from trailing whitespace. Deployed v20 by replacing only station.mjs and adding magnet-template.mjs to the fetched live bundle; all other live files were preserved.
- Applied only magnet_wrap_template, live migration version 20260920183216. Do not replay old migrations. The repository filename matches the deployed version.
- gallery_magnet_templates uses RLS with no browser-role grants. Service-role only, accessed through existing owner MFA or event-scoped print capability. Capture capabilities cannot fetch templates. Print snapshots use the existing atomic RPC with SECURITY INVOKER and service-role-only execution.
- Supabase security advisors: no warnings/errors, four expected INFO notices for service-only RLS tables without browser policies. https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Existing verify_jwt=false, server-only credentials and PHOTO_STATION_ENABLED=true retained. Uncredentialed template request returns 403.
- Theme v1.35 — Magnet Wrap Templates, ID 191751749920, duplicated from current live v1.34 (191743066400). Only the four station files changed. The existing Brown Carolina font is referenced; the CSP adds only that exact font asset. Theme remains unpublished: Shopify connector blocks publishing, so owner must publish through admin.
- Owner app source includes MagnetTemplate.jsx mounted in PhotoStation.jsx. Owner must deploy/release using the existing authenticated Shopify CLI workflow. Download the entire development branch, extract, and run Prepare-Owner-App.cmd from its root. Do not copy only the owner-app directory: shared template validation is in supabase/functions/gallery-api/magnet-template.mjs.

## Verification

Automated checks pass for template bounds and unsafe input, server/client parity, front dimensions, dynamic text sources, preview-only fold guides, sheet count, PGLite migration/grants, atomic snapshot and print transitions, browser upload retry/crop/print/confirmation, mounted owner save controls, and owner bundle build. Shopify component validation passed. Browser staging preview verified separately with demo data, not a real event or physical printer.

Before client use: publish the theme, release the app, save a template to a private test event, capture a photo, prepare a sheet, reload/retry to verify the snapshot, print and crimp one sample. Adjust paper size, text distance, per-side offsets and rotation to match the actual press. Actual iPad/Mac/DNP compatibility and physical text placement remain unverified.

## Rollback

Publish the previous v1.34 theme and release the previous owner app version. If the API needs rollback, redeploy the backed-up v19 bundle with verify_jwt=false. The new RPC accepts the old eight-argument call through its default ninth parameter, so the previous API remains compatible. Leave the additive table/column in place to preserve event settings and job snapshots. Do not drop tables or replay old migrations.
