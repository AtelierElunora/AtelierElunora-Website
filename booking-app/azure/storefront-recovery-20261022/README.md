# Storefront booking recovery — October 22, 2026

The active app version referenced booking-widget.js and booking-widget.css on Shopify extension CDN paths that returned 404. The booking block remained rendered but had neither styling nor a click listener. Direct booking-server checks alone had not caught this storefront failure.

Applied to live theme 192789446944 (Atelier Elunora — Refined Headings Oct 21) through Shopify code editor. This directory snapshots only the changed layout and new snippet for that exact theme; do not overwrite another theme layout with this snapshot. For another theme, add the snippet and render it on product pages immediately before the closing body tag, preserving that theme's existing layout.

The snippet packages scoped CSS/JavaScript through Shopify theme stylesheet/javascript tags, so delivery uses the theme's own compiled assets. Its delegated handler acts only when the extension has not already opened the booking dialog. It preserves selected variants, collection, embed and parentOrigin parameters, secure message-origin/source checks, opaque inquiry tracking, close cleanup and focus restoration. Other product purchase flows are untouched.

Live verification: fresh wedding product page; cream text on olive background; button click loads the booking iframe; Up to 150 guests shows $1,495 / $448.50 / $1,046.50; 151–200 guests shows $1,995 / $598.50 / $1,396.50; close button clears the iframe; keyboard Enter opens and Escape closes. Both generated theme assets return 200 and contain the recovery code. JavaScript syntax check passed. No booking, inquiry, email or payment was submitted.

The browser viewport override did not produce a 390px viewport on this host (actual width remained 843px), so an iPhone-width claim is not made. The bundled standalone Liquid validator could not run because @shopify/theme-check-common is missing. Shopify code editor and live rendered behavior were inspected instead.

Rollback: remove only the conditional atelier-booking-recovery render from the layout. Retain this recovery until an app-version release has verified, reachable extension assets and a successful fresh storefront click. Future releases must test the actual live storefront entry point as well as the booking server; do not assume a manually created Dev Dashboard version includes uploaded extension assets.
