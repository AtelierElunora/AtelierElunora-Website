# Shopify booking payment integration

The server implementation is in `app/payment.server.ts`, `app/checkout-credit.mjs`, and `app/payment-ledger.mjs`. It uses the approved development-store scopes `write_draft_orders,read_orders`, API 2026-10. GraphQL operations were schema-validated with Shopify AI Toolkit.

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
