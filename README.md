# Atelier Elunora — production source

Main source is reconciled with the running Shopify theme and Supabase backend on **October 1, 2026**. Start with [current reconciliation](docs/PRODUCTION-RECONCILIATION-2026-10-01.md), [production reconciliation](docs/PRODUCTION-RECONCILIATION.md) and [recovered source verification](docs/RECOVERED-AUTHORING-SOURCES.md) for provenance and validation.

| Folder | Contents |
| --- | --- |
| `theme/` | Published storefront, custom owner studio, guest gallery, upload flows, browser capture/print station, and brand PNG assets |
| `supabase/functions/` | Exact retrieved source of gallery API v58, payment webhook v10, and retired diagnostic v5 |
| `supabase/migrations/` | All 31 applied migration SQL records |
| `ios/ElunoraCustomer/` | Current combined customer/owner app 0.2.2 build 4, with its Xcode project and native tests |
| `shopify/content/` | All 16 published Shopify page bodies and template assignments, plus integration-access limitations |
| `ios/ElunoraCapture/` | Branded iPad-camera baseline from `caf516d`; later Canon/countdown development remains on its development branch |
| `docs/production-source-manifest.json` | Source inventory, deployment versions, file hashes, and licensed-asset exclusions |
| `docs/production-database-schema.json` | Current database definitions for drift review; no customer rows |
| `shopify-owner-app/dashboard/`, `station/`, `experience/` | Recovered editable source that rebuilds the corresponding live bundles |
| `print-helper/` | Supplied desktop helper v4, including Mac and Windows launchers |

## Check the snapshot

```sh
npm ci
npm ci --prefix shopify-owner-app
npm ci --prefix print-helper
npm test
npm run test:recovered
```

Dashboard, station, and guest-experience builds now use the recovered source. Verification compares builds in memory; matching builds preserve the exact captured production bytes.

The previously missing authoring source and desktop helper have now been recovered and compared. Licensed fonts, secrets, signing, store-level settings, and customer storage remain separate; physical device tests and full database restore validation are still outside this source recovery. See the reconciliation document before deploying or restoring anything. This source-sync operation did not change production.

Older setup and design documents describe historical stages and are superseded by the reconciliation document wherever they conflict. No license is granted for third-party theme code, fonts, or dependencies.

For the current phone app, open `ios/ElunoraCustomer/ElunoraCustomer.xcodeproj` and select your signing team. Keep the installed bundle identifier to preserve photos. Licensed fonts remain private; restore them into BrandedFonts from your licensed originals for identical typography. Backend source in `supabase/functions/` is authoritative; do not deploy older backend copies from app archives. Source reconciliation does not run a live deployment.
