# Atelier Elunora Bookings

## Contract feature in source

New code generates a personalized contract for review and typed-name electronic signing before new online invoices. Owners can prepare contracts for older unsigned bookings. See [contract behavior and release status](../docs/booking-contracts.md). This feature still needs Azure deployment; the historical deployment manifest below describes the earlier production baseline.

Source for the Shopify booking app used by atelierelunora.com. The running server is Azure App Service `app-elunora-bookings-nvo32m3ban2cc`, in `rg-elunora-production-central`. It uses the existing PostgreSQL database `elunora_production`, isolated to schema `elunora_booking`.

This app is separate from the historical `shopify-owner-app/` dashboard. The native iPhone app and gallery Function App are separate deployments. Adding this folder does not redeploy any service or update those other source snapshots.

## Install and validate

Use Node.js 22.12 or later (the focused checks for this import used Node 24.21).

```sh
cd booking-app
npm ci
npm run db:generate
node --test azure/booking-config.test.mjs azure/schema.test.mjs payments/ledger.test.mjs tests/booking-widget.test.mjs tests/rules.test.mjs tests/tax.test.mjs
npm run typecheck
npm run build
```

The six listed test files contain 24 checks. They passed during this source import. Typecheck and a fresh production rebuild were not rerun during the import because the local workspace was read-only; the GitHub workflow runs those checks in a clean checkout.

For all existing mocked integration tests against disposable local SQLite:

```sh
npx prisma migrate deploy
node --test azure/booking-config.test.mjs azure/schema.test.mjs payments/ledger.test.mjs tests/*.test.mjs
```

Do not set `ELUNORA_DATABASE_BACKEND` when running the SQLite server integration tests; those tests explicitly refuse another configured backend. Use `NODE_ENV=test` and no production credentials. The Azure schema test uses in-memory PGlite.

## Run and deploy

Copy `.env.example` to `.env` for local development and supply development Shopify credentials outside Git. Use `npm run dev` for Shopify CLI development. `npm run build` generates both database clients and compiles the React Router app. `npm start` runs `azure/server.mjs` using `PORT` and `HOST`.

The existing production host keeps Shopify, email, Google Calendar, gallery credentials and runtime feature settings in Azure. PostgreSQL access uses managed identity. The runtime does not apply production migrations at startup. SQL in `azure/` is a schema reference and must be reviewed against the existing database before applying; never rerun foundation SQL blindly.

Shopify registration and theme-extension configuration are included. App registration/deployment and Azure server deployment are separate operations. Existing storefront theme changes outside the app extension are not part of this folder. There is no automatic deployment workflow in this import.

## Provenance

See [production source record](PRODUCTION-SOURCE.json) and [repository scope](../docs/BOOKING-PRODUCTION-SOURCE.md). Core source files are copied byte-for-byte from the maintained local booking project; repository documentation, ignore rules and CI are added for this import.

The local compiled server and saved deployment archive match the latest stored deployment checksum. This is evidence from existing deployment records, not a fresh Azure live-state verification or a proof that a clean rebuild will be byte-identical. Archive binaries, environment files, credentials, customer records, screenshots and private operational evidence are excluded.
