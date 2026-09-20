# Setup and restoration

## Shopify theme

`theme/` contains the published theme's text source, including current settings and templates. It is store-specific. Use an authenticated Shopify CLI to work against a new unpublished theme. Restore the assets listed in `excluded-theme-assets.json` from your authorized original assets before attempting a complete theme build/push. Font files must stay out of this public repository. Store products, pages, navigation, hosted Files, app installations and app-managed data are not exported by a theme-source snapshot. Preview and test before publishing.

## Owner app

From `shopify-owner-app/`, install the pinned dependencies with `npm ci`. Use your authenticated Shopify developer account and Shopify CLI for preview/build/deploy. Existing client ID and extension UID are public identifiers retained from the supplied archive, not passwords. Supabase URL/public client key and store-specific URLs in client code also need review when moving to another environment. Preserve secret values in environment settings, never source files.

The owner app's original README and START-HERE instructions are historical and predate later improvements; current imported source is authoritative. The supplied archive contains a registered app configuration and upload/workflow modules. A fresh build and live admin acceptance test were not run as part of this source import.

## Database

The migration filenames and SQL come directly from `supabase_migrations.schema_migrations`, in recorded order. Existing statements were exported rather than generating new migrations. They include tables, RLS policies, functions, triggers and storage-bucket definitions. They contain no customer rows or owner-account seed.

For a new environment, provision Supabase first, then apply these migrations in version order using an authenticated, reviewed migration workflow. Do not replay the full history against the existing production database. No fresh-database replay or drift comparison against catalog objects outside migration history was performed during import.

Set up authorized owner membership privately after creating the owner account; never commit real user IDs as seeds. Configure authentication URLs, email templates, SMTP, CAPTCHA and MFA in Supabase. These dashboard settings are not captured by SQL migration history.

## Edge functions

Deploy the two function folders independently after testing. Each includes its deployed `deno.json`. Both deployed functions had platform `verify_jwt=false`; authorization/signature checks happen inside their handlers. Preserve that setting deliberately in a future deployment; no deployment config or automatic workflow is created here.

Environment dependencies in existing code:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS` (JSON with `default`) or `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for privileged gallery operations
- `SUPABASE_SECRET_KEYS` (JSON with `default`) or `SUPABASE_SERVICE_ROLE_KEY` for payment recording
- `SHOPIFY_WEBHOOK_SECRET` for Shopify webhook signature validation

Supabase commonly supplies its own runtime variables. Configure the required values privately in each environment. Webhook subscriptions and any platform secrets are not copied by this repository. Do not expose service-role keys to browser or owner-app code.

## Verification

`node tests/activity-log.mjs` runs the preserved eight backend checks. The import also compared all 496 theme text files to API-returned contents (434 also matched Shopify MD5; 62 JSON files did not match the provided MD5 and are flagged in the manifest), compared function contents with deployed source, scanned for common credential patterns, and retained SHA-256 hashes in the source manifest. These are source-transfer checks, not a claim that a new installation or full customer workflow was tested.

## Ongoing changes

Commit future changes here and deploy intentionally to the correct platform. Changes made directly in Shopify or Supabase are not automatically pulled into GitHub. No GitHub Actions or production auto-deploy has been enabled.
