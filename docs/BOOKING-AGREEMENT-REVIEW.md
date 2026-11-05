# Booking agreement review — November 5, 2026

## Active production terms

The Shopify booking studio uses the editable **Booking agreement** in Policies. The separate full 20-section agreement is disabled. Its backup deletion field is incomplete and its additional-hour add-on is not configured; it was not enabled during this review.

The active agreement was updated from version 2 to **version 3** in production. Saving confirmed that existing bookings retain their agreed terms and prices. Changes apply to new bookings only.

Corrected package wording:

> Your selected guest-count collection includes three hours of live photo magnet service for Intimate and four hours for Signature, Celebration, Grand and Premier, a photo station, custom artwork and coordinated signage, one attendant, private event gallery access, and an after-wedding 12-pack for the couple with one standard shipment. Service timing and venue arrangements are confirmed with Atelier Elunora.

> Current collection base prices: Intimate — Up to 100 guests: $1,195; Signature — 101–150 guests: $1,495; Celebration — 151–200 guests: $1,795; Grand — 201–250 guests: $2,195; Premier — 251–300 guests: $2,595. Selected extras and approved travel are additional. Your saved booking details or approved written quote state your agreed total.

The obsolete Premier starting price of $2,995 was removed. The capacity paragraph now begins:

> Grand and Premier collections (201–300 guests) require review of production capacity, setup and staffing and an approved quote before payment. No payment is due while quote approval is pending.

Other payment, cancellation, photograph permission and travel provisions were preserved. This was a package consistency correction, not a legal-policy rewrite or comprehensive travel-policy review.

## Source template versus generated agreements

`booking-app/app/event-agreement-source.ts` preserves the owner-approved October 20 source and its provenance. Its old price list is not the active production agreement. Even when the full template is enabled, `buildServiceAgreement` replaces source rows 10–16 with the selected booking collection and saved amounts, so the static old rate list is excluded from generated agreements.

Before enabling the full template, separately update its four-hour service assumption to support Intimate's three hours, reconcile package inclusions, complete the missing shop settings, and test rendered agreements. Do not enable it merely to fix the active Policies text. Preserve saved signed agreements and their source/version history.

## Verification and limits

- Read back production Policies: version 3, all five current package names/prices, correct Intimate hours, and no unsaved changes.
- Opened the public booking form: Intimate still loaded at $1,195 with $358.50 initial payment and $836.50 balance.
- No customer inquiry, date hold, signature, checkout or payment was submitted. The later customer contract step was not reached because continuing creates an inquiry.
- This file records the runtime change. GitHub does not automatically deploy or overwrite the saved Policies text.
