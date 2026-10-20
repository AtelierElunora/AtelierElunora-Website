# Atelier Elunora product-page booking block

Prepared theme app extension; it has not been released or installed. Liquid app-block validation passed on 2026-10-06; JavaScript syntax check passed.

After the reviewed Shopify app release, add this block to the development product template in the theme editor. Set the Development booking page URL to:
https://app-elunora-bookings-nvo32m3ban2cc.azurewebsites.net/book/atelier-elunora-gallery-test.myshopify.com

Configure package names to exactly match product variant titles. The block reads the current selected variant ID and forwards its title from the serialized product variant list. Unknown collections are rejected, rather than invoiced at a fallback collection price. Catalog prices are still booking settings, not Shopify product inventory. Test selected variant changes, calendar blocking, waitlist, questions, extras, checkout navigation, and mobile display in the real development theme before production use.

Keep Cowlendar active on production until product/add-on linkage, quote/travel approval, agreement and sender setup, cancellation/rescheduling policies, calendar integration and migration are complete and verified.

The app is restricted to the approved development store. Releasing this block does not change the production product template.
