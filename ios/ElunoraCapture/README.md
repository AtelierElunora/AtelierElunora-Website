# Elunora Capture — iPad prototype

Branded native iPad capture for Atelier Elunora's event gallery and print workflow.
The iPad camera is the default; experimental Canon USB controls are optional.
Minimum deployment target: iPadOS 17. No third-party Swift package or Canon SDK is needed.

## Guest capture countdown

Tap **Capture** once to take a photo automatically after the countdown (5 seconds by
default). Station setup offers Off, 3, 5 or 10 seconds and a front/rear iPad lens choice;
settings persist between launches. The iPad shows its live camera preview behind the
countdown. Canon live view is stopped before the countdown to serialize USB commands.
The generated test photo also uses the countdown.

Cancel before the shutter, leave the app, or disconnect the Canon to cancel the timer.
Returning to the app does not resume a cancelled capture. After a photo, the existing
review/retake/approve flow applies. No timer automatically uploads a photo. Camera
startup, autofocus and shutter latency may add time beyond the displayed countdown.

On the physical iPad: verify default five-second auto capture without a second shutter
tap; test 3/10/Off, front/rear, Cancel near zero, rapid tapping, background/resume,
rotation, retake, approval and upload. For Canon also test disconnect during countdown
and starting capture while live view is running. R100 verification still awaits hardware.

## Current features

- AE branding, custom fonts and native front/rear iPad camera capture.
- Event capture-link connection, photo review and approval.
- Upright JPEG conversion, longest edge at most 2400 pixels, upload below 4 MiB.
- Saved pending photo and idempotent submission retries.
- Experimental Canon session discovery, physical-shutter JPEG transfer, standard PTP
  shutter, EOS shutter/autofocus and live view, with diagnostics and timeouts.
- iPad selection after Canon disconnection; no automatic second exposure on failure.

**Canon hardware behavior remains unverified.** Some EOS cameras need additional
model-specific live-view and transfer commands. Follow [CANON-TESTING.md](CANON-TESTING.md)
for staged R100 tests. This prototype is not yet validated for unattended events.

## Install or update on your Mac

1. Download/check out `development/ipad-camera-prototype`.
2. Preserve your private `BrownCarolinaSans.otf` and `EdwardianScript.otf` files in
   `ios/ElunoraCapture/ElunoraCapture/BrandFonts`. Font binaries are not in this public repo.
3. Open `ios/ElunoraCapture/ElunoraCapture.xcodeproj` in Xcode. Keep the same signing
   team and bundle identifier as your current installation.
4. Connect/unlock/trust the iPad, choose it as the destination, and Run.
5. Verify iPad capture, review/retake and submission using a dedicated test event.
   Do not uninstall an app with an unsent photo.

The simulator can compile/display the app but cannot verify physical camera access.

## Workflow and recovery

The owner has confirmed native test-photo submission, printing and gallery delivery.
Approved photos enter the existing event gallery and print queue. Use a dedicated test
event and pause printing while testing. Refresh the gallery if needed.

The pending JPEG, event token and request UUID are saved with complete file protection
and excluded from backups. After an upload attempt, retaking/switching events is blocked
until a confirmed receipt, preventing a retry from creating a new submission. Test
network interruption/retry and app restart before event use. There is no pending-photo
export/recovery UI yet.

## Backend deployment note

Native station support was deployed to `gallery-api` version 53, patched onto the live
version 51 to preserve newer production features. Native access is enabled there and
can be disabled with `NATIVE_CAPTURE_ENABLED=false`. **No backend deployment is needed
for the Canon changes. Do not deploy this branch's older full backend over production.**
Event-token scoping, expiry and revocation remain enforced; no client service key is used.

## Validation

Protocol tests and the unsigned simulator build passed for commit `277e18d` on
September 27, 2026. Physical R100 capture remains untested.

The GitHub Actions `iPad capture build` workflow runs protocol codec checks and an unsigned
simulator build. These checks do not establish physical R100 compatibility or iPad signing.
Run locally on a Mac:

```sh
swiftc ios/ElunoraCapture/ElunoraCapture/CanonPTP.swift \
  ios/ElunoraCapture/ProtocolTests/main.swift -o /tmp/elunora-ptp-tests
/tmp/elunora-ptp-tests
xcodebuild -project ios/ElunoraCapture/ElunoraCapture.xcodeproj \
  -scheme ElunoraCapture -sdk iphonesimulator -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

`npm run test:native` covers existing server request/submission boundaries using test doubles.
