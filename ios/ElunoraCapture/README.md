# Elunora Capture — branded iPad-camera baseline

Recovered from commit `caf516d` during the September 27 production-source reconciliation. This is the iPad-camera/AE-monogram stage associated with the owner's successful camera, gallery-delivery, and printing reports. The exact build installed on the physical iPad cannot be verified remotely.

This baseline includes native front/rear iPad photo capture, Atelier colors and fonts, the AE monogram/app icon, event-link connection, review/retake/approval, JPEG normalization, and durable pending-photo retry. It does not include the later experimental Canon shutter/live-view implementation or capture countdown. Those changes remain on `development/ipad-camera-prototype` for hardware testing.

Open `ElunoraCapture.xcodeproj` on a Mac using Xcode and preserve the existing signing team and bundle identifier. Minimum target: iPadOS 17. Add the licensed `BrownCarolinaSans.otf` and `EdwardianScript.otf` privately to `ElunoraCapture/BrandFonts/`; they are excluded from this public repository. Do not uninstall an app with an unsent photo.

The live gallery API v53 source is now present in the main repository. No backend deployment was performed by this reconciliation. The native protocol continues to use event-scoped station tokens; no server credentials belong in the app.

The Linux reconciliation environment cannot compile the Apple SDK or verify the physical R100, iPad signing, camera permissions, or installed build. Device testing remains necessary before event use.
