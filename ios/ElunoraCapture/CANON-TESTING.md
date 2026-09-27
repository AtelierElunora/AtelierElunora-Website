# Experimental Canon control — hardware test plan

This adds real ImageCaptureCore session/open/catalog/download code and PTP command
paths, not a simulated Canon camera. It has not been built with Xcode or tested
against an R100 in the Linux development environment. Treat all Canon functionality
as experimental until the tests below pass. iPad capture remains the startup default.

## Implemented

- Connect a Canon USB camera, open its session, wait for catalog readiness.
- Keep existing SD-card photos out of the capture pipeline.
- Arm a one-photo transfer from the physical shutter; receive one new JPEG.
- Query supported operations and request standard PTP InitiateCapture.
- Optional EOS remote-mode setup, autofocus, full shutter press and release.
- Optional advertised EOS live-view start/read/stop, with bounded JPEG extraction.
- Route the received still through the same durable review/upload flow as iPad photos.
- Stop scanning/sessions on background or disconnect. Return selection to the iPad.
- Bound command and photo-transfer waits; ignore callbacks from previous sessions.
- Display diagnostic messages, without event credentials or photo contents.

This does not use Canon EDSDK (which is not an iPad SDK). Command numbers and parameter
meanings were researched in the upstream libgphoto2 protocol definitions; no library
code is included. Canon model/firmware differences still require hardware testing.

## Deliberate limits

Live view must be stopped before shutter/focus/transfer. The EOS viewfinder path
only runs when the camera advertises operations 0x9151/52/53. Some EOS models instead
need EVF property setup and proprietary event/object-transfer handling; those paths
are not yet implemented. EOS GetEvent polling is intentionally avoided so it does
not consume events that ImageCaptureCore needs for its catalog. A shutter can fire
without its new JPEG appearing in that catalog: test physical-shutter transfer first.

No automatic second exposure occurs on timeout. The camera may already have taken
a photo, so check the card before retrying. An unavailable camera returns selection
to iPad, but the user must tap to take the next photo. RAW-only capture is unsupported.
Camera files are never deleted. Remote-mode setup is temporary to the connected
session; if camera controls stay locked after disconnection, power-cycle the camera.
The app does not change exposure, capture destination, or card settings.

## Before the camera arrives

1. Download the updated branch, preserve your private BrandFonts files and signing.
2. Build/Run on the iPad. Verify the default iPad camera still captures/submits.
3. Check Station setup shows the new Canon controls without crashing with no camera.
4. On the Mac, from the repository root, run the pure Foundation protocol checks:

```sh
swiftc ios/ElunoraCapture/ElunoraCapture/CanonPTP.swift \
  ios/ElunoraCapture/ProtocolTests/main.swift -o /tmp/elunora-ptp-tests
/tmp/elunora-ptp-tests
```

## When the R100 arrives

1. Charge/power the camera; insert a memory card; select single-shot JPEG or RAW+JPEG.
   Use the powered Apple Lightning camera adapter and a USB data cable. Close other
   apps that control the camera. Start with a dedicated event and printing paused.
2. Tap Connect Canon; wait for “Canon ready for testing.” Copy the diagnostic messages
   if it never reaches readiness. Permission must be allowed in iPad Settings.
3. Tap Receive next JPEG, then press the R100's physical shutter. Confirm exactly one
   new photo appears for review, in the right orientation, without importing old photos.
4. Approve it; check one gallery photo and one print job. Test retake and upload retry.
5. Select Use connected Canon with EOS commands off. Tap Take Canon photo. A rejection
   of standard capture is useful diagnostic information, not proof USB cannot work.
6. Enable Experimental EOS commands. Test autofocus, then shutter. Check the camera
   releases the shutter, creates one photo, and transfers the correct new JPEG.
7. Start live view. Confirm the image moves, stop it, then take a still. If live view
   fails, record the diagnostic and use the camera screen for framing while debugging.
8. Test unplug/replug, camera power-off, iPad background/resume, autofocus failure,
   a full card, denied permissions, and an interrupted transfer. Confirm the app can
   return to iPad capture and never silently loses an approved/pending photo.
9. Only after those pass: a sustained capture/upload session, then a print-enabled test.

Sources: Apple ImageCaptureCore documentation; gphoto/libgphoto2 camlibs/ptp2/ptp.h,
ptp.c and config.c (Canon EOS operations). These establish APIs/protocol conventions,
not guaranteed R100 compatibility on iPadOS.
