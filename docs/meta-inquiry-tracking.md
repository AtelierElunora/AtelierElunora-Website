# Wedding inquiry conversion tracking

Prepared in source. Not deployed or verified in Meta yet.

Local validation on 2026-10-22: 14 focused tests passed (widget, browser-side
reporter, pixel consent/deduplication and database-backed inquiry capture),
TypeScript passed, and client/server production builds passed. These are local
checks, not proof that Meta has received a live Lead. No live lead or payment
was created during this work.

## Event definition

One Meta `Lead` means the customer explicitly saved a valid inquiry in the
embedded booking form. It does not mean a qualified lead, signed contract,
reserved date or payment. The initial contact save and later event-detail update
share the same conversion identifier. Invalid and rejected submissions emit nothing.

The server creates a domain-separated SHA-256 identifier only after the inquiry
upsert succeeds. Neither the browser inquiry access token nor its stored token
hash is exposed to analytics. The frame sends only this identifier to an
allowlisted storefront origin. The widget checks both the iframe window and
origin before publishing `elunora:inquiry_saved` through Shopify analytics.

The subscriber in `booking-app/pixels/meta-inquiries.js` maps only this custom
event to Meta `Lead`, dataset `1845623429782635`. It requires Shopify Marketing,
Analytics and sale-of-data permissions, checks consent updates, disables Meta
automatic event configuration and passes no advanced-matching customer fields.
Contact consent is separate from tracking consent. No Conversions API is added.
Deduplication uses memory, Shopify sandbox session storage, and a stable Meta
event ID. Blocking cookies, denying consent or blocking the SDK can prevent
measurement; successful inquiry capture must still work.

## Deployment order

1. Compare these changes with the current Azure production source and current
   Shopify app-extension version. The local repository includes other pending
   booking work. Deploy only a reviewed release, not the entire working tree.
   The prior inquiry release uses `release/booking-leads-20261021`; PR 14 is
   still a draft and includes a different baseline. Port the analytics change
   onto the current production release before deploying. The local build made
   for validation is not a production deployment archive.
2. Deploy the booking app changes (`leads.server.ts`, `inquiry-analytics.ts`, and
   `routes/book.$shop.tsx`). No database migration is needed for analytics.
3. Release the updated `elunora-booking` widget. The live wedding product uses
   this app block. It now passes its storefront origin into the iframe.
4. In Shopify Settings > Customer events, create **Atelier Elunora inquiry leads**
   with `booking-app/pixels/meta-inquiries.js`. Require Marketing and Analytics;
   respect data-sale opt-outs. Keep the native Facebook & Instagram app at
   Conservative. Review any displayed terms before connecting the custom pixel.
5. Verify the loaded SDK's automatic events are disabled in Meta, and check
   there is no other subscriber translating this custom event to Lead.

Do not duplicate the native integration's PageView, checkout or Purchase events.
This custom pixel subscribes to none of those events. Do not install the native
base pixel a second time in the theme or on private booking portal URLs.

## Verification

- In staging, submit a synthetic valid inquiry with tracking consent. Check one
  saved inquiry and one anonymous `elunora:inquiry_saved` event, followed by one
  Meta Lead in Test Events after deployment.
- Save additional event details, repeat the response, and reopen the widget:
  the same inquiry must not create another Lead in the same browser session.
- Test denied/revoked consent, unavailable session storage, a blocked SDK,
  invalid input, and rejected saves. Booking remains usable; denied consent
  must send no Lead. Never use real customer details for analytics testing.
- Test checkout in a development store or an approved controlled test. Observe
  native InitiateCheckout and Purchase without adding manual copies. Verify a
  prepayment reports the checkout amount paid, not the full package value.
  A later balance payment is another payment transaction, not a second booking.
  Do not call a paid order a confirmed booking unless the booking service has
  independently reconciled it and marked the booking confirmed.

Local focused checks:

```
cd booking-app
node --test tests/booking-widget.test.mjs tests/inquiry-analytics.test.mjs
NODE_ENV=test node --test tests/leads.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

References:
- https://shopify.dev/docs/api/web-pixels-api/emitting-data
- https://shopify.dev/docs/api/web-pixels-api/standard-api/customerprivacy
- https://help.shopify.com/en/manual/promoting-marketing/pixels/custom-pixels/code
- https://help.shopify.com/en/manual/promoting-marketing/pixels/custom-pixels/manage

Rollback: disconnect only **Atelier Elunora inquiry leads** and restore the
previous app/widget release. Keep the native integration and stored inquiries.
