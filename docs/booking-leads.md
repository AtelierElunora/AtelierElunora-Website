# Website inquiries and follow-up

Implemented in source; not deployed by this change.

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

## Deployment

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

For a code rollback, restore the previous booking build. Retain the additive
lead table until inquiries are exported/reconciled rather than dropping records.

## Validation

Run `npm ci`, `npm run db:generate`, `npx prisma migrate deploy` against disposable
local SQLite, then `NODE_ENV=test node --test azure/booking-config.test.mjs
azure/schema.test.mjs payments/ledger.test.mjs tests/*.test.mjs`, `npm run typecheck`
and `npm run build`. Never run tests against production or set the Azure backend
for the SQLite integration tests.
