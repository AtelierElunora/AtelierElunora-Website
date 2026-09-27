# Hands-free printing: simulation-first implementation

Status: implemented and tested locally on 22 September 2026. Not deployed to the live Shopify theme or production backend. Physical printer acceptance has not been performed. The printer is undecided; the first deliverable is simulation, as requested.

## Try it

From the existing application source, install its locked dependencies and run `npm run demo:dashboard`. Open `http://127.0.0.1:4174/?demo=1&simulation=1`, choose Events, open a sample event, then Print desk. The Hands-free printing panel opens automatically. This address works on the computer running the preview, not on a phone.

The simulation starts unpaired with 13 sample photo jobs. Choose Pair a print helper, then Connect simulated helper. The five-minute code is single-use; connection leaves printing paused. Start automatic printing: two full sheets complete without prompts; the final photo waits for the two-minute partial-sheet timer. Print waiting photos now sends it immediately. Add sample photos, pause/resume, and simulate a lost printer response to exercise manual reconciliation. Reprints create new simulated copies. Restarting the preview resets its sample queue; this demonstration is not a durable backend.

Simulation uses the actual durable worker and a fake printer. Database integration tests separately exercise the actual migration in isolated PostgreSQL-compatible PGlite. The demonstration never calls the production API, downloads customer photos, submits native jobs, or changes orders.

## Implemented application pieces

- Owner event Print desk panel: pairing, heartbeat, Start/Pause, force partial, finish one run and stop, adjustable partial delay, sheet history, manual resolution, event-photo reprints with reason.
- Owner MFA and event authorization remain required by the API. Five-minute single-use pairing creates a 12-hour event-scoped helper credential, with revocation. Helper image access is limited to reserved sheets.
- Atomic queue reservation, lease and fence; immutable sheet snapshots; artifact hash, attempt identity, and exact spooler job identity. Existing manual run actions cannot steal an active helper reservation.
- Durable worker never automatically resends an uncertain submission. It supports recovery after a known spooler receipt or lost completion response. Owner reconciliation archives the local reservation before future work.
- Completion distinguishes computer-reported and operator-confirmed output. Computer completion does not certify physical print quality.
- Mac Keychain/CUPS and Windows DPAPI/native spooler paths are implemented but not physically accepted. Current renderer is six slots on 8×12; it is provisional, not a promise of support for an undecided printer. DS620A layouts, other capacities and an installed/background-service package remain future work. Existing manual printing remains available.

## Manual fallback

Pause automatic printing. The existing manual print desk remains below the helper panel. A run with no attempted submissions can be returned to the manual queue. If any submission may have happened, inspect both physical sheets and the printer queue, finish missing sheets manually, then confirm the entire reserved run. Never release uncertain submissions to print again automatically. Reprints are explicit new copies and preserve history; commerce reprints still require paid-order review.

Finish one run & stop processes the current reservation, or one new reservation of up to 200 copies, including its partial sheet. It does not close guest access or promise to drain unlimited arrivals.

## Backend rollout, after review

Apply `20260922170726_hands_free_printing.sql` after the existing print-run migration. Deploy the updated gallery-api modules and dashboard asset together. Preserve the environment's existing runtime, secrets, CORS and checkout configuration. Do not replace production configuration with this local snapshot.

All flags default off:

- `PRINT_HELPER_ENABLED=true` enables the owner/helper endpoints.
- `PRINT_HELPER_SIMULATION_ENABLED=true` permits simulated helper configuration/submission on an isolated test backend only. Keep false in production.
- `PRINT_HELPER_NATIVE_ENABLED=true` permits native submissions only after physical acceptance. Keep false now.

The local interactive simulation needs none of these flags and no remote deployment. Pairing never starts printing. Do not expose a production simulation that could mark real queue jobs completed without physical output.

## Native acceptance still required

Choose the actual printer, OS, paper and driver first. Calibrate dimensions, margins, cuts, crop, wrap and font using real sheets. Verify exact-job completion, canceled job, paper-out, unplug/reconnect, network loss, process crash before/after submission, duplicate helpers and manual fallback. Missing spooler history must pause, not count as success. The current local helper retains unresolved artifacts; reconciled artifacts older than 24 hours are cleaned on worker exit. Windows credential encryption and printer enumeration were verified locally; physical acceptance and Mac credential storage still need testing.

## Verification

`npm run test:automatic` covers queue reservation, one-use pairing, leases, quantities, partial timers, pause, exact completion sources, private grants, reprints and uncertainty barriers. `node tests/automatic-print-dashboard.mjs` exercises the owner UI against the sample queue. Existing owner dashboard, manual print workbench, Mac adapter/rendering and Windows helper regression tests are retained.

This is a local implementation on the existing application snapshot. It is not a claim that the full helper is on GitHub main, deployed, packaged, or physically tested.
