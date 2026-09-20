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

## Owner release and theme preparation follow-up
The user released atelier-elunora-galleries-10, opened the installed owner app, signed in, and confirmed both station buttons appear. This supersedes the earlier app-release/install blocker; the connector's installation=null does not override the observed owner UI.

Added only the four station files to the existing unpublished v1.31 Photo Station theme, ID 191736709408. No whole-theme archive upload occurred. Compared all 506 live-theme files against the preview's 510: 504 match by MD5, the remaining two snippets preserve the live content and add the previously requested photo-station package/FAQ wording. The four additions are the station assets and template. Existing theme settings, app embeds, and package changes were preserved.

Created draft page ID 165583847712, handle photo-station, templateSuffix photo-station. It remains unpublished until the theme is published; otherwise Shopify would fall back to the ordinary storefront template on the current live theme.

Verified the station template through the existing published packages page with preview_theme_id=191736709408 and view=photo-station. The standalone page has no navigation and carries noindex,nofollow and no-referrer. An uncredentialed visit asks for an owner-generated event link. Demo print mode loaded, accepted 2x zoom, and prepared a 1800x1200 sheet for two magnets. This uses synthetic demo data, not live event capture or physical printing.

Live rendering exposed app-embed injection despite layout none. Added an early Content-Security-Policy meta element: only the two exact station script asset URLs may execute; only the station stylesheet, project-specific Supabase connections/images, and local image/media sources are allowed. Inline scripts, other app scripts, frames, objects, and forms are blocked by the policy. Shopify may still insert inert embed markup. Verified the rendered policy precedes injected scripts and the station print UI works under it. See https://www.w3.org/TR/CSP3/#meta-element for meta-policy delivery limitations. Repeat these checks after publishing and after app/theme changes. Liquid validation passed using the tool's bundled documentation fallback.

Remaining: user publishes v1.31 through Shopify admin (connector blocks theme publishing); publish the prepared Photo Station page; verify the actual public route and policy; then deploy photoStationRolloutReady=true and set PHOTO_STATION_ENABLED=true. Both gates remain disabled/pending now. The Supabase connector has no secrets setter, so the environment switch may require the user's dashboard. Complete owner-MFA private-event capture-to-gallery-to-print acceptance, revoke-link checks, and actual iPad/Mac/DNP calibration before client use. Do not replay migrations.

## Published page and API readiness
After the user published the theme, verified v1.31 (191736709408) is MAIN and its four station files match the prepared versions. Published page 165583847712 and verified https://www.atelierelunora.com/pages/photo-station renders the standalone station, requires an event link, and contains the expected CSP, noindex/nofollow, and no-referrer policies.

Deployed gallery-api version 18 with verify_jwt=false and bundle checksum 30c5f84766ed0cf6f193acc725ca4f6a2a65d013f0c51ded41de85b2a6b60879. Compared fetched version 17 against the prior candidate before deploying and fetched version 18 afterward: only station-rollout.mts changed, setting photoStationRolloutReady=true. PHOTO_STATION_ENABLED must still explicitly equal true in the server environment. Existing authentication, MFA, CORS, and service-role protections are retained. Unauthenticated owner/events returns 401. Security advisors still show only the three intentional INFO notices for service-only RLS tables.

The connector cannot edit Edge Function secrets. The Supabase dashboard redirected this browser to sign-in, so activation requires the user to set PHOTO_STATION_ENABLED=true under Edge Functions > Secrets. No new public key or service-role key is needed. End-to-end private-event and physical-device acceptance remain outstanding.
