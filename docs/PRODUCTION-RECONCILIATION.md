> Superseded for current versions by [October 1 reconciliation](PRODUCTION-RECONCILIATION-2026-10-01.md). This document retains the September 27 recovery history.

# Production source reconciliation — September 27, 2026

**Follow-up:** The owner-dashboard and print-helper archives were subsequently supplied and verified. [Recovered authoring sources](RECOVERED-AUTHORING-SOURCES.md) supersedes the missing-source/build-pipeline notes below; the deployed theme/backend snapshot remains unchanged.

This update copies running code into GitHub. It does not deploy a theme, change a database, release an app, alter product settings, or trigger a print job.

## Authoritative sources

| Component | Captured source |
| --- | --- |
| Storefront, guest gallery, owner studio, guest uploads, browser station | Published Shopify theme `191906349344`, **Atelier Elunora — Special Event Quotes**, role MAIN |
| Gallery backend | Supabase `gallery-api` version **53**, JWT gateway verification disabled; authorization is handled in the function |
| Shopify payment webhook | `shopify-gallery-payments` version **9**, JWT gateway verification disabled; webhook HMAC authentication remains in its handler |
| Old station diagnostic | `gallery-api-photo-station-check` version **5**, JWT gateway verification enabled; its only response is 404 |
| Database migration history | All **30** applied migration records and original SQL statements, read from `supabase_migrations.schema_migrations` |
| Current gallery database definitions | Read-only schema snapshot: 25 gallery tables, 40 gallery/payment functions, columns, constraints, indexes, policies, and triggers |
| Native iPad source | Branded iPad-camera/AE-monogram baseline from commit `caf516d`, before experimental Canon and countdown changes |

`production-source-manifest.json` records upstream versions and hashes plus SHA-256 hashes of the actual exported files. `production-database-schema.json` captures current definitions, including definitions that might have been changed outside migration history. It contains schema, not customer rows, and is an audit reference rather than an executable database restore.

The theme inventory has **535** assets: **525 text files**, **4 brand PNG images**, and **6 licensed font binaries**. Existing text files whose hashes already matched production were retained; changed/new text bodies were fetched from Shopify. The four PNGs were recovered and byte-verified. Font binaries remain excluded from this public repository, with their names and hashes recorded in the manifest. Restore them privately from the existing theme or licensed originals.

Shopify's exported JSON can contain generated comments and formatting, and its CDN transforms JS/CSS. Consequently an upstream `checksumMd5` need not equal a returned text body's hash. The manifest retains both upstream metadata and independently computed exported-file hashes. Repeated reads of the owner bundle and theme settings returned the same bodies. The public owner page and its transformed assets were also inspected.

## What changed relative to main

The previous main branch represented September 19–21 code. It did not contain the live custom owner studio, production guest-upload workflows, post-purchase upload handling, current automatic-printing backend, or 15 later migrations. The frontend bundles and backend files in this update are recovered from production, not rebuilt from the older development branches.

The active custom dashboard is `theme/templates/page.owner-studio.liquid` with `theme/assets/atelier-owner-studio.js` and `.css`. The old `shopify-owner-app/` extension is retained as historical source; its installed release was not independently verified. Do not treat it as the source of the live custom owner studio.

The current browser station asset is recovered under `theme/assets/atelier-station.js`. The old `station/atelier-station.mjs` and associated build pipeline predate production. The build script now refuses to overwrite the recovered asset; `npm run build:station:legacy` writes a historical comparison build into ignored `dist/` only.

## Remaining source and recovery gaps

- **Mac/Windows print helper:** the deployed dashboard and API reference a separately installed helper. Its current source/package was not available in the repository, accessible workspaces, or file searches. The helper running on a device cannot be reconstructed faithfully from the server endpoints.
- **Original owner-studio/station authoring projects:** deployed JavaScript/CSS are preserved, but the newer original JSX/modules, dependency lockfiles, and build configuration were not found. Do not claim these bundles are reproducible from the historical source folders.
- **Native device version:** the selected baseline corresponds to the branded iPad-camera stage the owner reported working. This session cannot inspect the installed iPad build SHA. Later Canon controls and capture countdown remain on `development/ipad-camera-prototype`, outside this production reconciliation.
- **Private assets/settings:** font binaries, credentials, native signing, SMTP/CAPTCHA configuration, environment values, storage objects, customer data, and store-level products/pages/app configuration are not a public-source backup. Referenced demo JPEGs absent from the live theme inventory were not invented.
- **Database replay:** the actual applied migration statements are preserved. A full restore against a clean Supabase project was not performed; current-schema JSON is supplied to help identify drift.

## Validation and its limits

`npm test` runs production snapshot integrity, exact function file-set/import checks, JS/TS syntax parsing, theme JSON-with-comments parsing, and the applicable activity-log, template, station, and native-request boundary regressions. These checks are local and do not send guest photos, orders, or print jobs.

The recovered owner studio also rendered its sign-in screen in a local DOM with network disabled. Historical station SQL and letter-batching SQL tests passed against their isolated local fixtures; they do not validate every later migration.

The old gallery-download tests fail against production because they reference `guest-original.mjs` and UI assumptions no longer present in the deployed implementation. The old browser station test likewise expects an earlier UI. These tests remain available for historical review (`test:gallery`, historical files, and `test:legacy`); they are not presented as current end-to-end coverage. `test:legacy` intentionally hits the stale-build protection until its build assumptions are updated. Existing production formatting, including CRLF/trailing whitespace, is preserved for source fidelity.

Future intentional source changes should update provenance and the manifest after review. Passing a hash check establishes fidelity to this snapshot, not event readiness or a physical camera/printer test.
