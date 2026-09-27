## Latest update: iPad camera and brand fonts

The main capture button now opens the iPad camera (front by default, with Apple's camera-switch control). Camera permission is requested before opening. Taking a photo returns to the branded review screen; approval reuses the existing event submission and durable retry path. Photos are redrawn upright, resized to at most 2400 pixels on the longest edge, and compressed below 4 MiB. Generated test photos remain available in Station setup. Canon capture and automatic Canon-failure detection are not implemented yet.

Download the updated branch as a ZIP. Separately unzip the private Elunora-App-Brand-Fonts.zip supplied in chat and copy BrownCarolinaSans.otf and EdwardianScript.otf into ios/ElunoraCapture/ElunoraCapture/BrandFonts. That folder is already included in Xcode's resources. The fonts register at app launch using their actual PostScript names. Edwardian was unpacked from the provided WOFF to native OpenType. Font binaries are excluded from the public repository.

Open the updated Xcode project, choose the same signing team and bundle identifier as your current installation, and Run on the iPad. Do not uninstall an app with a pending photo. Verify fonts, camera permission, front/rear switching, cancel, portrait/landscape orientation, review/retake, and a submission to a dedicated test event. Test a network interruption and confirm retry produces one photo/job. Camera permissions and native capture still require physical-device testing; this Linux environment cannot compile the Apple SDK.

---

> Deployment update, September 26, 2026: native station support is now deployed to gallery-api version 53. It was patched onto live version 51 to preserve newer production features. Native access is enabled by default in that deployment and can be disabled with NATIVE_CAPTURE_ENABLED=false. The historical deployment notes below describe the initial prototype; do not deploy this branch's older full backend over production. The onChange deprecation warning is also fixed. Physical iPad test-photo rendering has been confirmed by the owner; live upload and Canon capture still require device testing.

# Elunora Capture — iPad prototype 0.1

First development milestone for the iPad (9th generation) + Canon EOS R100.
This is NOT event-ready. It contains a native SwiftUI screen, USB camera discovery,
a generated test photograph, event-link validation and approval/upload through the
existing gallery station endpoint. It does not yet trigger the R100, download its
JPEGs, display live view, or use the iPad camera.

## Open on your Mac

1. Download this branch or check out `development/ipad-camera-prototype`.
2. Open `ios/ElunoraCapture/ElunoraCapture.xcodeproj` in Xcode.
3. Select the ElunoraCapture target → Signing & Capabilities → choose your Apple
   development team. Change the bundle identifier if signing requires it.
4. Connect and unlock the iPad. Trust the Mac if prompted. Enable Developer Mode
   in Settings → Privacy & Security if Xcode requests it.
5. Select the iPad as the run destination and press Run (triangle).

No package manager, Canon SDK, or third-party Swift dependency is needed.
Minimum deployment target is iPadOS 17. A simulator can exercise the screen and
local test photo; USB camera discovery requires a physical iPad. Personal-team
signing is suitable for initial device testing, not unattended event distribution.

## First test — no camera or server deployment needed

Tap **Create test photo** without connecting an event. A clearly labeled test
image appears locally; nothing is uploaded. Scan for cameras to exercise the
permission prompts, though no camera is expected until the R100 is connected.

## Test the automatic workflow

The current server requires a browser Origin. The included backend change permits
Origin-less native POST requests to the exact station endpoint only when the new
`NATIVE_CAPTURE_ENABLED=true` environment flag is enabled. This change has NOT
been deployed or enabled by this prototype. The existing `PHOTO_STATION_ENABLED`
flag must also be enabled. Native requests still require a valid station token;
expiry, revocation, purpose and event scoping remain enforced by stationRequest.
Browser-origin requests retain the existing allowlist, including rejection of
`Origin: null`. No CORS wildcard, owner access, or client service key is added.

After review, deploy gallery-api with the included handler and station-origin
module and enable the native flag using the normal deployment process. Disable
the native flag to turn off native access without affecting browser stations.

1. Create a dedicated test event in the owner app and generate a capture link.
2. Pause automatic printing or use a test print station. This test intentionally
   inserts a real gallery photo and a real print job.
3. Paste the full capture link into the native app and tap Connect test event.
4. Confirm the displayed event, create a test photo and approve it.
5. Verify the photo appears in that event's gallery and print queue.
6. Test an interrupted upload: disconnect network before approving, restore it,
   and retry. Verify only one photo and print job exist. Force-quit after failure,
   reopen, and retry again to test saved-photo recovery.

Pending JPEG, event token and request UUID are stored together in the app's
Application Support directory, with complete file protection and excluded from
backup. They are removed only after a confirmed receipt or a pre-upload retake.
After any upload attempt, retaking and switching events are blocked to avoid
losing an uncertain submission. An expired/revoked token may require operator
recovery; this build has no export/recovery UI. Do not use for real guests yet.
Tokens are not logged, embedded in source, or sent to user-provided endpoints.
The prototype only generates a small test JPEG. The future Canon pipeline must
normalize orientation and downsample/compress to the endpoint's 4 MiB limit;
it must not assume an original full-resolution R100 JPEG fits.

## Camera arrival test

Use the Apple Lightning to USB 3 Camera Adapter, connect its Lightning power
input, then use a USB-A to USB-C **data** cable to the R100. Power the camera
separately. Unlock the iPad, allow wired accessories/camera permissions, and tap
Scan for cameras. Record whether the model appears and whether removal and
reconnection are detected. Detection alone does not establish shutter support.

Next camera milestones: open an ImageCaptureCore session, inspect capabilities,
implement and verify Canon remote shutter/JPEG transfer, then live view,
autofocus, reconnect handling and prolonged operation. No undocumented Canon
commands are issued by this build.

## Validation

Run `npm run test:native` from the repository root for native request boundaries
and existing station submission/retry tests. These use test doubles; they do not
send photos to production.

On the Mac, compile before attempting device installation:

```sh
xcodebuild -project ios/ElunoraCapture/ElunoraCapture.xcodeproj \
  -scheme ElunoraCapture -sdk iphonesimulator -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

The development environment used to prepare this commit is Linux and has no
Xcode/Apple SDK. Swift compilation, signing, physical iPad permissions, live
submission and R100 communication have not been verified. Backend tests passed;
they are not evidence that the iOS build compiles or that Canon capture works.

References:
- https://developer.apple.com/documentation/imagecapturecore
- https://developer.apple.com/documentation/imagecapturecore/icdevicebrowser
- https://support.lumasoft.co/en/articles/12831712-lumabooth-supported-cameras-and-camera-setup-guide-for-webcam-canon-sony-and-nikon
