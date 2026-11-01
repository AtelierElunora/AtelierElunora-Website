# Shopify booking payment integration

The server implementation is in `app/payment.server.ts`, `app/checkout-credit.mjs`, and `app/payment-ledger.mjs`. It uses the approved scopes `write_draft_orders,read_orders,read_products`, API 2026-10. GraphQL operations were schema-validated with Shopify AI Toolkit.

Each immutable payment attempt is recorded before Shopify creates its draft checkout. A transaction reserves daily capacity and resource pools. Customers choose the configured prepayment or the full remaining amount; balance checkout charges only the principal still outstanding. Shopify verifies actual receipt before booking credit changes. A draft order being paid in full does not mean the wedding booking is fully paid.

Authenticated webhooks verify the server-created draft's resulting order, link attributes, currency, original line price, quantity, taxes and received/refunded totals. Per-shop row locks, unique order links, event deduplication and ordered snapshots prevent duplicate credit. Late payments that cannot reclaim capacity require owner review. Unknown creation outcomes can be recovered by the unique payment tag without blindly creating a second invoice.

Additional checkout tax is tracked separately from booking principal. A 30% prepayment still leaves 70% of the agreed booking amount due. Tax-inclusive totals and tax-only refunds are handled; unexpected fees, discounts, quantity edits or unverified tax allocations require owner review. The configurable taxable flag is snapshotted per booking. Owner prices and tax treatment require approval before production use.

Refunds are performed in Shopify's owner interface; the app reconciles the resulting net booking credit. Cancellation records an audit trail and refund proposal without moving funds. No automatic future card charge is implemented or implied. Balance collection uses a fresh secure Shopify checkout.

Persisted receipts retain historical credit because ordinary order-read access covers the previous 60 days. Historical backfills requiring `read_all_orders` are outside the approved scope. Supported currencies are USD, CAD, EUR and GBP; production currency must be verified before activation.

Messages are separate from invoice creation. Confirmation and reminder jobs are durable, but delivery remains disabled until a booking sender credential and test-recipient allowlist are configured. Creating a draft checkout never sends an invoice email.

Sources:
- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/draftOrderCreate
- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/webhookSubscriptionCreate
- https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order
- https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem


## Combined wedding and keepsake checkout

New customer bookings can snapshot an allowlisted published shipped variant from each keepsake family. The reviewed USD price is revalidated on booking creation and invoice creation. The approved read_products scope lets the installed app verify the real variant identity on draft and order line items; selection remains restricted to the published keepsake allowlist. The first invoice contains one non-shipping custom wedding prepayment/full-payment line and real Shopify variant lines paid in full, with shipping selected in Shopify Checkout. BookingPayment.amountCents and WeddingBooking.totalCents/paidCents remain wedding-service principal only.

The booking details retain a versioned keepsake selection, its invoice attachment, and verified keepsake receipts. Pending invoice retries reuse the draft; settled or refunded physical purchases are never added to later wedding balance invoices. Failed or voided unpaid drafts may be retried. These fields require no database migration.

mixed-checkout.mjs verifies the complete variant/quantity/price list, service line marker, currency, discounts, shipping and receipt totals. Fully captured receipts credit only the service line. Line-specific product or shipping refunds do not reduce wedding credit; service refunds do. Unallocated adjustments, partial captures, edited contents or truncated snapshots require review and retain previously verified credit. The existing single-service-line reconciliation is preserved for historical bookings.

Shopify receipt amounts include all items, shipping and tax. Customer and owner booking summaries, signed contracts and confirmation emails distinguish wedding principal from keepsakes. Physical fulfillment remains in Shopify. No real payment is made by the automated tests.
