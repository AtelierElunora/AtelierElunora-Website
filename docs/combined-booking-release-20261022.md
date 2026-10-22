# Combined booking release — 2026-10-22

## Release scope

Source commit: `a1c6b401b4dedcd3ad9d532020b1e5af6d79d514`.
Branch: `release/booking-contracts-crm-meta-20261022`.
Review: https://github.com/AtelierElunora/AtelierElunora-Website/pull/15.

Includes server-generated booking contracts, explicit customer signatures,
provider countersigning for the configurable full service agreement, PDF
downloads, the existing website inquiry/follow-up dashboard and browser-only
Meta Lead tracking. No automatic inquiry follow-up emails or social-message
imports are included. Existing booking email/payment workers are retained.

The production PostgreSQL and SQLite schema files, Azure database adapter,
HTTP server and Shopify app configuration are byte-identical to the prior
production source release. No database migration, access-scope change or
Azure plan change is required for this rollout.

## Validation completed

- 82 local tests passed, including contracts, signatures, PDFs, payment gates,
  exact prepayment/balance accounting, CRM capture and Meta event privacy/dedup.
- TypeScript checks and local production builds passed.
- GitHub Linux checks passed: workflow run `39767122429`.
- A clean Linux dependency installation and production build passed in Cloud
  Shell. PostgreSQL-adapter module initialization passed using placeholder
  connection metadata without connecting to a database. Cloud Shell identity
  environment variables were removed only for that smoke-test subprocess;
  production identity settings are unchanged.

## Shopify

The user approved the CLI deployment command and completed verification.
Released version: `booking-contracts-crm-meta-20261022`.
Version URL: https://dev.shopify.com/dashboard/231524061/apps/432367140865/versions/1177249808385.
Shopify CLI theme checking and extension validation passed.
The live product's Book now button was verified to open the booking iframe
with the selected collection, variant and exact storefront `parentOrigin`.

The user separately approved Shopify's custom pixel connection confirmation.
**Atelier Elunora inquiry leads**, custom pixel `241041696`, is connected.
Marketing and Analytics permission requirements remain enabled, and data-sale
opt-outs are respected. The code subscribes only to `elunora:inquiry_saved`;
native PageView, checkout and Purchase events are not copied.

## Azure runtime

Target: `app-elunora-bookings-nvo32m3ban2cc` in
`rg-elunora-production-central`.

Runtime archive: `/home/data/booking-combined-runtime-20261022-a1c6b401.tgz`.
Archive SHA-256:
`dc1ec630c7fde4f1a3db07122a3e8d39f6efbc00dfe979528fcea3bc98430001`.
Checksum file: `/home/data/booking-combined-runtime-20261022-a1c6b401.sha256`.
Startup script: `/home/data/booking-combined-start-20261022.sh`.

The archive contains explicit runtime directories and dependencies, not local
environment files, test databases, customer records or deployment credentials.
The startup script verifies the archive checksum before extracting into a
release-specific temporary directory and starting the existing HTTP server.

Status: deployed and healthy on 2026-10-22. Azure startup points to the new
script. `/health` returned HTTP 200 with build fingerprint
`8548af0194564e508c7af32582502f029a690b64d62ee2c85ed1d9eb7ff84935`.

Live verification:
- Owner navigation exposes Bookings, Contracts and Leads.
- The storefront opens the released widget and Contract & payment step.
- One synthetic inquiry saved successfully and appeared in the CRM.
- Meta Test Events received one browser Lead marked Processed with an
  anonymous `elunora-lead-` event identifier.
- The synthetic inquiry was closed with a verification note. No open test
  inquiry or follow-up remains. No email, contract, hold or payment was created.
- Full agreement settings are present, but the business profile is empty and
  the full-agreement option remains disabled. The owner must supply the legal
  business name, mailing address, phone, notices email and backup deletion
  timing before enabling it. Existing agreement settings were preserved.
- Customer signing, provider countersigning, PDF generation and payment gates
  passed automated checks; live payment and legal signatures were not executed.

The CRM captures website inquiries only. It does not automatically import Meta
forms/messages or send follow-up emails; reminders are displayed in Shopify.

## Rollback

Retain the previous archive and startup script. Restore the exact prior startup
configuration if the candidate is unhealthy:

```
az webapp config set -g rg-elunora-production-central \
  -n app-elunora-bookings-nvo32m3ban2cc \
  --startup-file 'sh /home/data/booking-leads-start-20261021-v3.sh'
az webapp restart -g rg-elunora-production-central \
  -n app-elunora-bookings-nvo32m3ban2cc
```

Prior healthy `/health` build fingerprint:
`d305bc1cd54ccf289056aec7f0f9927135fcba5c248f5e66aac43cd1659c463d`.
No data rollback or schema deletion is required. If needed, disconnect only
the inquiry custom pixel; keep the native Meta integration and CRM records.
