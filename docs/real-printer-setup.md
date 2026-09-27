# Connect a real printer

Status: local source implementation, not deployed to the live owner app or backend. Native automatic mode remains disabled pending physical acceptance.

## Windows

1. Extract the helper package, keeping the `print-helper` and `theme` folders together. Install Node.js 22 or newer if needed.
2. Open `print-helper/Start Atelier Print Helper.cmd`. The launcher installs its locked dependencies on first run. Open `http://127.0.0.1:4318` on that same computer.
3. Use **Find installed printers**, choose the actual printer, and show its paper options. Only compatible 8×12 options are offered by this version. An empty list means another layout is required; do not substitute Letter or A4.
4. Save the printer settings. Choose **Print one calibration sheet** to send one physical print. Measure the 3.75-inch square and check the cutter fit. Check the exact test job and confirm its physical result.
5. After the owner/backend release is deployed, generate a code in the live event Print desk and paste it into **Pair helper**. A simulation code cannot pair a real helper.
6. Once the calibrated profile has passed hardware acceptance and native mode has been enabled, choose **Connect validated printer to dashboard**, then **Start automatic printing** in the owner dashboard.

The pairing connects the event to this computer. Printer selection happens in the helper, which talks to the installed driver. Credentials are protected by Windows DPAPI for the current Windows user; Mac uses Keychain. Pairing does not submit print jobs. Keep the helper and computer running. Manual printing remains available.

## What was actually verified

The Windows native bridge compiled successfully. Installed-printer enumeration and an encrypted credential round trip succeeded on this computer. The listed physical printer is HP OfficeJet Pro 8020 series. Its installed driver returned no supported 8×12 media option. No physical sheet was submitted and no printer settings were changed.

Automated checks pass for printer/media choices, unsupported paper exclusion, dashboard simulation, native-mode gates, exact job identity, error handling, rendering and duplicate-submission protection. These checks do not replace a physical print test.

To use the HP printer, implement and calibrate a matching supported layout first. To use a future 8×12 printer, install its correct driver, select its genuine 8×12 media and perform physical acceptance. The existing six-slot 8×12 sheet must not be shrunk to another paper size.

## Letter connection test

On Windows, select the installed printer, then choose **Print one Letter connection test**. This sends a single 8.5×11 sheet containing a 3.75-inch square without scaling. It bypasses the retained-job requirement only for this explicit one-page test; physical confirmation is required. It does not authorize Letter for the automatic queue or change the saved 8×12 profile. A test was submitted to the HP OfficeJet Pro 8020 as Windows job 3; physical output still needs confirmation.
