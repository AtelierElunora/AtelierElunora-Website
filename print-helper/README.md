# Atelier Elunora Mac and Windows print helper

The new owner-controlled hands-free path is currently **simulation-first and local only**. See [implementation status](../docs/hands-free-printing-implementation.md). The instructions below describe the earlier native helper prototype, not an installed or hardware-accepted automatic service. Do not enable native automatic printing before printer selection and acceptance.

For Windows installation and driver setup, use [WINDOWS.md](WINDOWS.md). The first-setup steps below are for Mac; queue behavior and recovery apply to both platforms. Windows uses raster bundles and native spooler IDs; Mac uses PDFs and CUPS IDs.

This helper connects your existing event print queue to an installed macOS printer. The target profile is DNP DS820A with 8×12-inch media. Hardware/driver compatibility and physical dimensions must be tested on your Mac before live use.

## First setup

1. Keep this `print-helper` folder alongside `theme/assets/atelier-station-core.js` as in the repository; the renderer shares that file with the website.
2. Install Node.js 22 or newer and the DNP driver compatible with your Mac. Add the printer in macOS and verify an ordinary test print. This source release is not a signed Mac app or installer.
3. Open `Start Atelier Print Helper.command`. If downloaded permissions prevent opening it, from this folder run `chmod +x "Start Atelier Print Helper.command"`, then open it again. Alternatively run `npm ci` followed by `node control.mjs`. First-time installation requires internet access.
4. The branded control window opens at `http://127.0.0.1:4318`. Under setup, find installed printers, enter its exact queue name, show paper options, and enter the actual driver option for 8×12. Do not guess a driver media name.
5. For wrap lettering, enter the absolute path of your licensed Brown Carolina TTF/OTF file. Font binaries are not distributed with this source. Photo-only templates do not require this font.
6. Save settings, print one calibration sheet, measure both axes at exactly 3.75 inches, and check cutter fit. Disable scaling in the driver if necessary. Confirm calibration only after inspecting the physical paper; changing printer settings resets calibration.
7. In the owner app, open your event and create a private print-desk link. Paste it into the helper's Event connection field and start. Do not use the public guest QR link. The private link remains in process memory, not configuration files. It expires under the existing station rules (currently 12 hours).

Use one active helper/print desk per event. Keep the Mac awake and connected. Single-copy jobs batch six at a time; after two minutes the remaining eligible photos may print as a partial sheet. Multi-copy jobs retain their paid or operator-selected quantity and crop. Printed PDF geometry is 2400×3600 pixels at 300 PPI, embedded at exactly 8×12 inches. Driver borderless expansion still needs physical calibration.

Pause stops after the current operation; already submitted printer jobs may finish. CUPS job state 9 is recorded as **computer-reported completion**, which does not prove print quality or physical pickup.

## Recovery

The private `atelier-print-state` directory contains printer configuration, the current durable journal, prepared PDFs (Mac) or raster bundles (Windows) and completed receipts. `ATELIER_PRINT_STATE` can point to a different local private folder. Keep it on a local disk and preserve it through restarts. Do not copy it between running helpers or change printers mid-job.

- `prepared`: restarting revalidates the reservation/payment and file checksum before submission.
- `submitted`: restarting queries the same CUPS job; it does not submit another copy.
- `computer-completed`: restarting retries only the server acknowledgement.
- `submitting`: the printer may or may not have accepted the job. Automatic retry is deliberately blocked.
- A server reservation without a local journal also pauses. This can occur if the helper stops during image download or rendering.

For an uncertain or missing CUPS result: pause/close the helper, inspect the Mac printer queue and physical sheets, and use the browser print desk to confirm the reserved job/batch physically printed or return it to pending after confirming it was not printed. Archive `current.json` outside the active state directory only after that reconciliation; leave historical PDFs/receipts for review. Restart with the same event link. Never clear a journal or return a job to pending solely because the computer stopped responding.

A leftover `helper.lock` means another helper may still run. Confirm the process has stopped before removing only that lock file. A normal exit removes it. Do not delete the entire state directory to fix a printing problem.

Completed PDFs contain customer photos. After orders are reconciled and your retention period is satisfied, delete completed PDFs/receipts according to your business policy, leaving current recovery state intact. Automatic local retention cleanup is not included.

Command-line alternatives: `node main.mjs --setup`, `--calibrate`, `--confirm-calibration`, and `--run`. The latter reads the private link from standard input. The local control service listens only on loopback and requires its per-launch token and exact local origin for operations.
