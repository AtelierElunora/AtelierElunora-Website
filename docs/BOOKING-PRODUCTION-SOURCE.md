# Booking app production source — November 1, 2026

`booking-app/` contains the source for the Azure-hosted Shopify booking service. The production host is `app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net`. It uses the existing Azure PostgreSQL booking schema; Shopify provides the admin embedding and checkout/payment integration.

## Source baseline

This synchronization overlays the maintained `booking-photo-borders-20261029` release onto the existing repository booking directory. The release source incorporates the deployed checkout, save-the-date designer, CRM, inquiry notifications, referral tracking, Google Ads attribution and photo-border changes made after the previous October 20 import. Existing repository configuration examples are retained.

A fresh read of the production `/health` endpoint returned HTTP 200 and `X-Booking-Build: 61d2f5c8dd9ee491e9c2f11e4d4ea7474510c98c84493d4c69399f621f889240`. This exactly matched SHA256 of the saved release `build/server/index.js`. `booking-app/PRODUCTION-SOURCE.json` records this comparison and hashes of the imported source files. Clean install, mocked tests, typecheck and build results are recorded there after verification. A successful fresh build is not a claim that build artifacts are reproducible byte-for-byte on different machines.

No production redeployment or database migration is part of this source sync. GitHub Actions runs booking source checks only. Credentials, environment values, customer records, private customer links, deployment archives, dependencies, compiled bundles and licensed font binaries are excluded. The font preparation script fetches the existing public brand fonts and verifies their recorded SHA256 before use.

## Validation

Fresh Node 24.21.0 verification passed: locked dependency installation, five migrations against disposable SQLite, 181 mocked tests, five additional combined-checkout integration tests, TypeScript checking and a production build. The dependency installer reported 44 existing advisories (13 moderate and 31 high); dependency upgrades are separate from preserving this deployed source baseline. No live customer or production database operations were used.

## Scope

The synchronized component is the booking app. Other root documentation remains historical for its listed components. This update does not certify the currentness of `theme/`, the gallery API, native iOS app, print helper or owner dashboard. Historical storefront recovery files inside the booking release are reference material, not a snapshot of the currently published storefront.

For local verification commands and deployment boundaries, see `booking-app/README.md`. For future releases, commit reviewed source alongside the deployment so GitHub remains the source of record; keep all live credentials in the host configuration.
