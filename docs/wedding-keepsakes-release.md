# Wedding keepsakes release — 2026-10-22

Source: `355fbc82200086b09b95d288099b0fa0f8955897`, PR 16, based on the current combined booking release in PR 15. GitHub Linux workflow run `39844277345` passed. Local validation included 87 tests, TypeScript, production builds, actual customer form navigation at desktop and iPhone widths, variant selection, and a separate product checkout review without placing an order.

Deployed and verified at 2026-10-22 20:12 UTC on Azure App Service `app-elunora-bookings-nvo32m3ban2cc` in `rg-elunora-production-central`.

Active startup: `sh /home/data/booking-keepsakes-20261022-start.sh`.
The startup checks both archives, extracts the existing complete Linux runtime and then applies a small build/CSS overlay into `/tmp/booking-keepsakes-20261022`. Existing Linux dependencies, database clients and HTTP server are preserved. There is no new dependency, database migration, permission or plan change.

Baseline archive: `/home/data/booking-combined-runtime-20261022-a1c6b401.tgz`.
Baseline archive SHA-256: `dc1ec630c7fde4f1a3db07122a3e8d39f6efbc00dfe979528fcea3bc98430001`.
Overlay: `/home/data/booking-keepsakes-20261022-frontend.tgz`.
Overlay SHA-256: `3da52ef2f262d2ef38a8da21f4bdaebbffaad95b9994ca46eee1fe583ccad39f`.
Checksum file: `/home/data/booking-keepsakes-20261022.sha256`.
Live `/health` HTTP 200 build: `2f0993731b765ace1669efb7b43f83d5aa6d320d930a31868c679eaee8af1c81`.

Live verification: the public embedded booking page returned HTTP 200, read existing settings and included the saved service extras. The new CSS returned 200. The catalogue returned all four product families without partial failures: 5 save-the-date variants, 4 frame sizes, 12 frame/magnet variants, and the extra 25-pack. Physical purchases remain normal Shopify product orders, separate from wedding totals, contracts and payment balances. No live inquiry, booking, signature or payment was submitted by these verification checks.

An initial health verification window expired during Azure startup and restored the baseline. Verification was retried with the host's longer startup allowance and IPv4 transport from this Mac; HTTPS certificate checking remained enabled. The final checks above passed. Preserve the baseline archive because the active startup uses it as its dependency layer.

Rollback: restore `sh /home/data/booking-combined-start-20261022.sh` as the App Service startup command and restart. Its `/health` build is `8548af0194564e508c7af32582502f029a690b64d62ee2c85ed1d9eb7ff84935`. No data rollback is required. Use IPv4 for this Mac's Azure deployment transport and allow normal host warm-up before judging health.
