# Wedding keepsakes in booking

The customer’s **Details & extras** step lists four shipped product families below the event-service extras: save-the-date magnet packs, keepsake frames, frames with magnets, and the extra after-wedding 25-pack. Customers select a pack/frame variant and open its product details in a separate tab. The booking form remains open. Save-the-date copy requires a confirmed wedding booking and delivery-date confirmation before ordering.

Confirmed customer booking pages also show this collection with **Buy separately in Shopify** links. Each link creates a normal product checkout for one selected pack/frame; Shopify collects the shipping address and calculates shipping and tax. No payment is submitted by the booking app. Physical purchases do not change wedding quote totals, contracts, 30% prepayments or balances, and are separate Shopify orders rather than entries in the wedding payment ledger.

Membership is an explicit list of the four approved product handles in `app/wedding-keepsakes.ts`. Prices, images, available variants and publication status are read from the public USD Shopify storefront using the Ajax Product API. Removed, unpublished, untagged, invalid, subscription-only and completely unavailable products are excluded. Successful complete catalogues are cached for one minute; failed reads do not use stale prices. Partial loading failures show a retry option. No API permissions, database schema changes or customer data are required for catalogue reads. Development-store booking pages do not direct customers into production product checkout.

Validation: 87 automated checks passed initially; the new catalogue/card/accounting checks were repeated after adding partial-failure handling. TypeScript and production builds passed. Customer UI and final runtime verification are recorded in the deployment evidence outside the repository. No live customer booking, signature, email or payment is needed to verify catalogue loading.

References:
- https://shopify.dev/docs/api/ajax/reference/product
- https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks
