# Atelier Elunora customer app — first prototype

An iPhone and Android customer app, separate from the event operator's iPad capture app. Starts from website main commit 9ecf54836bbe69be7d2d2a4edec56c107b99b3df.

## Implemented

- Olive and ivory interface with Capture, My photos, and Explore tabs.
- Native camera preview, front/back switching, capture, review, keep, and retake.
- Import multiple photos from the phone. Remove photos from the session tray.
- Camera unmounts when unfocused or backgrounded; capture waits for camera readiness.
- Explore opens the existing website's shop, gallery, wedding packages, special events, and contact pages after configuring the store origin.

## Run

```sh
cd mobile-customer
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_STORE_ORIGIN to the store's verified HTTPS origin.
npm start
```

Use an SDK 57 compatible Expo Go client or a development build. This source is not an installable App Store or Play Store release. Device camera behavior must be tested on physical iPhone and Android devices.

The current tray is session-only and photo files may be in device cache. It is not a saved library. Explore links do not transfer app photos to the website or create orders. There is no account integration yet. Brand fonts and final AE icon remain to be added from licensed assets; current type uses system fonts.

## Next implementation stages

1. Persist original images and tray metadata in app-owned storage, recover after restart, and provide delete controls.
2. Connect native upload/crop/review to the existing selection manifest workflow. Preserve originals and record each crop separately. Validate pack count and product availability on the server.
3. Create a Storefront cart with the verified selection reference. Match existing `Gallery selection` and `Magnet count` properties using cart line attributes so production can find the paid photo selection. Do not put local URIs or raw photo contents in Shopify attributes.
4. Present Shopify checkout, then reconcile payment through the existing server webhook. A callback or browser return alone cannot mark an order paid.
5. Add authenticated private gallery access and website-equivalent booking/account flows, then quality-of-life features such as countdown, favorites, frames, and sharing.
6. Test offline/restart recovery, interrupted upload and checkout, permission denial, image orientation, duplicate submissions, gallery access control, and both native platforms before distribution.

`checkout.graphql` is a schema-validated integration starting point against Storefront API 2026-07; it is not wired into the app. Native credentials, backend authentication changes, persistent uploads, and checkout tests are still needed. No production deployment is included.

References: [Expo camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/), [photo picker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [Shopify mobile storefronts](https://shopify.dev/docs/storefronts/mobile/about-mobile-storefronts).

## Validation

Passed `npm run lint`, `npm run typecheck`, and Metro/Hermes exports for iOS and Android. These confirm source/bundle checks only, not signed native builds or physical-device behavior. Dependency resolution used Expo's local SDK compatibility table after its online compatibility check timed out.
