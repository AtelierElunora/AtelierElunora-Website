# Shopify owner app — photo station development

This is App Home UI extension source, NOT an installed Shopify app.
Target: admin.app.home.render, API 2026-07. Shopify hosts this UI after registration, build, release and installation. Supabase hosts the gallery API.

## Implemented in source
- Owner email-code verification, followed by server-checked gallery_admins membership.
- All event galleries; create an event; enable/pause guest access.
- Photo previews using owner-authorized one-minute links; original download links; hide/show.
- Invitation add/revoke/restore.
- Storage usage for private buckets.
- Payment summaries and saved request totals.
- Event-scoped tablet capture links, approval uploads, and print queue with zoom/crop controls.

The initial connection deliberately uses existing Supabase owner authorization. Shopify staff membership alone grants no gallery rights. Tokens remain in component memory; expired sessions require another sign-in. No Shopify single sign-on has been implemented yet.

## Registration and installation requirements
The connected Shopify Admin tools do not register developer apps or deploy App Home extensions. The registered app client ID and extension UID are in the supplied configuration. Shopify confirmed the app is not installed on this store.

Use the existing Atelier Elunora Galleries app for v0j63n-ms.myshopify.com. Do not register a second app or replace its client ID/extension UID. Run the root Prepare-Owner-App.cmd on Windows to sign in, validate, build, and upload an unreleased version. Do not paste API secrets into chat. The App Home target, network capability and actual extension origin must be validated in Shopify's development preview before installation.

Official guide: https://shopify.dev/docs/apps/build/app-home/app-home-ui-extensions

## Remaining before replacing the owner portal
- Authenticate to the existing registered app, preview, build, release and install its first version.
- Verify the real extension network origin, owner login and guest rejection.
- Port the upload UI (the upload API is already ported), editing existing account grants and request status controls.
- Port cropped order exports to an Edge-compatible image processor; the new owner/orders route explicitly returns 501 after checking owner access.
- Add Shopify identity binding only with verified app-specific ID tokens and an explicit owner mapping; never trust an email/shop query parameter.
- Run real-event acceptance tests and verify file download/preview behavior inside Shopify.

Do not retire Netlify until these are complete. The existing owner portal and photo-export flow remain available there.

## Validation
The source passed local TypeScript checkJs validation against the installed @shopify/ui-extensions 2026.7.0 admin.app.home.render target types, with its official target declaration imported by shopify.d.ts. Dependencies are pinned and locked.

The standalone Polaris skill validator could not finish because its virtual type environment could not resolve preact/jsx-runtime, even with the dependency installed. Its reported source errors were fixed. This tooling limitation is not an installation test; Shopify CLI build, network capability validation and in-admin acceptance remain required.
