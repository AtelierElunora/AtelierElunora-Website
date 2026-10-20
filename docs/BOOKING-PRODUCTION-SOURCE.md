# Booking app production source — October 20, 2026

The website booking service is now represented by `booking-app/`. This directory is independent of the historical owner dashboard in `shopify-owner-app/` and the native app in `ios/`.

The booking host is Azure App Service `app-elunora-bookings-nvo32m3ban2cc` and uses PostgreSQL `elunora_production`, schema `elunora_booking`. Shopify embeds the app and supplies checkout/payment integration. Production mail, Google Calendar and gallery connections remain in the Azure host configuration.

The imported runtime source, lockfile, migrations, theme extension, tests and brand logo came from the maintained local booking project. Ignore rules, this documentation and an isolated CI workflow were added. The local server bundle and saved archive both match the latest deployment checksum record; no maintained app source had a later modification timestamp than that compiled bundle. These checks do not replace a fresh live Azure comparison or clean reproducible-build verification.

The source import includes no credentials, environment values, customer records, private links, screenshots, compiled bundles or deployed configuration dumps. It does not deploy anything. SQL scripts must be reviewed before use against production. No automatic deployment is configured.

24 focused checks passed during the import. A clean install, full mocked test suite, typecheck and production build are configured as the `Booking source checks` pull-request workflow; their run status must be checked before merging. The local workspace was read-only, so no clean install, generated-client refresh or new production rebuild was attempted locally.

Other root documentation describes an October 1 reconciliation. It remains historical for its listed components and should not be interpreted as a current inventory of the Azure gallery API, iOS Build 45 or the live storefront. Updating those deployments' source is separate work. This import updates only the booking app source.
