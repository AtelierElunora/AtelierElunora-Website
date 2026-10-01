# Atelier Elunora — native iPhone app, v3.9

## Build on your phone

1. Unzip the updated folder on your Mac. Open this copy of **ElunoraCustomer.xcodeproj**; earlier copies do not include these updates.
2. Select the blue project and the ElunoraCustomer target in Xcode.
3. Under Signing & Capabilities, select your Apple team with Automatically manage signing enabled. If needed, change the bundle identifier to a unique value. Keep the same identifier as your previous build to preserve its local photos.
4. Connect and unlock your iPhone, trust your Mac, and choose the phone in Xcode's device menu.
5. Enable Developer Mode if requested, then press Run.

Minimum iOS 17. Use an Xcode version whose iOS SDK supports your phone. No npm, Expo, Homebrew, CocoaPods, or third-party packages are needed. The operator capture app is separate.

## Included functionality

- Capture and import photos; keep private app copies and remove them individually.
- Select a 3/6/12/24/48 magnet pack, set quantities, and adjust square crops with zoom and position controls.
- Save order drafts between launches. Original photos remain intact; uploads use orientation-correct JPEG copies up to 4096 pixels on the long edge.
- Read pack pricing and availability from the existing backend, upload selected photos to private storage, save a selection revision, and open Shopify checkout.
- Resume interrupted uploads using saved reservation IDs. Checkout retries reuse the selection and received checkout link. Start a new order deliberately creates a new selection.
- Show assigned galleries directly in the native Galleries tab, with all available visible photos grouped under their gallery names. Tap a photo for a larger preview. Pull to refresh for new photos or invitations.
- Access password/email-code login, downloads, gallery magnet ordering, services, packages, inquiries, store, and privacy pages inside the app. Downloads open a native share sheet to save to Files.
- Keep session tokens in the iOS Keychain, refresh them, and sign out. Checkout links clear when changing sessions or signing out.

Account login, gallery download/order tools, service pages, and inquiries use the existing website interface inside the app. Assigned-gallery browsing and photo previews are native. The camera, photo tray, crop editor, pack selection, saved draft, and upload/order preparation are native SwiftUI. There are no Snapchat social features or filters in this version.

## Connect and order

1. Capture/import photos. In **My photos**, tap Select on the photos to print.
2. In **Order**, tap **Connect private workspace**. Complete the website security check and choose **Continue without signing in**, or sign in with a customer account. Then tap **Connect to app** in the bottom toolbar.
3. Load packs if needed. Choose a pack and set quantities until the selected total equals the pack size. Each photo supports up to 12 copies.
4. Tap **Adjust crop**, position/zoom, and Save. Accept the upload permission notice.
5. Tap **Review my magnets**, then **Continue to secure checkout**. Selected photos upload at this point.
6. Pay on Shopify, where shipping and tax are calculated. Closing checkout does not mark an order paid; your Shopify confirmation email is the order record.

This uses production backend and Shopify checkout. For a test without purchasing, stop before submitting payment. Payment testing requires a deliberately authorized purchase or a separately configured test payment environment. No backend deployment or payment-mode change is included.

Owner administrator sessions cannot connect as customer sessions. Use a customer account or guest workspace.

## Sign in and use your account

The Account tab has a native email/password login and an eight-digit email-code option. Sign in with the customer email already invited to your galleries. Complete the website security check in the verification sheet, then tap Continue sign-in; do not submit another login on that page. The app sends the credentials to the existing authenticated login API and saves only the verified session in Keychain. Account lists the galleries available to the current user. Owner administrator accounts still require their existing owner/MFA workflow and cannot connect as customer sessions.

## View galleries assigned to your email

Open Galleries, tap Sign in to my galleries, and use the native password or email-code login. Alternatively, sign in from Account. The app loads accessible galleries and displays each gallery name above its photo grid. Guest workspaces without an email do not receive invited galleries. Select photos in a gallery and tap Create magnets for native ordering with pack selection, quantities, crop controls, review, and Shopify checkout. Photos remain associated with their source gallery and are never uploaded again. Orders contain photos from one gallery at a time. Use Gallery tools for downloads; sign out under More to change accounts. Closed, hidden, revoked, and expired-access content remains unavailable under the existing backend permissions.

## Phone acceptance checklist

- Test camera permission denial and Settings recovery, front/back camera, retake, and imports including portrait HEIC images.
- Crop portrait/landscape photos at each edge. Verify selected quantities equal the pack count and previews match printing crops.
- Quit/reopen and confirm photos, quantities, crop positions, pack, and permission choice persist.
- Disconnect during upload, reconnect, and retry. Confirm ordinary retries reuse completed uploads and the selection reference.
- Open checkout twice for an unchanged draft; confirm the received link reopens. Change a crop/quantity or start a new order and confirm a new selection.
- Test guest/customer connection. Use an email with two assigned galleries; confirm each grid contains its own photos, tap for larger previews, and pull to refresh. Sign out, connect a different email, and confirm prior galleries disappear. Verify expired/revoked galleries and hidden photos are unavailable. Test download to Files, inquiries, and sign-out. Confirm another session cannot see prior checkout links.
- Verify Shopify receives the pack and selection reference without private photo URLs. For payment testing, confirm the paid order reaches fulfillment and crop settings match.
- Remove a photo and confirm its app-owned upload copy is also removed. This does not delete Apple Photos originals or photos already uploaded for orders. Uninstalling removes local photos/drafts, but not cloud order records.

## Validation status

Verified against live gallery API contracts and the existing website crop/export formula. Seventeen backend contract checks passed for product packs, invalid quantities/variants, price mismatch, checkout metadata, and checkout host rejection, using mocked Shopify responses without purchases. Project references, plist/scheme XML, images, and Swift grammar are checked separately.

The workspace runs Linux: an Apple SDK compile, login inside WKWebView, physical camera, and end-to-end payment/fulfillment test could not run here. Complete the checklist before release. App Store submission, account deletion UX, social feeds, notifications, and custom camera filters remain separate work.

Repository folder: ios/ElunoraCustomer on development/customer-mobile-app.

## v3.7 testing and performance

Gallery metadata loads in batches of four concurrent requests instead of sequentially. Preview requests reuse in-flight work and a 40 MB memory cache with a 60-second reuse window; nothing is written to a disk photo cache. Explicit refresh and session changes clear the cache. This reduces repeat requests but first-load speed still depends on connection and server processing. Actual timing has not been measured on a phone here.

Test native password login, incorrect passwords, email-code delivery/verification and expired security tokens. Restart to verify remembered sessions. Test switching customer emails and sign-out to ensure gallery drafts, previews and checkout links from the prior session disappear. Select images in two different galleries, order each separately, and retry the same unchanged selection to verify it reuses its checkout reference. Check crops against fulfillment; gallery originals are unchanged. Revoked access must fail at the backend before checkout.

This version adds no backend deployment or schema change. Linux grammar/project checks and mocked API contract checks do not replace an Xcode compile and physical iPhone testing of login, verification and payments.

## v3.7 gallery tap fix

Thumbnail image and preview-button hit areas are explicitly bounded to the visible image frame. This prevents scaled images from intercepting taps on Select or on another row. Test portrait and landscape thumbnails: Select must toggle Selected without opening a photo; tapping the thumbnail must open that photo. Test Select photo in Create magnets as well. Physical-device tap testing still needs confirmation.

## v3.7 single sign-in flow

Native password/email-code login shows only the existing security challenge in its verification sheet. The website login form and navigation are hidden there; challenge validation remains unchanged. Successful login returns to the native account/galleries without requesting another sign-in. Gallery tools reuse the app session and omit the Connect to app prompt when already signed in. Test security verification, password and email-code sign-in, and opening Gallery tools on your phone. The DOM integration is scoped to the exact trusted gallery page; website markup changes may require an app update.

## v3.7 dedicated verification page

The sign-in verification sheet now loads /pages/app-security, containing only the security widget, status and retry control. It never loads the client gallery login page. The page HTML is included as AppSecurityPage.html and was created on Shopify separately. Keep this page available for app sign-in. Its public site key is the existing gallery-login site key; no secret is present. Passwords remain in the native app and are submitted to the existing Auth API. Test on a physical phone; verification cannot be completed automatically here.

## v3.7 branded inline login

Login uses the Shopify gallery palette: warm paper #F4F2EF, cream card #E8E5D9, olive #4A4B36, restrained borders, serif heading, and bundled AE monogram. The security widget is embedded directly in this native login screen. There is no separate verification sheet or Continue sign-in action. Enter credentials, complete the inline widget, and tap Sign in (or Send sign-in code). The widget still uses WKWebView as required by Cloudflare, loading the existing dedicated verification page under the app interface. Source: https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/ . Custom Brown Carolina font files are not included in this customer project; system serif is used for headings. Test widget success/expiry/retry, incorrect credentials, email codes, small screens, keyboard and large text on a phone.


## v3.8 — private event uploads

- Open Capture → Join an event (also Galleries → Your event uploads).
- Scan the existing event sharing QR inside the app, or paste its complete HTTPS sharing link. No short-code service or system Camera universal-link handoff is added in this version.
- Review the event name and notice, consent, and tap Join event.
- Take/import photos, return to Event sharing, select photos, and Upload. Keep the app open while uploading. Retry selected photos after a connection failure; saved reservation IDs prevent duplicate reservations.
- Your event photos shows only submissions from this app's private event session, including pending host review. Refresh reloads previews and authorization. Existing host moderation, upload limits, closing dates, and QR revocation remain server-enforced. Uploading does not queue a print.
- Leave event stops the active connection. Scanning the same valid QR again on this phone/profile restores that session. A rotated QR creates a new connection.

Security: QR invitations are never reused as guest session credentials. The app generates an independent 256-bit random token, stores it in device-only Keychain, and calls only the existing session-scoped experience routes for event browsing/uploads. It never claims whole-gallery access. Studio and upload-later links are rejected in this flow. Signed preview URLs use ephemeral networking with no disk photo cache. Switching account profiles clears event images and cancels in-flight networking; sessions are separated locally by account profile. Account invitations continue to grant their separately configured full-gallery access.

Event ownership is session-based, just like the existing QR uploader: website uploads, another phone, or a different app account profile do not automatically share this event photo list. This build does not add account-wide recovery/sync of QR guest sessions. Keep the same bundle ID to preserve the connection when updating.

### Device acceptance test

1. Build/run on two iPhones (or one iPhone and a separate browser session). Join the same event QR on both.
2. Upload a distinct photo from each. Each guest must see only their own upload; the host dashboard can see both.
3. With moderation enabled, verify the app displays Awaiting host review, then Shared after host approval and Refresh. Reject a photo and Refresh: it must disappear.
4. Turn off connectivity during upload; reconnect and retry. Verify one host submission per selected photo, and that reopening the app/rejoining the same QR restores this session.
5. Leave, rejoin, and switch app accounts: verify event previews clear and another profile cannot see the prior profile's submissions.
6. Disable, expire, or rotate the event QR in the dashboard. Refresh/upload with the old session must fail and clear its gallery; the new QR can join.
7. Deny camera access or use the simulator: paste the link to join. Test normal photo capture/import and existing magnet checkout for regressions.

Validation here: Swift syntax and project references checked; backend contract tests exercise two-guest filtering, pending/approved visibility, refused whole-gallery claims, invalid sessions and revoked sessions. Live database function definitions were inspected read-only. No live event/photo/account records were created for testing. Xcode compilation, camera scanning, real uploads and device UI remain to be tested on a Mac/iPhone.


## v3.9 — import brand fonts and preserve readable weights

Open Account → App fonts → Import font files. Select one or more OTF/TTF files in Files/iCloud Drive. Choose separate faces for headings, body text, and buttons/capitals. Files and choices persist locally across launches. Restore system fonts resets choices without deleting your imported files.

Font registration uses each file's real PostScript name. Real weight metadata determines which faces are offered for body text and emphasis. Thin/light faces are available for headings; regular faces for body text; Medium/Semibold/Bold faces for emphasis. If no heavier face exists, buttons and capitals use system semibold, not an ineffective `.bold()` modifier on a thin custom face. The ATELIER ELUNORA label is now 16-point with reduced tracking (0.8), and all custom fonts scale with Dynamic Type. No synthetic stroke/outline is applied to the brand font.

The live preview includes all capitals, mixed-case text, numerals, the capture button and checkout label. Check Brown Carolina's capitals on your actual iPhone before choosing it for release. Font metadata cannot establish optical readability by itself. A variable font's default face is imported; this version does not add a variable-axis weight editor. Import a static heavier edition if needed.

WOFF/WOFF2 are web font files and are rejected with an explanation. Obtain the original licensed OTF/TTF edition; renaming the extension does not convert the format. The app does not upload font files to a server.

Imports affect this installation. To distribute your fonts to everyone, add the OTF/TTF files to the ElunoraCustomer Xcode target with Copy items if needed and target membership checked; bundled OTF/TTF files are registered on launch. The selected default PostScript names should then be set for the release build after reviewing the actual files. No proprietary font files are included in this ZIP. Native app typography is configurable; Shopify/web content and system navigation controls retain their own typography.

Device checks: import your actual fonts; confirm face names and previews; select each role; visit Capture, Galleries, Event sharing, Order and login; relaunch and confirm restoration; enable a larger text size; verify the capture and checkout labels remain legible; import the same file twice; try an invalid file and a WOFF2 file; restore defaults. Static Swift syntax and all eight target source references checked here. Xcode compilation and actual font rendering need Mac/iPhone verification.
