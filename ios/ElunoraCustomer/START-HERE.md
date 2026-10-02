# Atelier Elunora — combined customer and owner iOS app, v4.1

## Build on your phone

1. Unzip the updated folder on your Mac. Open this copy of **ElunoraCustomer.xcodeproj**; earlier copies do not include these updates.
2. Select the blue project and the ElunoraCustomer target in Xcode.
3. Under Signing & Capabilities, select your Apple team with Automatically manage signing enabled. If needed, change the bundle identifier to a unique value. Keep the same identifier as your previous build to preserve its local photos.
4. Connect and unlock your iPhone, trust your Mac, and choose the phone in Xcode's device menu.
5. Enable Developer Mode if requested, then press Run.

Minimum iOS 17. Use an Xcode version whose iOS SDK supports your phone. No npm, Expo, Homebrew, CocoaPods, or third-party packages are needed. This project now includes the owner booth. The original standalone capture project remains available separately.


## v4.1 — Canon R100 preview and capture transfer

Connect Canon in Station setup. EOS control is enabled by default and the app selects the connected camera and starts live preview in the photo box. Preview remains active during the countdown, pauses for the still photo, and restarts after Try again or a successful submission. If preview fails, its status is shown in the box; Start live preview retries it without taking a photo.

The remote session now enables EOS events, reads camera properties, routes EVF output to the USB host, and no longer requires the legacy InitiateViewfinder command. Capture uses separate autofocus half-press and full-press/release commands. Before firing it selects an available SD-card destination and snapshots card object handles. It polls for a new JPEG and downloads it directly, so transfer no longer depends solely on an ImageCaptureCore didAdd notification. Existing card photos are excluded. RAW files are skipped; originals are not deleted. A lost shutter reply never automatically triggers another shot.

### R100 device check

1. Use still-photo mode, JPEG or RAW+JPEG, single-shot drive, an unlocked SD card with free space, and a charged battery. Connect the camera through the USB data adapter; allow camera permissions.
2. Open a test event booth, Station setup → Connect Canon. Leave Canon EOS control enabled. Tap Done and confirm a moving preview appears **before** Capture.
3. Tap Capture once. Confirm the countdown, one exposure, then the full still photo in the review box. Try again should restart preview.
4. Approve a test photo only when ready to send it to that event's gallery/print queue. After sending, confirm preview returns.
5. Test disconnect and backgrounding during preview and transfer. Reconnect explicitly; a partial transfer must not submit a photo or trigger a replacement exposure.
6. If you hear the shutter but no review photo arrives, check whether the camera's playback shows a new JPEG. Send that result and Station setup → Connection diagnostics. Do not repeatedly press Capture to troubleshoot an uncertain shot.

Validation limits: no R100 or Apple SDK is available in this workspace. Device behavior and an Xcode build remain required; these changes address identified protocol and discovery gaps, not a hardware-certified result. No live photos or prints were created.

Foundation-only wire-format fixtures are included for a Mac check (from this folder):

```sh
swiftc ElunoraCustomer/CanonPTP.swift Tests/CanonProtocol/main.swift -o /tmp/elunora-canon-tests
/tmp/elunora-canon-tests
```

Protocol reference: [upstream libgphoto2 EOS implementation](https://github.com/gphoto/libgphoto2/tree/master/camlibs/ptp2), particularly library.c (capture/live view), config.c (remote initialization/output), ptp.c and ptp-pack.c (wire formats). This app implements the commands independently; it does not bundle libgphoto2.

## v4.0 — one app, owner and customer experiences

This build includes the current capture implementation from development/ipad-camera-prototype (47f704594d29f7831703162796ddb8a774ca6217), including the 0/3/5/10-second countdown, front/rear camera choice, photo review/retry, Canon JPEG transfer and experimental EOS/live-view controls. The native customer features and BrandedFonts folder remain included.

### Owner workflow

1. Sign in through Account using your owner credentials, then enter your existing six-digit authenticator code. Owner status comes from the authenticated server session; email alone never grants owner access.
2. The owner booth dashboard opens. Choose an active event and tap Connect selected event. The server creates a 12-hour capture station scoped to that event; copying a station link is no longer required. Existing capture links can still be entered in Station setup.
3. Open booth setup, then tap Station setup to choose the countdown, front/rear camera, and Canon options. Start with a test event. Canon controls retain their experimental status and need R100 hardware testing.
4. In Station setup, tap Lock booth for guests. Or use Start locked booth from the dashboard. Guests can capture, retake and approve. Approved submissions use the existing event gallery and print queue. The Mac print helper still handles physical printing.
5. To change settings or leave the booth, tap Owner controls, enter a fresh authenticator code, then open Station setup. Return to owner dashboard is available after unlocking. The booth cannot be dismissed with a swipe. Backgrounding locks it; relaunching an active booth restores it locked after the saved account is verified by the server.
6. Switch to customer view opens the customer tabs; Return to booth restores the owner dashboard. This previews the customer interface using the owner's existing access; use a separate customer login to test invitation restrictions accurately. Pending booth photos must be resolved before switching accounts or customer view.

Guest accounts keep the customer app. Anonymous visitors can still capture/import and use event QR sharing. Owner login without a verified authenticator is gated; first-time enrollment continues through the existing owner studio.

### Booth lock and data protection

The lock protects in-app owner controls and requires a fresh server-verified TOTP challenge to unlock. It does not stop the iOS Home gesture or app switching: turn on Guided Access in iOS Settings → Accessibility, then start it with the hardware-button shortcut when handing the device to guests. Keep your authenticator on another device if the booth device is in Guided Access.

Owner role and AAL2 are checked before owner event/station requests, and existing server checks remain authoritative. Capture requests use only the event capture capability, never the owner's JWT. Station connection and pending JPEG/retry IDs are stored with file protection in an owner-specific folder excluded from backups. Customer galleries/photos are not used as the booth capture store. Switching authentication sessions cancels stale refresh results and clears embedded website sessions. No backend schema, RLS, or Edge Function changes were required for this integration.

The combined app cannot automatically read the separate capture app's sandbox. Finish its pending photos before migrating, then connect the event in this app. Copy your font files into this project's BrandedFonts folder before building. Use your existing customer app bundle identifier to preserve its local customer photos.

### Required device test before an event

- Customer login: only customer tabs; invited gallery restrictions and QR upload isolation still work.
- Owner login: MFA required before dashboard; wrong code denied; correct code loads active events.
- Connect a test event, capture on built-in camera with countdown, retake, approve, verify one gallery photo/print job. Retry an interrupted submission and verify no duplicate.
- Test R100 transfer and optional EOS/live-view functions separately. Confirm built-in camera fallback.
- Lock booth, try setup/back/swipe; owner controls must require a new valid code. Background and force quit/relaunch: the booth must reopen locked after account verification. Test Guided Access separately.
- Unlock, return to dashboard, switch to customer view and back. Sign out and use a different account; no prior owner controls or embedded web session should remain.
- Revoke a station or expire its link: submissions must be rejected and pending photos retained for review/retry.

Validation here: all Swift source files syntax-checked; Xcode source/resource references and plist/ZIP verified; mock tests against the downloaded live handler/MFA code cover customer denials, forged editable metadata, AAL2 station gating, invalid/revoked sessions, fresh unlock verification and wrong-user verification denial. No live test users, photos, stations, emails or prints were created. Linux cannot compile this iOS target or exercise iPhone/iPad camera UI; the checks above still require Xcode and physical devices.

## Customer features retained

Capture/import, local photo tray, native magnet crop/pack selection, checkout, native assigned galleries grouped by event, event QR uploads limited to each guest's private upload session, and password/email-code sign-in remain available. Cloudflare verification is embedded in the native login screen. Account and sign-in use readable system text; the app uses a consistent light olive/cream appearance.

To order, capture/import photos, select them in My photos, connect a private workspace in Order, select a pack and quantities, review crops and consent, then continue to Shopify checkout. An opened checkout link is not proof of payment; payment confirmation remains authoritative on the backend. Stop before payment when testing unless you intend to purchase.

For customer event sharing, open Capture → Join an event or Galleries → Your event uploads. Scan the existing sharing QR (or paste its full link), consent, select photos and upload. The upload gallery shows only this phone/profile's private guest-session submissions. Uploads from a website session or another phone do not automatically appear. QR possession never grants full-gallery access; separately invited accounts retain their assigned gallery access.

## Brand fonts

Copy your licensed OTF/TTF files into ElunoraCustomer/BrandedFonts, then build. The folder is already connected to Xcode resources. The app reads the actual font family, PostScript name and weight automatically: Brown Carolina for body, Edwardian Script for headings when available, and an actual heavier face for buttons/capitals. System semibold remains when no heavier face exists. WOFF/WOFF2 need the original OTF/TTF edition; renaming does not convert them. No proprietary font files are included. Native Account and sign-in controls keep readable mixed-case system fonts.

## Local data and distribution

Use the same bundle identifier when updating to preserve customer photos and sessions. This combined build uses separate owner booth storage within its own app container; it does not migrate another app's data automatically. Do not uninstall an app with pending photos. TestFlight/App Store submission is not included. No live purchases, test uploads or print jobs were performed here.
