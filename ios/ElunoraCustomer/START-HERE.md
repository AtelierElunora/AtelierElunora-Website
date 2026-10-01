# Atelier Elunora — native iPhone app, v3.3

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

## v3.3 testing and performance

Gallery metadata loads in batches of four concurrent requests instead of sequentially. Preview requests reuse in-flight work and a 40 MB memory cache with a 60-second reuse window; nothing is written to a disk photo cache. Explicit refresh and session changes clear the cache. This reduces repeat requests but first-load speed still depends on connection and server processing. Actual timing has not been measured on a phone here.

Test native password login, incorrect passwords, email-code delivery/verification and expired security tokens. Restart to verify remembered sessions. Test switching customer emails and sign-out to ensure gallery drafts, previews and checkout links from the prior session disappear. Select images in two different galleries, order each separately, and retry the same unchanged selection to verify it reuses its checkout reference. Check crops against fulfillment; gallery originals are unchanged. Revoked access must fail at the backend before checkout.

This version adds no backend deployment or schema change. Linux grammar/project checks and mocked API contract checks do not replace an Xcode compile and physical iPhone testing of login, verification and payments.
