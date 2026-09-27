# Branded gallery invitations

## Preview release, September 27, 2026

Implemented on `feature/gallery-invitation-emails`, created from current `main` (`617e2def6fbbe2addc090c72cc5bce8cc8e624a6`). It also includes the password-sign-in change already being tested so the combined preview retains that flow. Neither change is merged into main yet.

- Supabase migration: `20260927121048_gallery_invitation_emails.sql` (version assigned by the migration service, synchronized to the local filename).
- `gallery-api`: deployed version 55, after verifying version 54 exactly matched the password-sign-in branch.
- Shopify preview theme: `191953797408`, UNPUBLISHED. Only `assets/atelier-owner-studio.js` changed for this addition; password gallery UI was already present.
- Published Shopify theme remains `191906349344`. Existing clients that save access without `sendEmail:true` retain save-only behavior. No existing invitations are backfilled or emailed.

## Owner experience

In Events → Guest access, enter the recipient's email and future expiry, then choose **Save access and send invitation**. Sending is selected by default. Uncheck **Email the branded invitation automatically** to save access without sending. A gallery must be open before sending; paused galleries can still save access only.

Each invitation shows sending status with **Send**, **Resend**, or **Retry invitation email** as appropriate. Manual link/message copying remains available. Provider acceptance is reported as accepted for sending, not delivered to an inbox. No delivery webhooks or background retry scheduler are added.

The HTML/plain-text email uses the live upload-later email's logo, olive/cream colors, email-safe typography, sender and reply-to (`support@atelierelunora.com`). It includes the event name, gallery button, invited email, first-visit password/code instructions, and access expiry in UTC. Names and recipient values are escaped. The button uses the canonical production gallery URL with only the event ID; no preview-theme parameter, credentials, bearer token, or recipient email is placed in the link. During preview, recipients outside the preview browser still see the currently published gallery sign-in flow, which supports email codes until password UI is published.

## Reliability and access

- Access is saved before attempting email. A failed/uncertain send returns a distinct status while retaining saved access.
- A durable record per event/recipient stores message payload, version, provider receipt and claim lease. Serialized database claims prevent concurrent duplicate sends.
- Repeated save operations for the same accepted invitation/expiry do not send another email. Explicit resends have a 60-second cooldown and a maximum of three attempts per hour.
- Retries reuse the exact stored payload and provider idempotency key. Uncertain attempts older than 23 hours or whose access expiry changed require review rather than risking a duplicate outside Resend's 24-hour idempotency window.
- Only an authenticated active owner session at AAL2 can invoke invitation actions. Guests cannot call the service-only claim function or read receipts. Owners can read only receipt/status columns; only the server can write delivery state or read stored payloads.
- The claim rechecks active event, deletion, revocation and expiry. Deleting an invitation cascades its email record. Emails grant no access beyond existing gallery RLS.
- Security advisors were checked before/after. The generic anonymous-sign-in advisory also flags the new authenticated SELECT policy; it is gated by owner membership, AAL2 and an active session. Offline RLS tests prove nonowners and AAL1/revoked sessions see no receipts. Reference: https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins

## Validation and acceptance

`npm test` and `npm run test:recovered` passed. Coverage includes actual migration SQL in PGlite, RLS privileges, cooldown/rate limits, duplicate/uncertain attempts, revoked/expired/paused eligibility, provider errors, receipt failures, API authorization, browser send/retry/save-only behavior, branding parity and HTML escaping. Existing password, gallery, printing and helper regressions passed.

After deployment: checked RLS and function privileges in the live database and verified the new queue was empty. No test invitation emails were sent, and no existing customer access was changed during development.

To test: open the Owner Studio preview, choose an open test gallery, and invite an address you control. This action sends a real email and grants that address gallery access. Check the branded message, correct gallery/event, and signed-in access. Existing invites can use **Send invitation email** without resaving. Confirm normal customer behavior before publishing and merging.

Rollback: restore the prior Studio asset and gallery-api version 54. Retain the email table/receipts for reconciliation; do not drop it or resend uncertain messages automatically. The new table is additive and old code does not access it.
