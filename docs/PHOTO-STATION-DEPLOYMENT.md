# Photo station deployment — September 20, 2026

## Live database
Applied on the existing Atelier Elunora Gallery project with user approval to skip paid staging.
- event_photo_station: deployed migration version 20260920025307
- photo_station_zoom: deployed migration version 20260920025317

The repository migration filenames are reconciled to these actual versions. They replace the original pre-deployment filenames 20260920020218 and 20260920023850. Do not apply both sets.

Service-role transaction test passed capture reservation, duplicate finalization, queue creation, zoom, claim and print confirmation, then rolled back all test records. New tables have RLS enabled and no anon/authenticated privileges. All four RPCs are SECURITY INVOKER and have no anon/authenticated EXECUTE. Security advisors reported only three informational RLS-without-policy notices, intentional for these server-only tables: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## API rollout
Version 15 failed startup smoke checks and was immediately restored to the exact backed-up version-14 bundle as version 16. A corrected candidate was verified separately: station requests returned the intentional 503 disabled response, and unauthenticated owner requests returned 401.

The corrected candidate is deployed as gallery-api version 17, bundle checksum 84c6ac26d36c84b247ad6c60984904f7a55954ad702bc5d8b96e6a68748c6474.

The candidate loads the image engine lazily and uses station-rollout.mts with photoStationRolloutReady=false. It does not mutate Deno environment variables at startup. Enabling requires both this code gate and PHOTO_STATION_ENABLED=true after the UI is ready. Do not treat an environment-variable change alone as activation.

## Shopify blockers
- Published theme: v1.30 Service Area & Travel, ID 191726092576.
- Latest unpublished package/theme work: v1.31 Photo Station, ID 191736709408.
- Request to duplicate v1.31 returned newTheme=null with no userErrors. Follow-up listing showed no new theme. No theme file writes or theme publication were performed.
- Registered Atelier Elunora Galleries app (client ID in shopify.app.toml) has installation=null for this store.
- Developer dashboard was blocked at connection verification. Shopify CLI config validation could not authenticate: device_authorization proxy tunnel timed out. No app deployment or installation was performed.
- No photo-station page or private acceptance event was created. No capture/print capabilities were issued.

## Rollback
Redeploy the 15 original version-14 source files from the saved deployment backup with index.ts, deno.json and verify_jwt=false. Leave the new database tables and migration history intact; the old API ignores them. This preserves any later photo/queue history. Dropping tables is not the routine reversal and requires separate data review.

Physical camera/printer acceptance and MFA-protected end-to-end capture remain outstanding.

## Final verification boundary
Supabase reports live gallery-api version 17 ACTIVE with verify_jwt=false, the exact bundle checksum tested on the isolated endpoint, and photoStationRolloutReady=false. The final direct live HTTP checks timed out from this environment; the browser check was blocked by the browser client. Therefore final live HTTP/end-to-end acceptance is not complete. Do not enable capture until these checks can be completed.

The temporary gallery-api-photo-station-check function was neutralized as version 3: verify_jwt=true, a single 404 response, and no gallery/database code.

## Follow-up checks and owner build fix
Both live HTTP checks now pass: station returns 503 with the deliberate disabled message; unauthenticated owner/events returns 401. This resolves the earlier final HTTP timeout uncertainty, but does not replace MFA-protected end-to-end acceptance.

Fixed PhotoStation.jsx to use the same explicit Preact JSX factory as AppHome.jsx. A new simulated-DOM mount test loads the panel, verifies the queue, and creates a capture link. The prior syntax bundle check alone did not exercise rendering.

Shopify CLI authentication still fails at device_authorization from this environment. A second themeDuplicate request again returned newTheme=null and no errors. No new theme or page was created. Prepare-Owner-App.cmd now provides a Windows path through dependency installation, tests, Shopify authentication, build, and upload of an unreleased app version. Release, installation, theme integration and acceptance remain outstanding.
