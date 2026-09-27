# Email and password sign-in — release candidate

Status: implemented on `feature/password-sign-in`, branched from `main` at `617e2def6fbbe2addc090c72cc5bce8cc8e624a6`. Not deployed or merged. Merge after Alexander confirms the release looks and works as expected.

## Experience

Customer gallery and Owner Studio now open with email/password sign-in. Existing accounts choose **Create or reset password**, verify the existing eight-digit email code, and set a 12–128 character password. Future visits use that password. **Use an email code** remains available. Password managers can fill the username and password fields. Passwords are never stored in application browser storage.

Owner Studio additionally requires the existing authenticator before either opening the workspace or saving a password. Owners attempting password setup from the customer gallery are directed to Owner Studio. Customers do not need an authenticator. Gallery permissions, invitations, RLS, checkout and anonymous product uploads are unchanged. This adds gallery account credentials, not a Shopify customer-account password or Shopify account single sign-on.

Session storage behavior is unchanged: owner tokens remain in memory, customer tokens in tab session storage. This release does not add “remember me” across browser restarts.

## Server behavior

`POST password-login` calls Supabase Auth `signInWithPassword` with CAPTCHA. Failure messages do not disclose whether an account exists or has a password. Rate limits and CAPTCHA remain enforced by Auth; no privileged authentication endpoint or owner exemption was added.

`POST password` requires an authenticated, active session, a confirmed nonanonymous email account, and an OTP/email-signup authentication timestamp within ten minutes. JWT claims are inspected only after `getUser` validates the exact token. Owners also require AAL2 even during initial MFA enrollment. The endpoint establishes that user's session and calls `updateUser({password})`; it does not use service-role password changes or accept an arbitrary target user. Twelve-character minimum and 128-character maximum are validated on both client and server; Supabase's stronger password policies still apply.

Official references consulted: [password auth](https://supabase.com/docs/guides/auth/passwords), [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [setSession](https://supabase.com/docs/reference/javascript/auth-setsession), [JWT authentication methods](https://supabase.com/docs/guides/auth/jwt-fields). Checked the current Supabase changelog; no dependency upgrade or database migration is part of this release.

## Verification

- `npm test`: captured-source/candidate integrity, existing backend/station tests, offline password handler and browser flows.
- `npm run test:recovered`: reproducible bundles, dashboard, gallery handoff, helper and print regressions.
- Auth tests use simulated Auth responses and never send real emails or mutate production accounts.
- Browser flows execute actual gallery JS and the rebuilt Studio bundle in happy-dom. These are DOM interaction tests, not visual rendering or live CAPTCHA/email-delivery tests.

`docs/production-source-manifest.json` remains the original production capture. `docs/source-candidate.json` records exact changed hashes and their original hashes. `npm run verify:source` checks this candidate plus unchanged baseline files. `npm run verify:production` deliberately retains strict snapshot verification and will report the candidate differences until production is recaptured after deployment. Nothing in this candidate manifest asserts a live release.

## Release and acceptance

1. Confirm the live baseline still matches before deployment. Verify Supabase email/password auth remains enabled, CAPTCHA enabled, and password policy compatible. No auth settings were changed in this branch.
2. Deploy the complete `gallery-api` function from this branch before publishing the changed theme files; only `handler.mts` and `login.mts` changed within the function. Keep all existing runtime secrets, function settings and import map. Old code sign-in remains compatible.
3. Apply `theme/assets/atelier-owner-studio.js` and `theme/sections/atelier-client-gallery.liquid` to a review theme. Test real email verification, password setup, password login, wrong-password recovery, reset, logout and the existing invited gallery using designated test accounts. Verify a new account still receives no uninvited gallery access. Confirm owner MFA on both login and reset. Check mobile layout, password-manager filling and CAPTCHA refresh.
4. Publish the reviewed theme as part of the approved release; once Alexander confirms the release works as expected, merge this branch into `main` per his standing instruction. Reconcile production source hashes and remove/roll forward the candidate manifest as part of release bookkeeping.

No production deployment, test-account email, password change, or merge was performed while preparing this branch. Live provider behavior remains an acceptance check.

Rollback: restore the two theme files first, then the previous `gallery-api` version if needed. Email-code login still works for accounts that have set a password. Do not delete accounts or clear passwords as part of rollback.
