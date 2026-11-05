# Event package configuration — November 5, 2026

The live Shopify product and Atelier Elunora Bookings settings were aligned to restore Book Now and expose Intimate. Signature was then renamed to **Signature — 101–150 guests** in both systems. Its price and Shopify variant ID were preserved.

Product: `wedding-event-photo-magnet-experience` (10548787708192).
Shop: `v0j63n-ms.myshopify.com`.

| Collection name | Shopify variant ID | Price (USD) | Maximum guests |
| --- | --- | --- | --- |
| Intimate — Up to 100 guests | 68068948836640 | 1,195 | 100 |
| Signature — 101–150 guests | 52203846697248 | 1,495 | 150 |
| Celebration — 151–200 guests | 52214558556448 | 1,795 | 200 |
| Grand — 201–250 guests | 52214558589216 | 2,195 | 250 |
| Premier — 251–300 guests | 52384258621728 | 2,595 | 300 |

## Keep future changes coordinated

The storefront sends the selected variant title as the booking URL's `collection` parameter. The booking loader matches that value exactly against the saved package name and returns HTTP 409 if it cannot find it. Keep punctuation, spacing, capitalization and guest ranges identical in Shopify and the booking app's Collections settings.

Package settings are runtime database configuration, not hard-coded defaults in the app source. A Git commit does not update those settings. Do not overwrite existing booking agreements or prices when changing the current collections.

The theme pricing helper looks up stable variant IDs. This synchronization adds Intimate's ID, copies the live five-collection pricing table, and updates the shared Signature, Celebration and Grand labels. Other storefront content is outside this targeted synchronization; this is not a full export of the live theme.

Book Now was verified on the live Signature variant after the rename: the booking form opened without a 409 and displayed $1,495 total, $448.50 initial payment and $1,046.50 balance. No booking or payment was submitted. Historical recovery snapshots and agreement fixtures retain their original text.
