# Production reconciliation — October 1, 2026

This source reconciliation uses the published Shopify theme, the live dashboard/backend, the current Customer app source, and the supplied desktop print helper. It performs no theme publication, backend deployment, database mutation, checkout, upload, email, or print operation.

| Component | Current source |
| --- | --- |
| Published Shopify theme | 191953797408, Atelier Elunora — Password Login Preview, role MAIN; all 536 files inventoried |
| Website and custom owner dashboard | 526 theme text files, four brand PNGs; templates, sections, blocks, snippets, locales, settings, scripts and CSS recovered directly from Shopify |
| Theme fonts | Six licensed binaries inventoried with upstream checksums; restored privately rather than committed to the public repository |
| Editable dashboard, browser station and upload experiences | Existing dashboard JSX, station modules and experience modules rebuild to the matching live bundles; final newline differences only |
| Gallery API | Exact live version 58, 28 files; custom authentication and verify_jwt=false preserved |
| Payment webhook | Exact live version 10, four files; HMAC verification and verify_jwt=false preserved |
| Retired station diagnostic | Exact live version 5, two files; verify_jwt=true preserved |
| Database | All 31 applied migration records; refreshed schema definitions for 26 gallery tables, functions, constraints, indexes, policies and triggers |
| Current native app | ios/ElunoraCustomer, version 0.2.2 build 4; customer tabs and owner booth, shared Xcode scheme and native tests |
| Desktop print helper | Existing recovered v4 source; user reports still using v4 and 24 common files match the supplied local v4 folder |
| Shopify pages | All 16 published page bodies and template assignments in shopify/content/pages.json |

## Changes from main

Main previously described API v53, webhook v9 and the older iPad-only baseline. The password-login/invitation release was already on main but still described as a preview override in the source inventory. The current theme already matches main's website/dashboard runtime bytes. This reconciliation adds the theme authoring guide and current combined Customer app, imports the live backend changes, records the published release as the new production baseline, and retains the earlier candidate manifest as release history.

The API now includes authenticated customer order history, legacy crop zoom defaults, the corrected JSONB payment lookup, and permitted original-photo downloads. The payment handler includes fulfillment tracking scoped to the matching line. The user confirmed order history now populates on the phone. Exact retrieved production source is retained rather than applying older development branch code over it.

## Verification

- Production source hashes, exact function file sets/imports, JS/TS syntax, theme JSON and migration inventory pass.
- Existing activity, crop/template, station/native boundaries, password sign-in and invitation suites pass.
- All four dashboard/station/experience build comparisons and recovered helper/dashboard/API suites pass.
- All 11 imported Customer backend tests pass, including caller isolation, revocation, original bytes, cancellation, crop compatibility and serialized JSONB containment.
- The imported native project compiles for iPhone 17 Simulator with signing disabled. The initial ad-hoc signing attempt encountered copied Finder metadata; this is local filesystem metadata, not a Swift compile error. No new native runtime test run is claimed here. The unchanged source previously passed 12 native tests and the user confirmed capture, checkout, larger text and current order loading on their phone.

The source manifest records SHA-256 and byte lengths of exported files plus original Shopify checksums. Shopify export checksums and locally exported text hashes may differ because of platform formatting. Build comparison and file hashes establish source fidelity; physical printer/camera behavior and full database restore are separate validations.

## Scope and remaining access limits

The active dashboard is the custom owner-studio Shopify page, not the historical Shopify App Home extension. The extension source is retained as historical context; its installed release cannot be certified. Shopify denied the installed-app query. The current connector's webhook query sees only its own app subscriptions, so its empty result cannot inventory all store subscriptions. These limitations are recorded in shopify/content/integration-inventory.json.

Third-party hosted app internals are external dependencies, not source recoverable through Shopify. Products, orders, customer records, storage photos, secrets, SMTP/CAPTCHA configuration, provisioning profiles, private font binaries and live printer state are not committed to this public repository. Machine-generated helper launch scripts are produced by the checked-in installer; machine state and PDF print artifacts are excluded. The older iPad app remains an explicitly historical baseline; the current combined app is ios/ElunoraCustomer.

Future app development should use the current native project and the root supabase/functions source. Run npm test and npm run test:recovered before source changes. Rebuild intentional dashboard changes from the recovered editable sources and review provenance before any later production deployment.
