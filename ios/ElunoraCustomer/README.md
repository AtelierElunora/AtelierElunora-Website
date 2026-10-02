# Current Customer and owner booth app

Version 0.2.2, build 4. Open ElunoraCustomer.xcodeproj and the ElunoraCustomer scheme. Minimum iOS 17. Use the same bundle identifier as your installed app and select your signing team. Associated Domains stays disabled for Personal Team signing.

Source includes capture/import, local photos and drafts, crop editing, Shopify checkout with saved recovery, event uploads, invited galleries, permitted original downloads, order history, and owner booth controls. Native tests are in Tests/Native and included in the shared Xcode scheme.

Restore licensed font files privately into ElunoraCustomer/BrandedFonts. They are excluded from this public repository; the app has system-font fallbacks. No customer photos, sign-in credentials, provisioning profiles, or compiled apps are included.

The current backend source lives at ../../supabase/functions in the repository. The app archive's older BackendUpdates copies are intentionally omitted. Read the root production reconciliation document for deployed versions and verification limits. START-HERE.md and DEVICE-TESTING.md retain the build 4 device guidance and historical implementation notes.
