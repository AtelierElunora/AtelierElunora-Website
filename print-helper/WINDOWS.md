# Windows print-helper setup

The same Atelier Elunora guest upload, gallery, owner controls and paid-order queue now have both Mac and Windows print adapters. This Windows adapter targets a 64-bit Windows 10/11 desktop with Node.js 22 or newer, .NET Framework 4.x and the installed DNP DS820A Windows driver. Confirm DNP support for your exact Windows version and computer architecture before deployment. ARM Windows and Windows services are not validated targets.

## Start and calibrate

1. Extract the complete source package to a private folder in your Windows account. Keep `print-helper` beside `theme/assets/atelier-station-core.js`. Do not use a shared/public folder for customer photos.
2. Install Node.js 22 or newer and the appropriate DNP printer driver. Connect the DS820A and confirm Windows can use it. This release does not install or change printer drivers.
3. Open `print-helper/Start Atelier Print Helper.cmd`. It installs the locked Node dependencies on first use. Open **http://127.0.0.1:4318** in your browser for the branded controls. Keep the launcher running while printing.
4. Under Printer setup, choose Find installed printers. Enter the exact installed queue name, including spaces. Choose Show printer paper options; enter the numeric code listed for portrait 8×12 paper. The helper rejects other dimensions and does not change the system default printer.
5. In Windows **Printer properties → Advanced**, enable **Keep printed documents** for this printer. This may require an administrator. The helper checks this setting before sending a job but does not change it automatically. Retaining jobs allows exact completion checks across restarts; remove completed jobs under your retention policy because spool files contain customer photos.
6. Select your licensed Brown Carolina TTF/OTF file if using wrap lettering. Save settings, print one calibration sheet, and verify the square measures exactly **3.75×3.75 inches** on both axes. Check cutter and pressed-magnet fit. Driver expansion/scaling settings must be physically checked; the software's exact 8×12 dimensions alone do not prove the printer applies them correctly.
7. Confirm calibration, paste the private event print-desk link from your owner app, and start printing. Guests continue using the public guest QR. Mac and Windows use the same event queue; use one active production station for an event and finish existing reservations before switching computers.

The helper compiles its included C# bridge with the Windows .NET Framework compiler on first use, caching it under `atelier-print-state/bin`. It uses the native Windows GDI printing API and does not need Acrobat, another PDF viewer, or a PowerShell execution-policy change. The generated bridge is unsigned; organizations that require signed/approved applications must review and package it through their normal process. Do not disable device security protections to run it.

Windows sheets are self-contained `.print.json` files holding 2400×3600-pixel PNG pages. The whole file is checksummed before submission. Windows applies the selected driver paper code, prints at physical 8×12 dimensions, and compensates for the drawing origin's hardware margins. Mac continues to use PDF and CUPS. This keeps the same layout, crop and wrap renderer across both operating systems.

## Completion and recovery

The native API returns the exact Windows job ID when it starts a document. The helper also checks a unique document name to avoid confusing unrelated or reused job IDs. Paused, error, offline, paper-out, deletion and intervention flags stop automatic progress. A missing job is not treated as a completed print. A job reported only as **sent to printer** requires operator review; only **printed** status advances to computer-reported completion. Even that status does not prove physical quality or pickup.

Pause requests are sent to the helper without forcibly terminating it, including on Windows. They take effect after the current operation; submitted jobs may finish. Close/restart recovery uses the same durable journal as Mac. An uncertain submission is never automatically resubmitted. Inspect Windows' queue and the physical output, reconcile the reservation in the browser print desk, and then archive the local current journal as described in `README.md`. Do not clear pending recovery state to make an error disappear.

Keep the PC awake and connected. Retained Windows jobs, prepared raster bundles and local receipts need a business retention policy; automatic cleanup is not included. Do not move a current journal between Mac and Windows: their printer receipts and prepared formats differ.

## What was checked

- Native C# compilation on Windows; read-only installed-printer enumeration and driver-media inspection.
- Native missing-job handling against an installed Windows queue; no test documents sent to that queue.
- Simulated adapter tests for exact job identity, error precedence, sent-versus-printed distinction, unrelated jobs and recovery without duplicate submission.
- Native canvas rendering of full/multiple 8×12 raster sheets and the calibration page; existing Mac PDF and recovery regression tests.
- Control/main JavaScript syntax and graceful-pause wiring. The development sandbox blocks Node child-process spawning, so the native bridge was compiled and exercised directly; Node-to-native launching remains an acceptance test on your normal Windows computer.

Still required: real DS820A full/partial/multi-copy output, paper/ribbon/offline errors, USB disconnect, sleep/restart, completion reporting, driver scaling and physical cutter calibration. The app has not been deployed, merged to main, or certified as a complete Ninemags replacement.

References: [Microsoft StartDoc job identity](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-startdocw), [Windows job-status meanings](https://learn.microsoft.com/en-us/windows/win32/printdocs/job-info-1), [retaining printed jobs](https://learn.microsoft.com/en-us/powershell/module/printmanagement/set-printer).
