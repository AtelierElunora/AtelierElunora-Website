# Atelier Elunora booking app

Production booking source synchronized on November 1, 2026 from the maintained October 29 release. This app runs on Azure App Service and is embedded in Shopify. It owns wedding availability, bookings, agreements, service prepayments and balances, combined keepsake checkout, inquiries and follow-ups, Google Calendar integration, and customer booking access.

## Production provenance

The saved release server bundle SHA256 exactly matched the live Azure `/health` response's `X-Booking-Build` header during this synchronization:

```
61d2f5c8dd9ee491e9c2f11e4d4ea7474510c98c84493d4c69399f621f889240
```

`PRODUCTION-SOURCE.json` records the source file checksums, deployment comparison and fresh validation results. The checksum above identifies the saved deployed bundle; a new local build is checked for success, without claiming byte-for-byte reproducibility across machines.

This update includes the newer combined checkout and tiered magnet pricing, save-the-date magnet/card designer, lettering and photo borders, inquiry CRM and automatic follow-ups, owner inquiry notifications, referral sources and Google Ads attribution. Runtime source is preserved from the maintained production release; one GraphQL reference file has whitespace-only cleanup and integration tests use local storefront fixtures, as recorded in the manifest.

## Local verification

Use Node 24 and keep real credentials out of this checkout. The CI workflow supplies placeholder Shopify configuration and uses a disposable SQLite database. For local verification, set `NODE_ENV=test`, `SHOPIFY_API_KEY=ci-placeholder`, `SHOPIFY_API_SECRET=ci-placeholder-not-a-real-secret`, `SHOPIFY_APP_URL=https://example.invalid`, and `SCOPES=write_draft_orders,read_orders`. Leave `ELUNORA_DATABASE_BACKEND` unset. Then run:

```sh
npm ci --include=dev
npm run db:generate
npm run fonts:prepare
touch prisma/dev.sqlite
npx prisma migrate deploy
node --test --test-concurrency=1 azure/booking-config.test.mjs azure/schema.test.mjs payments/ledger.test.mjs tests/*.test.mjs
node --test tests/bulk-checkout.integration.mjs
npm run typecheck
npm run build
```

These tests mock checkout, mail and external services. Do not run the SQLite test commands with production configuration. The build downloads the existing brand fonts and checks their SHA256 against `azure/brand-fonts.json`; licensed font binaries are excluded from Git.

## Deployment boundaries

The `Booking source checks` GitHub Actions workflow verifies source and does not deploy. Synchronizing this repository does not restart Azure, change live settings, apply production migrations, send customer emails, or publish a Shopify theme/app version. Existing production secrets, managed identity, mail and Google credentials stay in Azure.

The source includes migration files and historical storefront recovery references, but this update does not reconcile the current storefront theme, gallery API, owner dashboard or native iOS app. See [production source notes](../docs/BOOKING-PRODUCTION-SOURCE.md). Generated clients, compiled builds, dependencies, local databases, customer records and credentials are excluded.
