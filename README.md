# Photo station prototype update

Start with [docs/PHOTO-STATION-START-HERE.md](docs/PHOTO-STATION-START-HERE.md) for the new tablet capture and print workflow, deployment order, limitations and tests. This is an updated source package, not a deployed service. The original import manifest below describes the supplied baseline, not these new changes.

# Atelier Elunora website and gallery

Source consolidated on September 19, 2026 from the published Shopify theme, deployed Supabase functions, recorded database migrations, and the latest supplied owner-app archive.

| Folder | Contents |
| --- | --- |
| `theme/` | All 496 text source files from published theme v1.30 — Service Area & Travel |
| `shopify-owner-app/` | Latest supplied Shopify owner App Home extension, config and dependency lockfile |
| `supabase/functions/gallery-api/` | Deployed gallery API v14, including protected activity logging |
| `supabase/functions/shopify-gallery-payments/` | Deployed Shopify payment webhook v2 |
| `supabase/migrations/` | All 11 recorded database migrations, retaining their original versions and order |
| `tests/` | Existing activity-log backend checks, with import path adjusted for this repository |
| `docs/` | Setup notes, source inventory and excluded assets |

This import does not deploy anything or change the running website/database. This package is prepared for GitHub import; the initial upload was blocked by integration permissions. Automatic syncing or deployment is not configured.

See [setup and restoration](docs/SETUP.md) and [source inventory](docs/source-manifest.json).

Customer records, gallery storage, credentials, generated build bundles and dependencies are excluded. Six licensed fonts and four PNG branding assets remain in Shopify and are listed in `docs/excluded-theme-assets.json`. Built-in demo images embedded in the deployed gallery source are retained; no customer storage photos were imported.

This is not a full business-data backup. Shopify products/pages/app settings, authentication/SMTP/CAPTCHA settings, secrets, owner membership, guest accounts and storage data require separate handling. The older standalone Netlify gallery/owner portal was not located among available source archives and is not represented as migrated here. Third-party hosted apps such as NineMags and Cowlendar are external services, not source code owned by this repository.

No new license is granted for third-party theme code, fonts, brand assets or dependencies by this import.
