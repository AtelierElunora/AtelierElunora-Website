## Wrap alignment and print cleanup (v1.42)

Publish **Atelier Elunora v1.42 — Wrap Alignment & Print Cleanup** (191759286560). Deploy/release the updated owner-app source with Prepare-Owner-App.cmd for event-wide positioning controls. The print desk controls become available when the theme is published. The API update is deployed separately; no database migration or new credentials are required.

Each wrap edge has its own along-edge shift (−0.5 to +0.5 inches) and a center reset. For top/bottom, positive moves right and negative left; for left/right, positive moves down and negative up. Directions refer to the flat preview and do not reverse when the lettering is rotated 180°. Existing text distance still controls movement toward/away from the photo. Old templates default to zero shift; existing saved print snapshots remain unchanged. Owner defaults apply to new unsnapshotted jobs; Reload event template applies them to an open pending photo.

Printing now hides the prepared download and print links and asks Printed — clear from queue or Not printed — keep for retry. Only physical-print confirmation marks the job complete. It removes the completed queue entry, images and downloads. Cancel/retry retains the reservation. Another desk confirming a selected job clears its stale sheet on the next visible poll, usually within five seconds. Remaining pending jobs stay queued; an active automatic mode may immediately prepare the next full batch. Stored gallery photos and print history are retained. Station pairing links remain available for the next photos.

Tests cover per-edge shift validation and persistence, rotated-direction behavior, printed/canceled handling, link removal and cross-window completion. Theme validation and owner build checks are also run. A browser cannot detect printer success, so dismissing a print dialog alone never empties the queue.

## Zero text distance update (v1.40)

Publish **Atelier Elunora v1.40 — Zero Text Distance** (191758827808), then reopen the print desk and a pending photo. This replaces the v1.39 publication step below while retaining its connection fix, six-photo batching and cutting guides. Backend gallery-api v22 is deployed; no SQL migration is needed. Deploy/release the latest owner-app source via Prepare-Owner-App.cmd to allow zero in the owner editor as well.

The old 0.06–0.25-inch cut-edge inset restriction conflicted with the image-relative control. Text centers may now reach the image edge (distance 0) or the cut edge. Zero retains its center-based meaning and can overlap the photo; the preview shows actual placement. Saved templates and print snapshots are not rewritten. Per-side adjustments remain supported; an adjustment that moves the text center outside the cut is rejected. Full/partial Letter geometry and magnet dimensions are unchanged.

Validated zero/near-zero distances across cut sizes, front-end/backend parity, print claim at zero, and owner save at zero. Existing station and batching tests pass. Fields on a reserved printing job remain locked; inspect/cancel physical printer output before returning a job to pending to edit it.

## Current update: station connection fix (v1.39)

Publish **Atelier Elunora v1.39 — Station Connection Fix** (191755125024), then reopen the original private capture/print links. The older station used an unversioned helper import; Shopify could return a stale helper without the new cut-guide export, preventing startup. The station now ships as a single versioned asset, including its helpers. Supabase needs no additional deployment for this fix.

The owner-app **Text distance from image edge** change is separate and does require deploying and releasing the updated owner-app source if your installed app still says cut edge. Download the latest `development/photo-station-owner-app` branch, extract the full source into a simple folder such as `C:\Users\amace\Elunora`, run `Prepare-Owner-App.cmd`, and release the uploaded version in Shopify. Keep the source folders together because the app imports shared template validation. The queue and cut-guide work itself did not require another owner deployment; that does not mean older owner UI changes were already installed.

For station development, edit `station/atelier-station.mjs` and `theme/assets/atelier-station-core.js`, then run `npm run build:station`. Commit the generated `theme/assets/atelier-station.js` too. `npm test` checks that source and bundle match. Do not restore a runtime unversioned helper import.

# Photo station prototype · September 20, 2026

Built from the supplied Atelier-Elunora-GitHub-Source.zip. **Source changes only: not deployed or connected to production in this task.** Begin with a private test event before making this a client-facing service.

## What is built

- Owner app event panel creates separate capture and printing links, lists active devices, revokes links and refreshes queue status every five seconds.
- Tablet capture page requests camera access, supports front/rear cameras, takes a picture, offers Retake / Use this photo, then uploads only the accepted image.
- A successful upload creates a normal gallery photo and a pending print job. Existing gallery invitations and access rules still determine who can see it afterward. Event guest viewing may remain paused during capture.
- Printer-computer workspace refreshes pending jobs every five seconds. It supports 1×–3× zoom, square crop positioning, Reset crop, quantity 1–12, held jobs, reservations before printing and manual confirmation of physical prints.
- Each job creates landscape 6 × 4 inch sheets with up to two copies of that job's photo per sheet. Odd quantities leave one slot blank. Different guests' jobs are not combined on one sheet in this first version.
- Print dialog plus downloadable 1800 × 1200 pixel PNG sheets. No NineMags integration, DNP driver, unattended print agent or automatic hardware completion detection is included.

## Windows owner-app setup

Extract the latest archive fully, then double-click `Prepare-Owner-App.cmd`. It installs pinned dependencies, runs automated checks (including mounting the owner panel), asks for Shopify sign-in in the browser, validates/builds the app, and uploads an **unreleased** app version. It stops on any error. It does not install/release the app, change your theme, or enable capture. Share the version identifier or a screenshot of any error; never share sign-in codes or credentials.

Run this from the updated download or the development branch, not the older demo folder. Windows itself was not available to execute this launcher here; its individual Node checks passed on the build system.

## Try the interface without equipment or deployment

On Windows PowerShell, use `npm.cmd` wherever these instructions say `npm`. To update an existing demo, stop it with Ctrl+C, replace its `theme` folder with the one from this download, start `npm.cmd run demo` again, and refresh the browser with Ctrl+F5. No dependency changes are needed for the zoom update.

Use Node 22 or newer. From this project's root:

```sh
npm ci
npm test
npm run demo
```

Open `http://localhost:4173/?demo=capture` on that computer to try a webcam and the review/reset flow. Open `http://localhost:4173/?demo=print` for a synthetic crop/print job. Demo mode never calls Supabase and does not preserve photos. Camera permission is required for the capture demo. A phone or tablet needs a properly hosted HTTPS version, not a LAN HTTP address. The local preview server binds only to localhost and is not a production host.

## Deploy in this order

1. Back up and compare the currently deployed owner app and gallery-api with this supplied baseline. This archive is not a fresh export of your live store. Preserve any later changes. **Do not upload this archive's entire theme over your current theme.** Its historical theme baseline can predate your newer package changes.
2. Apply `supabase/migrations/20260920025307_event_photo_station.sql`, then `supabase/migrations/20260920025317_photo_station_zoom.sql` to a staging project first (then the intended project after acceptance). Existing migrations should already be present; do not replay the old migrations on production. The new tables use RLS with no browser-role grants; service-role RPCs do not elevate the caller. Run Supabase's security advisors after application.
3. Deploy the updated `gallery-api` folder through your existing deployment workflow. Preserve the current platform `verify_jwt=false` configuration: existing handler authentication and the new scoped station capability checks perform authorization. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side. No new public credentials are required.
4. Copy only these four NEW theme files into a duplicate of your latest theme:
   - `assets/atelier-station.js`
   - `assets/atelier-station-core.js`
   - `assets/atelier-station.css`
   - `templates/page.photo-station.liquid`
   Create a Shopify page with handle `photo-station` and assign template `photo-station`. It is a standalone page, with no storefront navigation, analytics or app embeds, and a no-referrer/noindex policy. It needs to be published for devices to reach it, but the page alone grants no event access.
5. Deploy the updated owner-app source, including `PhotoStation.jsx` and its AppHome import/mount. Use the existing Shopify app deployment process. Current app settings, MFA and booking logic are otherwise retained.
6. After acceptance, set `photoStationRolloutReady=true` in `station-rollout.mts`, redeploy the API, and set `PHOTO_STATION_ENABLED=true` in the gallery-api environment only when the database, page and app are all ready. It defaults to disabled. For staging on a different origin, deliberately update the API URL, owner-generated station URL and handler CORS allowlist to that trusted origin. Do not use wildcard CORS.
7. Sign in with owner MFA, create a private test event and generate a capture link and a print link. Open the capture link on the tablet in Safari and the print link on the Mac. Keep the full capture link private; it is a device credential, not a guest gallery invitation. Use Guided Access on the iPad to keep the browser in the intended screen.
8. Complete the acceptance checks below before offering this at an event. Use your duplicate theme preview for initial checks; repeat on the published page with a private event before client use.

## Printing and hardware acceptance

The DS620A is the intended candidate, **not hardware validated by this build**. Verify current DNP support for the chosen Mac/macOS and install the appropriate driver before purchasing/using equipment. Verify 6 × 4 landscape orientation, actual-size / 100% scaling, no browser headers or footers, and driver borderless-enlargement settings. Print and measure a calibration sample with a ruler.

The default cut square is 2.5 inches. This is a prototype value, **not confirmation of your press's paper cut size**. Your 63.5 mm finished magnet may require extra paper for wrap/bleed. Confirm with the press/cutter supplier and enter the required cut size (2.5–2.9 inches is supported by this two-up layout). If it is outside that range or requires a specialized safe-area mask, adjust the layout before production. Test faces/text near edges through cutting and pressing. PNG resolution is 300 pixels per inch when printed at the specified 6 × 4 inch size; download software may need dimensions set manually.

The camera uses a video frame up to 2400 pixels on its long edge and JPEG compression, not a full-resolution still-camera API. Test actual iPad resolution, focus, lighting, skin tones and motion blur. Front cameras and dim venues may not be adequate. No mirror transform is applied to the saved photograph.

## Acceptance checklist

- Capture → Retake sends nothing. Use this photo uploads once and confirms only after gallery + queue registration.
- Disable Wi-Fi during submission; restore it and retry the same photo. Confirm a single gallery photo and print job.
- Photograph two different guests; after each successful upload, no prior photograph remains in the capture screen.
- Guest capture link cannot list photos, open print jobs, manage events or grant access.
- Owner sees new jobs within about five seconds while connected and the app is open.
- Adjust Zoom to 2× and reposition the crop; verify prepared sheets match the preview. Reset crop should return to 1× and center. Saved jobs retain zoom for recovery.
- Open two print workspaces and attempt the same job. Only one reservation should succeed; refresh the other.
- Cancel the print dialog: job remains Printing. Check the printer, then use Return to pending if nothing printed. Never infer print success from the dialog closing.
- Review pending, printing and held filters. Each returns the oldest 100 jobs in that status; completed jobs leave the active queues.
- Revoke the capture link, expire a session, or trash the event: new captures must fail. Existing short-lived image links can remain valid for up to 60 seconds; previously loaded images cannot be recalled.
- Verify received photo visibility through the existing private guest gallery and verify complete event deletion after its existing waiting period.
- On the actual iPad, test camera permissions, front/rear switching, rotation, backgrounding, sleep/wake and Guided Access. On the actual Mac/printer, verify crop size and physical output.

## Failure recovery and boundaries

Keep capture screens open during interrupted uploads. The photo and retry ID are held in memory; closing/reloading can lose an unconfirmed image. Retake is disabled after the first submission attempt because its result may be uncertain. Reuse the Retry button. Before recovering from an expired link, the attendant should check the queue for the photo to avoid duplicates.

Links expire after 12 hours. They are 256-bit random credentials stored as hashes on the server; only an authenticated MFA-verified owner can issue/revoke them. The browser removes the fragment after reading it and keeps its scoped token in tab session storage. Closing the screen clears this device's token; revoke the link in the owner app to disable it elsewhere. Normal owner sign-out does not revoke issued device links. Removing the issuing owner from gallery_admins disables those links on subsequent requests.

Capture reservations are capped at 1,000 per link and spaced by at least three seconds. Accepted uploads are limited to 4 MiB and validated by the existing image renderer. Incomplete captures stay hidden as incomplete gallery uploads and can be removed using the existing owner workflow. Event deletion cascades station/queue records and retains the existing storage purge process. The capture original and preview consume normal Supabase storage.

Use `PHOTO_STATION_ENABLED=false` to stop all station API operations quickly. Existing gallery/authentication/upload routes remain available. Keep the new tables when rolling back the UI/API until their photos and print records have been reviewed; do not drop them blindly.

## Verification performed

- PGlite PostgreSQL tests execute the new migration against a minimal schema fixture. Checked service-only grants, RLS enablement, event scoping, revocation/expiry, owner removal, request idempotency, limits, atomic gallery/queue registration, optimistic print version checks, legal transitions and delete cascades.
- Backend tests cover malformed capabilities, role separation, image/quantity bounds, immutable storage retry after finalization failure, and crop/sheet geometry.
- Simulated DOM tests cover capture approval, offline retry, photo reset, queue loading, sheet generation and manual print confirmation. They are not actual Safari/camera/printer tests.
- Existing eight activity-log regression tests retained and run.
- The separate Polaris validator could not resolve its Preact JSX runtime in this environment; component validation in Shopify remains a deployment check. The owner app bundle check passed.
- Owner app and Edge Function source bundled to verify import/syntax compatibility. This is not a live Supabase Edge Runtime deployment or production end-to-end test.

Reference documentation: [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth), [browser camera access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Automatic six-photo Letter sheets

See [LETTER-PRINT-QUEUE.md](LETTER-PRINT-QUEUE.md) for the new print-desk mode, v1.38 publication steps, 3.6-inch cut limit, browser print-dialog behavior and physical acceptance checks. This feature does not require another owner-app deployment.
