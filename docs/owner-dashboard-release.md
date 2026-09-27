# Atelier Elunora Owner Studio — review build

The new Owner Studio is a standalone, branded website interface for the existing gallery backend. It runs as a full-page Shopify theme template, outside the embedded Shopify owner app. The previous owner app remains available during review and rollout.

## Included

- Overview with event collections, preparation counts, payment reviews and storage usage.
- Create events; open or pause guest access; move galleries to Trash and restore them.
- Batch owner photo uploads, previews and original downloads, visibility controls and incomplete-upload recovery.
- Event QR generation, guest upload settings, moderation and approved-photo print queueing.
- Guest invitations, expiry and access management.
- Paid order review and production queueing, payment delivery visibility, station links and magnet template controls.
- Activity history, storage totals, owner authentication and authenticator verification.
- The source package also includes the Mac and Windows print helpers for the planned DS820A 8×12 workflow.

Payments, refunds and fulfillment remain managed through Shopify. Provider billing remains with the hosting provider. Dashboard order counts cover the latest 200 selections and activity covers the latest 100 entries; these are operational views, not complete accounting reports.

## Review locally

Run `npm ci` at the source root and install the owner app dependencies under `shopify-owner-app`. Build with `npm run build:dashboard`, then start `npm run demo:dashboard`. Open `http://127.0.0.1:4174/?demo=1`.

The preview uses sample data only. It never contacts the live backend, uploads files, sends invitations, charges customers or prints. Changes reset on reload. The sample QR demonstrates the visual output and links back to the demo; it is not a live guest upload link.

## Deploy after review

1. Follow `docs/unified-experience-release.md` for backend migrations, guest pages, payment integration and required environment settings. This dashboard does not replace those prerequisites.
2. Include `theme/templates/page.owner-studio.liquid`, `theme/assets/atelier-owner-studio.js`, the matching CSS and three demo JPEG assets in the reviewed theme.
3. Create a Shopify page with handle `owner-studio` and assign the `page.owner-studio` template. The intended URL is `/pages/owner-studio` on the store domain. It is marked noindex and renders independently of theme layout.
4. Verify the deployed domain is allowed by the existing API and Turnstile configuration. Test real owner email sign-in and authenticator verification on a staging deployment. Session tokens remain in memory; refreshing requires sign-in again.
5. Test event creation, uploads, guest QR scanning, approval, paid order production and access revocation end to end. Verify a non-owner cannot enter owner workflows.
6. Follow the Mac and Windows helper guides and perform physical DS820A acceptance tests before an event.

## Validation and release limits

Dashboard tests cover authorization transport, refresh deduplication, expired-session and MFA handling, stale-session rejection, native controls, navigation, event creation, QR generation, template controls, paid production and demo isolation. Existing owner workflow regression checks and owner extension bundling passed. Shopify Liquid validation passed. Desktop and phone-sized browser checks confirmed layout and navigation; the mobile page had no horizontal overflow.

This is a local review build. Live authentication, deployed storage/security integration, real payment delivery and physical printing have not been tested here. No main merge, production publication or Ninemags cancellation was performed.

The build covers the shared event gallery and square-magnet workflow. It is not full Ninemags feature parity. Other product shapes, video/GIF, Dropbox sync, offline synchronization, automatic pickup notifications, team-role administration and native signed installers are not included. Read the unified release guide for upload format, quota, retention and uncertain-print recovery limitations. Retire Ninemags only after your actual event and online-order workflows pass acceptance testing.

## Event print desk
Each event now includes a Print desk tab. Choose Connect event print desk to load the existing queue, crop editor, paper format and sheet controls inside the dashboard. Closing the desk revokes that link. Leaving the tab stops its automatic-sheet polling; return and reconnect to continue. Prepared jobs remain available for reconciliation. Embedded desks do not inherit or overwrite standalone station credentials. The local preview serves only a sample print queue. Physical printer operation still requires the printer-connected computer, and the Mac/Windows helper runs separately. Validate Shopify framing headers and browser print dialogs on the deployed domain before event use.
