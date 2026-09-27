# Atelier Elunora — production source

Main was reconciled with the running Shopify theme and Supabase backend on **September 27, 2026**. Start with [production reconciliation](docs/PRODUCTION-RECONCILIATION.md) for provenance, validation, and remaining recovery gaps.

| Folder | Contents |
| --- | --- |
| `theme/` | Published storefront, custom owner studio, guest gallery, upload flows, browser capture/print station, and brand PNG assets |
| `supabase/functions/` | Exact retrieved source of gallery API v53, payment webhook v9, and retired diagnostic v5 |
| `supabase/migrations/` | All 30 applied migration SQL records |
| `ios/ElunoraCapture/` | Branded iPad-camera baseline from `caf516d`; later Canon/countdown development remains on its development branch |
| `docs/production-source-manifest.json` | Source inventory, deployment versions, file hashes, and licensed-asset exclusions |
| `docs/production-database-schema.json` | Current database definitions for drift review; no customer rows |
| `shopify-owner-app/`, `station/` | Historical authoring sources, not the source of the newer recovered production bundles |

## Check the snapshot

```sh
npm ci
npm test
```

The old station build cannot overwrite the recovered production asset. For historical investigation only, `npm run build:station:legacy` writes into `dist/`.

This is **not yet a complete reproducible recovery package**: the separate desktop print helper and the newer owner-studio/station authoring projects are missing. Licensed fonts, secrets, signing, store-level settings, and customer storage are also separate. See the reconciliation document before deploying or restoring anything. This source-sync operation did not change production.

Older setup and design documents describe historical stages and are superseded by the reconciliation document wherever they conflict. No license is granted for third-party theme code, fonts, or dependencies.
