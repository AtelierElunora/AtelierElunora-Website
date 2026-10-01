# Atelier Elunora — native iPhone app

1. Unzip this folder on your Mac.
2. Double-click **ElunoraCustomer.xcodeproj**. No Terminal, npm, Expo, Homebrew, or CocoaPods installation is needed.
3. In Xcode select the blue ElunoraCustomer project, then the ElunoraCustomer target.
4. Open Signing & Capabilities. Leave Automatically manage signing enabled and choose your Apple team (Personal Team is sufficient for local testing).
5. If the bundle identifier is unavailable, change it to a unique identifier such as com.alexandermace.elunoracustomer.
6. Connect and unlock your iPhone, trust the Mac when prompted, and select your iPhone in Xcode's device menu.
7. Enable Developer Mode on the phone if Xcode requests it, then press Run (the triangle).

Requires Xcode with an iOS SDK compatible with your phone; minimum app target is iOS 17. If Xcode asks for device support updates, install them. Local signing may need renewal depending on your Apple account.

## What to test

- Capture: tap Take a photo, allow camera access, take a picture and tap Use Photo. The standard iPhone camera screen offers front/back switching and retake.
- Import: Choose from phone accepts up to 12 images at once. Imports retain selected image bytes, and captured images are saved as high-quality JPEGs.
- My photos: view and remove photos; quit/reopen the app and confirm kept photos remain. These are private app copies; removing them does not delete originals in Apple Photos. Uninstalling the app removes app-owned photos.
- Explore: opens the store, galleries, packages, and contact pages inside Safari's secure in-app browser. Website login/ordering uses the current website flow. App photos are not transferred to website checkout yet.

This is a native SwiftUI starter with a bundled AE monogram and icon. Custom licensed fonts, crop controls, native gallery/account access, and ordering from saved app photos are still pending. No external packages or backend deployment are included.

Validation here covers project parsing, file references, plist/scheme XML, and image assets. A Mac/Xcode compile and a physical iPhone test could not be run in the Linux build workspace; the first Xcode build still needs confirmation.

Repository folder: ios/ElunoraCustomer, on development/customer-mobile-app. The existing operator capture app is separate.
