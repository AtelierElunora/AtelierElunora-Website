# Website inquiries and follow-up

Deployed to the existing Azure booking service on October 21, 2026.

The booking flow now starts with a contact step. Visitors explicitly consent to
an event-specific follow-up and click **Save my details & continue**. That saves
an inquiry before they choose a date or complete the contract/payment flow.
Their event details are updated when they proceed from details to review.
No keystrokes or unsubmitted forms are collected. Anonymous visitors cannot be
contacted. Inquiries are not bookings, contracts, payments or capacity holds.

Owners open **Leads** in the existing authenticated booking app. New inquiries
are due for follow-up after 24 hours. Use the email link to contact the customer,
then save Contacted, notes and the next follow-up date. Clear the date to stop a
reminder or choose Closed / do not follow up. Confirmed linked bookings are
excluded from the due list. Unpaid booking attempts remain eligible for follow-up.
The page shows the latest 500 inquiries. It does not import social messages or
notify the owner outside the dashboard. No automated customer emails are added.

The existing email worker, calendar integration and payment flows are unchanged.
Owners must check Leads regularly; this is not an unattended email campaign.

## Production release

The release was isolated from the previous live production commit
`92745d2f9be0bcbe63628d29266b4325a6962416` on
`release/booking-leads-20261021`. Unrelated source-only contract changes were
excluded. Only `BookingLead` and its indexes were added to the existing
`elunora_booking` schema. The existing runtime role received DML access to this
new table; no foundation migrations or existing-record changes were applied.

The production contact form display and consent rejection were checked without saving a
synthetic inquiry or sending customer emails. Owner routes require Shopify
embedded-app authentication. The runtime role's SELECT, INSERT and UPDATE privileges on BookingLead were
verified with a read-only query. The live form shows Contact, Date, Details &
extras and Payment; the live health endpoint returned HTTP 200 with the server
fingerprint below. Full authenticated owner interaction was not exercised in
production. Source checks passed: 76 tests for the feature branch,
56 tests for the isolated release, type checking and production builds.

The compatible Linux runtime is packaged at
`/home/data/booking-leads-runtime-20261021-v3.tgz` with SHA-256
`d6fec06a7e488fbac379b31195b2ea2e5d28b57ffefb51dd28e1bd295a678e03`.
The startup command is `sh /home/data/booking-leads-start-20261021-v3.sh`.
It extracts the complete package into container-local temporary storage, then
runs `node azure/server.mjs`. Container startup may take roughly two minutes.
The container startup allowance is 600 seconds; no plan upgrade was made.

The release source is `91438f3a61036a4a64e7792a05a52524eee798a2`.
The server build fingerprint is
`d305bc1cd54ccf289056aec7f0f9927135fcba5c248f5e66aac43cd1659c463d`.
Prisma clients must be generated normally. Do not use `--no-engine` or
`PRISMA_GENERATE_NO_ENGINE` with this PostgreSQL adapter configuration.
The compiled release passed an adapter initialization smoke test before upload.

Native source deployment first installed v1 successfully. A later incremental
OneDeploy failed and removed the previous compressed dependency/manifest
artifacts, so the final runtime uses the self-contained package above.
`SCM_DO_BUILD_DURING_DEPLOYMENT=false`; the future source build command is
`npm ci --no-audit --no-fund && npm run build`. Deploy complete, tested runtime
packages with dependencies rather than sending a build-only ZIP to Oryx.

## Future deployment

1. Back up and compare the current Azure source/schema with this branch. The
   repository contains other source-only changes, including contract work. A
   deployment of the full branch would include those; review them first.
2. Apply only `booking-app/azure/booking-leads.sql` to the existing PostgreSQL
   database after review. It adds one table and indexes in `elunora_booking`;
   it must not create a public-schema table or rerun the foundation scripts.
3. Generate both Prisma clients, build, then deploy the Azure booking service.
   No Shopify theme changes or new CRM service are required for its existing
   embedded booking page. No migration is run automatically in production.
4. Check contact capture, owner-only access, retry behavior and conversion to
   a booking in a staging environment, then verify production after release.
5. Verify the existing privacy notice describes event inquiry storage and
   follow-up. Keep normal backup/retention processes and apply appropriate
   abuse controls at the hosting ingress. The form includes origin checking,
   bounded fields, explicit consent and a honeypot; these are not bot verification.

For a code rollback, restore the previous booking build together with compatible
Linux dependencies. A build-only copy will not restore missing dependency
artifacts. The previous source/build archive is
`/home/data/booking-before-leads-20261021.tgz` (SHA-256
`feb5536647776521e922e888a15f0695828890817988014830202a9ef4c5cbac`). Retain the additive
lead table until inquiries are exported/reconciled rather than dropping records.

## Validation

Run `npm ci`, `npm run db:generate`, `npx prisma migrate deploy` against disposable
local SQLite, then `NODE_ENV=test node --test azure/booking-config.test.mjs
azure/schema.test.mjs payments/ledger.test.mjs tests/*.test.mjs`, `npm run typecheck`
and `npm run build`. Never run tests against production or set the Azure backend
for the SQLite integration tests.
