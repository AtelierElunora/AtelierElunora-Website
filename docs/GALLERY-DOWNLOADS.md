# Full gallery and original downloads

Visitors can switch between Order magnets and View full gallery without losing magnet choices. The full gallery has independent photo checkboxes, Select all, Clear selection, and Download selected photos. Photos without originals remain visible but are unavailable for download.

Original bytes are preserved without magnet crops, frames, or recompression. Downloads are prepared sequentially in ZIP parts of about 48–64 MiB to bound memory usage on phones. Save each ZIP, then prepare the next part. Saving requires an explicit click, including on mobile. Keep the page open while preparing; Cancel stops preparation and releases the archive. Failed parts leave their photos selected for retry. Numbered, sanitized filenames preserve duplicate filenames.

## Access protection

The original endpoint runs behind existing session authentication and the user-scoped active-event lookup. The helper checks the caller's photo access, visibility and readiness through row-level security before reading private storage, and rechecks after the read. Only the authorized photo's original key is used, with event/photo path validation. No public URLs, arbitrary storage keys, signing endpoint, database policy changes, or credentials are exposed. Responses are private and no-store. The manifest exposes only hasOriginal, never storage keys.

## Rollout

1. Deploy the complete supabase/functions/gallery-api function from this branch, including guest-original.mjs. Preserve existing custom authentication, deployment configuration, and environment settings. No migration is required.
2. Duplicate the current Shopify theme and carry over the changes to sections/atelier-client-gallery.liquid and the new atelier_customer_gallery translation keys in locales/en.default.json.
3. In the unpublished preview, sign in as a test guest. Switch between magnets and the full gallery, verify magnet choices survive, save two originals and inspect the ZIP. Test multiple ZIP parts and saving on iPhone Safari and desktop. Confirm unavailable originals are unselectable.
4. Revoke guest access and confirm subsequent original requests fail. Publish after preview verification.

This branch does not deploy the backend or publish Shopify. Deploy the backend before the UI; otherwise original downloads are unavailable.

## Tests

Run npm ci and npm run test:gallery. Tests cover denied access, invalid storage paths, revocation during transfer, storage errors, ZIP content/CRC/Unicode filenames, browser navigation, independent selections, absent originals, authenticated downloads, retry and logout cleanup. Local JavaScript syntax and translation JSON parsing are included. Live guest login and real-device saving still require preview verification.
