# Verified owner-dashboard source and print helper — September 27, 2026

The owner supplied `Atelier-Owner-Dashboard-Source-2026-09-27.zip` and `Atelier-Print-Helper-4x6-Test-v4.zip` after the initial production reconciliation. Archive hashes and imported source hashes are recorded in `recovered-authoring-manifest.json`.

## Comparison with running code

Fresh reads of the seven relevant live Shopify assets/templates matched the production snapshot already on main. Installing the supplied root and owner-app lockfiles and rebuilding the recovered editable source produced:

| Rebuilt asset | Result |
| --- | --- |
| `atelier-owner-studio.js` | Matches production, ignoring only a final newline |
| `atelier-station.js` | Matches production, ignoring only a final newline |
| `atelier-experience.js` | Matches production, ignoring only a final newline |
| `atelier-upload-later.js` | Exact match |

The owner-studio CSS, owner page template, and shared station core also match the supplied archive byte-for-byte. Rebuilt assets were compared in memory; no live theme assets, backend files, migrations, or iPad code were replaced by archive copies. The archive contains older backend/theme files, so it was deliberately not imported wholesale.

## Helper comparison

Every helper file common to both archives is identical except `control.html`, whose v4 changes update instructions about pairing and dashboard confirmation. v4 also supplies the Mac `Enable Dashboard Launch.command` and `Start Atelier Print Helper.command` launchers. The shared `theme/assets/atelier-station-core.js` is identical to production.

The dashboard archive's additional helper support modules and documentation are retained, with the v4 files taking precedence. The helper uses the existing production automatic-print API, and the recovered API-boundary and simulation tests pass against main's captured production backend.

This establishes source/protocol compatibility, not a byte-for-byte comparison with the program installed on the owner's computer. No real printer was invoked. The supplied 4x6 test instructions explicitly say physical 4x6 and Mac output tests are still required; no new hardware compatibility claim is made.

## Validation

The four reproducible build comparisons pass. Twelve recovered test suites pass: `print-helper`, `windows-print-helper`, `four-six-helper`, `dashboard-launch`, `pairing-reconciliation`, `worker-lifecycle`, `automatic-print-api`, `automatic-print-simulation`, `dashboard-print-confirmation`, `dashboard-confirmation-ui`, `owner-dashboard`, and `gallery-handoff-session`. Existing production snapshot and applicable backend tests also pass.

```sh
npm ci
npm ci --prefix shopify-owner-app
npm ci --prefix print-helper
npm test
npm run test:recovered
```

`npm run verify:recovered` performs build comparisons without writing assets. `build:dashboard`, `build:station`, and `build:experience` use the recovered source and preserve the existing bytes when the only difference is a final newline. For intentional source changes they write the new bundle, which then requires provenance review before deployment.

The original `shopify-owner-app` extension release has not been independently inspected, but the shared modules imported here are demonstrated inputs to the matching custom dashboard build. Historical release documents are contextual records, not current deployment instructions. Private font files, credentials, signing, printer state, and customer data remain excluded.
