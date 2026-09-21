# Hands-free event printing

Status: proposed design, not implemented or deployed. Extends the existing capture station, event gallery, saved wrap template, and print queue. Mac-first because that is the intended event computer; Windows support needs a separate printer adapter and testing.

## Event experience

Before guests arrive, the operator pairs the Atelier Print Helper with one private event, selects an installed printer and calibrated paper profile, checks a test sheet, then selects Start automatic printing. The helper remains running on the printer-connected computer; leaving the owner-app browser tab does not stop it.

Guests take and accept photos on the tablet. Eligible photos automatically enter a sheet using their saved crop and template. Full sheets submit without browser dialogs or routine operator confirmation. The helper processes one sheet at a time by default to keep errors manageable. Completed work leaves the active queue but remains available in recent print history.

Proposed controls: Start / Pause automatic printing; Print waiting photos now; Reprint selected photos or sheet; End event. Proposed setting: print a partial sheet after two minutes from the oldest eligible photo, enabled by default and adjustable. Pausing stops new submissions; it does not pretend to cancel a sheet already in the printer.

The owner app shows waiting photos, sheet fill (for example 4 of 6), sheets submitted, jobs reported complete by the computer, and Needs attention. Show photo-job, magnet-copy, and sheet counts separately. Reprinting increases copy and sheet totals without implying another unique photo was captured.

## Printer and layout profiles

Profiles contain printer identity, installed-driver media selection, orientation, printable bounds, measured scaling and registration adjustments, cut dimensions, and slot positions. Never shrink artwork to make it fit. Keep current wrap colors, Brown Carolina type, positioning, and cut guides.

Letter profile: six slots for cut sizes up to 3.6 inches only when the printer's measured printable area fits the layout; the 10.8-inch layout leaves little vertical margin. A 3.75-inch cut requires fewer slots (four geometrically fit Letter). Calibration must verify actual output and cutter fit, not just the canvas dimensions.

DS620A profile: separate 4-by-6 or 6-by-8 layout, not Letter. Geometrically, a 3.75-inch cut allows one square on 4-by-6 or two on 6-by-8, subject to driver and physical calibration. Batch capacity follows the profile. Current six-photo batch reservation must be generalized before this mode can support DNP media.

DNP's current specifications identify DS620A as a six-inch printer with a maximum standard 6-by-8 print: https://www.dnpphoto.com/products/printers/ds620a

## Helper and server responsibilities

The helper initiates outbound HTTPS connections to the existing API. Pair using an owner-authorized, short-lived, single-use code that yields an event-scoped helper credential. Store the credential in the OS credential store; no owner session or service-role key in the helper. Permit explicit revocation, expiry, and event closure. Pause on expiry with a clear owner re-pair action.

The API validates event access and profile eligibility, atomically reserves a batch, and grants one helper a time-limited lease with a fencing token. Browser and helper claims use the same reservation rules so two devices cannot claim the same photos. A submitted batch must not become automatically eligible again merely because its lease expires.

The helper downloads only the authorized batch, verifies required images and font, and renders an immutable PDF or raster sheet at the profile's exact physical dimensions. Use the same layout and wrap geometry as the print desk, with reference-render tests. Persist the sheet hash, batch ID, submission attempt ID and template/profile snapshots locally before submission.

Submit through a native printer adapter. On Mac, evaluate CUPS/IPP job submission and status monitoring with the selected installed driver. Preserve the returned spooler job ID. Track that exact job, not a generic printer busy state. No window.print, browser kiosk flags, or simulated success after a timeout.

## States and completion semantics

Track sheet states independently from legacy manually confirmed photo jobs:

| State | Meaning | Automatic action |
| --- | --- | --- |
| Waiting | Not yet assigned to a sheet | Fill next eligible sheet |
| Preparing | Reserved; sheet being rendered | Validate and persist artifact |
| Submitting | Durable local attempt recorded | Submit once |
| Submitted | Spooler accepted a job with an ID | Monitor that job |
| Completed by computer | Spooler reports completion | Archive sheet and continue |
| Needs attention | Failed, canceled, or outcome uncertain | Pause affected printer |

Computer-reported completion is not a guarantee of a physically correct print. Driver capabilities differ. Do not relabel it as operator-verified printed. Keep completion source in history: computer-reported versus operator-confirmed. If job-level monitoring is unavailable, an explicit alternative may continue after accepted submission while retaining the status Sent to printer. Missing job history alone never means success.

## Recovery and reprints

Maintain a durable local journal. On restart, reconcile batch attempt IDs and known spooler IDs with the API and spooler before submitting new work. If submission may have succeeded but its acknowledgment was lost, hold for review; do not automatically resend. Exactly-once physical printing cannot be guaranteed across an OS-spooler crash boundary.

Paper/ribbon errors, offline printer, rejected media, cancellation, and rendering errors pause new submissions and show a persistent alert in both the helper and owner app. Include a local audible alert with mute control. Avoid repeated transient-error alerts.

Internet loss pauses new cloud claims. The helper may finish a sheet already durably reserved and downloaded, recording its outcome locally for later synchronization. It must not reprint it when connectivity returns. Cloud-dependent guest uploads still require connectivity; this design does not promise offline capture upload.

Reprint uses an explicit new attempt linked to the original, with a reason and selected copies. Never silently turn a completed batch back into pending. End event offers printing the remaining partial sheet and stops new claims. Keep scoped credentials out of logs; expire local photo artifacts after a short documented recovery period.

## Implementation and acceptance gates

1. Add additive sheet/attempt history, counts, helper pairing, reservation and status endpoints. Preserve existing manual confirmation as fallback; do not rewrite historical printed states.
2. Implement helper with a simulated printer adapter and durable journal, then Mac native adapter. Generalize batch size and share rendering rules before enabling non-Letter profiles.
3. Add owner controls, heartbeat/connection state, counts, and recent-batch reprint actions.
4. Verify full and timed partial sheets, quantities, templates, two helpers competing, canceled jobs, out-of-paper, network loss, and a crash immediately before and after submission. Prove uncertain jobs do not resend automatically.
5. Calibrate with the actual printer, driver, paper, cutter and Mac version. Verify supported job-status reporting and sustained multi-sheet operation. Publish automatic mode only after those hardware tests; software simulation alone is insufficient.

No routine per-sheet confirmation in normal automatic mode. Operator involvement is limited to initial setup, consumables, cutting/crimping, and exceptions.
