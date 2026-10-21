# Booth photo invitations — build 5 candidate

Status: implemented and tested locally; not deployed. No SMS provider is connected.

After capture, a guest can optionally enter an email or international phone number and consent to one photo invitation. Photo approval uses the existing capture request ID and print queue. An invitation failure retains the photo and request for retry. Once photo receipt is confirmed, Finish at booth can clear the shared device without claiming successful delivery. Contact information is cleared between guests.

The private link opens the existing client-gallery website. Guests can sign in with an email code or create a password using the existing verified-email flow. They explicitly claim the photo. An Open in the Elunora app link uses the elunora custom URL scheme; no Associated Domains entitlement is required. Guests may also paste the invitation into Galleries → My booth photos. Website and app support downloading/saving the original. No App Store listing is assumed.

Email invitations must be claimed using the confirmed email that received the link. SMS invitations are bearer links and can be claimed by the first authenticated, verified account possessing the link; phone-number authentication is not added. Never share invitation links. Once claimed, only that account has photo access. Access lasts 14 days after capture and is denied if the invitation is revoked, the photo hidden/deleted, or the event paused/deleted. Existing event invitations and event-wide RLS policies remain unchanged.

## Deployment sequence

1. Apply `20261002122316_booth_photo_invitations.sql` to the existing Supabase project using the normal migration process. The table and RPCs are service-only; it adds no customer table policies or changes to existing tables.
2. Deploy gallery-api including booth-photos.mjs, keeping custom authentication and current gateway settings. Leave BOOTH_PHOTO_INVITES_ENABLED unset/false initially. Claim/list routes still require the existing session and MFA checks.
3. Publish the changed client-gallery section and its ten locale strings to the live Shopify theme through the existing theme workflow. Do not overwrite other live theme edits.
4. Install native 0.3.0 build 5, reconnect the booth station, and verify capture without invitations still works.
5. Confirm the existing Resend sender and set BOOTH_PHOTO_INVITES_ENABLED=true to expose email invitations. Reconnect the booth to refresh advertised channels. Test with a consenting owner-controlled address: capture, receive, wrong-account rejection, correct-account claim, save original, sign-out, expiry/revocation, interrupted submit and no duplicate print job. Automated tests use mocks and send no live messages.
6. Enable SMS only after completing provider setup and a consenting test. Existing email-only deployment advertises no SMS option when credentials are absent.

## SMS setup

Prepared adapter: Twilio Programmable Messaging. Create an account, provision an appropriate sender, create a Messaging Service, and complete registration/verification for the countries and sender type used (including applicable US A2P registration). Twilio charges are separate. Set the following only through Supabase secrets; never add keys to Git, app configuration, Shopify assets, or chat:

- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_MESSAGING_SERVICE_SID

See Twilio's [Message resource](https://www.twilio.com/docs/messaging/api/message-resource) and [US A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc). No provider account, number, paid plan, or live text was created by this change.

## Delivery and operation

Provider acceptance is not proof of delivery. Email uses a stable Resend idempotency key and immutable payload, a 60-second retry cooldown, at most three attempts, and no retry after 23 hours. SMS network/server errors and expired send leases require review instead of automatic resend because provider idempotency is not guaranteed. Recipient and station limits cap new invitations at 10/day and 100/hour respectively. Operators can inspect/revoke service-only rows using authorized backend administration; owner dashboard resend/review controls and delivery webhook tracking are not included.

Invitation contacts and temporary delivery tokens are private service-only data. The token is a random 256-bit secret in the URL fragment and never stored in browser storage; the temporary plaintext is removed on claim. Rows persist until the linked photo/station/account is deleted; schedule a retention cleanup separately if desired. Only token hashes and authenticated account IDs select claims. Blob URLs are revoked on website sign-out, and the API rechecks grant/session after storage download.

Rollback: disable BOOTH_PHOTO_INVITES_ENABLED and reconnect stations. Existing captures and checkouts keep using their current paths. Keep the additive migration for already issued photo grants unless intentionally revoking those grants. Revert website/app independently if needed.

## Validation

All 15 signed iPhone 17 Simulator XCTest cases pass, including consent, strict invitation links, legacy pending capture restoration, and preserved contact/receipt/request ID. npm test passes database/backend/browser feature tests and existing authentication, invitation, checkout, station and crop regressions. npm run test:recovered passes the four bundle rebuild checks and dashboard/helper/print simulations. Shopify validation passes both changed theme files using the validator’s bundled documentation fallback; no live Shopify preview or real provider delivery was tested.
