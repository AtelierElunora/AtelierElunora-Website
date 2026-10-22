# Automatic inquiry follow-up

Activated in production on 2026-10-22T23:24:32.565373+00:00, after the owner explicitly approved customer follow-up emails. Sender: photos@mail.atelierelunora.com. Replies: support@atelierelunora.com. The existing provider payload already sets this Reply-To address; no code change or redeployment was required for activation. Functional source: 6566eb901e3dd7e229bfb3166e11b4645ae68872; Linux workflow 39865791477 passed. The Shopify app version and storefront extension were not republished for this update.

## Customer flow

A consented inquiry receives a gentle follow-up at 24 hours and a final note around day three. A delayed first send pushes the second at least 48 hours later, preventing catch-up bursts. Related submissions to the same email within a fixed fourteen-day cohort share one sequence. A later fresh, consented inquiry can start a new cohort.

A private, purpose-bound HMAC link expires after fourteen days. Opening it is read-only. The customer explicitly continues or confirms opt-out. Linked unpaid bookings return to their existing portal and contract; existing invoice reservation checks revalidate availability before checkout. Unlinked inquiries return to the current booking form with saved contact/event details and current pricing. A date must be selected again. No email link creates a booking, accepts an agreement, reserves capacity or charges a card automatically. The saved email address remains fixed on the private recovery form.

Messages use the existing Microsoft 365 provider and branded light/dark email template, from photos@mail.atelierelunora.com with Reply-To support@atelierelunora.com. The stop link closes inquiry follow-up only; it does not cancel a booking or suppress required booking messages. Replies are handled by the business: marking an inquiry Contacted or Closed stops automatic follow-up. There is no automated inbound-mail processing.

## Eligibility and delivery

Automation is per shop, with pause/resume controls in Leads. Initial enabling includes recent consented inquiries from the previous 48 hours; older records are not backfilled. A seven-day maximum age prevents stale catch-up. Closed/contacted cohorts, past requested dates, paid or cancelled bookings, quote/waitlist/review states and uncertain payment records are excluded. Recipient checks preserve the development-store allowlist. Revalidate state under the shop row lock before claiming each send.

Jobs are durable and unique. BookingMail kinds lead_followup_1 and lead_followup_2 use bookingId as the inquiry cohort anchor, rather than a WeddingBooking foreign key; the schema has no relation constraint. The ordinary booking-mail dispatcher explicitly excludes these kinds. Provider operation IDs persist across attempts. Graph 202 is shown as Submitted to Microsoft, not Delivered. Ambiguous sends become review cases and are never blindly resent; failed/ambiguous first messages stop the second. Existing confirmation, gallery, quote, change and balance messaging remain separate.

No schema migration, dependency, new credential or expanded Shopify scope is required. Signed-link keys derive from the existing app secret with purpose and shop separation. Raw inquiry tokens and recipient fields are not published to analytics.

## Verification

110 local automated tests passed; TypeScript and production build passed; Linux workflow 39865791477 passed. Coverage includes timing, idempotency, deduplication, delayed dispatch, payment/closure/opt-out suppression, allowlists, uncertain outcomes, token expiry/tampering/shop/purpose scope, read-only GET, POST origin checks, existing portal recovery and prefilled fresh booking. Live checks verified the exact build, PostgreSQL-backed public form, invalid inquiry access returning 410, production controls showing Enabled with a success message and scheduled message history, and the actual storefront Book now entry point opening the updated booking form. Two recent same-email test inquiries share one sequence, scheduled for October 23 and October 25 in the production UI. No new customer booking, contract signature or payment was created by these checks; no customer follow-up was forced to send early.

## Deployment

- Startup: `sh /home/data/booking-inquiry-followup-final-20261022-start.sh`.
- Server SHA256: `fc7fdb346d5beacedd2b82b5d7acb7e68f1c55fd960cdebce4868d4647d8bce6`.
- Archive: `/home/data/booking-inquiry-followup-final-20261022-frontend.tgz`.
- Archive SHA256: `fd69a4d70702dd2fa2546958a79868390f3552fdf7b2ed69a18e941117c2a0fa`.
- Retained runtime: `/home/data/booking-combined-runtime-20261022-a1c6b401.tgz`.
- Immediate rollback startup: `sh /home/data/booking-inquiry-followup-20261022-start.sh`.
- Pre-feature rollback startup: `sh /home/data/booking-mixed-final-20261022-start.sh`, build e4ebb3a982058981b8f8af0d5ada389ad60c527dc6c7d34735fe8f845b99a628.

Pause inquiry automation before a rollback. Keep all referenced runtime and frontend archives. The separate theme-owned storefront recovery from the previous release remains in place.
