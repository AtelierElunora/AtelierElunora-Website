# Combined wedding and keepsake checkout

Released to the existing Azure booking host on 2026-10-22T21:13:07.147275+00:00. Functional source commit: 45630cfbaf0e02ceda429d2e6b75442305f6d258, in PR 17, stacked on PRs 16 and 15.

Customers select keepsakes in Details & extras and pay their full price alongside the wedding prepayment or full payment in one Shopify Checkout. The remaining wedding balance stays separate. A $1,495 wedding plus $149 save-the-dates collects $597.50 initially at 30%, before Shopify shipping/tax, and leaves $1,046.50 wedding principal due. Selected real variants retain Shopify shipping and fulfillment. Contracts, booking summaries and confirmations distinguish the product purchase.

Selection is restricted to published keepsake families and revalidated against current variants and prices. Products attach only to the first invoice; later balance collection excludes them. Retries, recovery and item-specific refunds preserve wedding-principal accounting. Ambiguous receipts or adjustments require owner review. No database migration or new dependency is needed.

The owner approved read_products. Shopify version booking-keepsakes-combined-20261022 (1178052034561) was released and both production and test-store installations were updated. Source TOML and the Azure SCOPES setting include read_orders, write_draft_orders and read_products. The installed app's normal SDK session successfully read the diagnostic draft's real variant identity on 2026-10-22T21:11:39.023Z. The one-off probe was removed from future startup after verification.

Validation: 98 automated tests passed, TypeScript and production build passed, and Linux workflow 39853263318 passed for the functional source. Desktop and a 390-pixel booking frame verified selection, removal, prepayment/full totals and no horizontal overflow. An unsent Shopify diagnostic draft displayed the $448.50 service and $149 product together with store shipping methods. The diagnostic draft was deleted after verification. No real payment or customer booking was created by release verification.

Live checks: exact server build fingerprint, PostgreSQL-backed public booking page, stylesheet and all four product families (5 save-the-date, 4 frame, 12 frame-and-magnet, 1 after-wedding variants) passed.

## Deployment record

- Host: app-elunora-bookings-nvo32m3ban2cc, resource group rg-elunora-production-central.
- Startup: `sh /home/data/booking-mixed-final-20261022-start.sh`.
- Server SHA256: `e4ebb3a982058981b8f8af0d5ada389ad60c527dc6c7d34735fe8f845b99a628`.
- Frontend archive: `/home/data/booking-mixed-final-20261022-frontend.tgz`.
- Archive SHA256: `febe0578faa875001aa1b333c0b704cdc1db89d63470c3462192268fa325f660`.
- Retained Linux runtime archive: `/home/data/booking-combined-runtime-20261022-a1c6b401.tgz`, SHA256 `dc1ec630c7fde4f1a3db07122a3e8d39f6efbc00dfe979528fcea3bc98430001`.
- Rollback: restore `sh /home/data/booking-keepsakes-20261022-start.sh` and restart the booking host. Retain the existing keepsakes frontend archive and runtime archive used by that startup. Do not deploy the obsolete a47 candidate.

The app configuration was published through Shopify Dev Dashboard; the Shopify CLI is unavailable on this host, so its config validator was not run. GitHub retains the approved TOML scopes alongside the implementation.
