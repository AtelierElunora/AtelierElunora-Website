# Azure storefront assistant — branch implementation

The first version adds an optional Shopify chat bubble to the existing Azure-hosted **booking App Service**. It uses the existing Azure PostgreSQL server and managed identity configuration. It does not require another always-on host, AI Search, a new database server, or changes to the gallery Function App. No cloud resource, permissions, secrets, database schema, or live theme has been changed by this implementation.

## Customer behavior

The visitor opens the widget, reads the AI disclosure, and chooses Start chat. Suggested questions return approved answers without an AI call. Natural-language questions are sent to the configured Azure model, which selects an approved FAQ ID or NONE. The backend returns the saved answer **verbatim**, with a source link. It discards all model-written prose. It does not send photos, customer account details, order records, booking records, or credentials to the model.

Questions are independent: no chat transcript or conversation history is sent to Azure or stored. Follow-up questions must contain enough detail to stand alone. The widget keeps messages in page memory until reloaded. An uncertain or unavailable match shows the team contact option. AI can still select an unsuitable FAQ; this approach reduces invented wording, not every possible mistake. Seed answers are drafts and must be reviewed and approved in the owner editor.

The inquiry form stores only the explicitly submitted name, email, question, and optional date, location, and guest count in a separate chat inbox. Consent is mandatory. It does not create a booking, reserve capacity, take payment, or email anyone. Owners review the latest 50 submissions at `/app/assistant`, mark them reviewed, and respond using their existing support process. There are no automatic email notifications in this version. The existing contact page is always linked.

## Owner controls

Open the existing Bookings app in Shopify and select **Assistant**. Review/edit FAQs, check approval for each usable answer, and save. Up to 30 entries are supported. Sources are restricted to HTTPS pages on Atelier Elunora’s domain. The editor has optimistic revision checks so a stale tab cannot overwrite a newer save. All owner loads and writes use existing Shopify admin authentication and origin checks. Entries from other shops are never included.

Three launch switches must be on: Azure `ELUNORA_CHAT_ENABLED=true`, the saved Assistant setting, and the theme embed’s Show the assistant setting. All default off. The separate AI matching toggle can stay off for preset-answer chat.

The authenticated owner settings use the new PostgreSQL tables, even if the public chat is off; apply the migration before visiting that screen. Existing booking pages remain independent of those tables. Local SQLite is not supported for the production chat store; the no-credentials preview uses disposable PGlite instead.

## Configuration and release

1. Reconcile this branch with the latest booking release before deployment. Other local work was left untouched. The repository’s production-source notes describe historical imports and do not establish that this branch already matches the currently deployed booking app.
2. On a prototype database first, apply `booking-app/chat/schema.sql` through an existing administrator connection. It creates only the `elunora_chat` schema and four chat tables. It neither alters booking tables nor runs at application startup. Use the existing identity’s PostgreSQL principal, verified by an administrator, for grants: USAGE on this schema; SELECT/INSERT/UPDATE on its tables. No broad database role is needed. DDL and retention cleanup use the administrator/maintenance role.
3. Choose an Azure OpenAI deployment supporting Chat Completions with strict JSON Schema (for example a compatible small model). Supply the actual deployment name, not an assumed model name. Validate availability, regional/data-zone choice, price, and quota in this subscription. There is no provisioned-throughput commitment in this design.
4. Configure the existing booking App Service using `.env.example` as the variable inventory. Keep the existing `ELUNORA_PG_*` values and `ELUNORA_DATABASE_BACKEND=azure-postgres`. Supply `ELUNORA_CHAT_AZURE_ENDPOINT` as the resource root `https://RESOURCE.openai.azure.com`, `ELUNORA_CHAT_AZURE_DEPLOYMENT`, and a random server-only session secret of at least 32 characters. Do not use the local preview secret. Keep secrets in Azure configuration/Key Vault, outside Git.
5. Prefer the existing user-assigned identity via `ELUNORA_CHAT_IDENTITY_CLIENT_ID`; granting that identity model-inference permission on the chosen resource is a separate explicit release action. The adapter requests the documented `https://ai.azure.com/.default` scope. An optional server-only `ELUNORA_CHAT_AZURE_KEY`/Key Vault reference is supported as an alternative; it is never returned to the browser. Verify auth against the selected model before enabling AI.
6. Package **both** the normal booking build/runtime and the new `chat/` directory, including `chat/public/`. The compiled admin route imports the chat store through the server build; `azure/server.mjs` imports the HTTP router from the on-disk `chat/` directory. Standard `npm start` remains the entry point. Include the existing public assets, generated Azure client and runtime dependencies as for current booking releases. This branch contains no automatic deploy workflow.
7. Set `ELUNORA_CHAT_SHOPS` to the exact allowed `.myshopify.com` shop(s), comma-separated. The default is the verified live booking shop. `SHOPIFY_APP_URL` must be the actual App Service public HTTPS origin; iframe requests are restricted to it. Prototype use requires explicitly adding the development shop and configuring that environment’s Shopify app registration. The iframe CSP permits the two Atelier Elunora storefront domains, allowed shop domains, and the configured app origin.
8. Publish the existing booking theme extension with its new `assistant.liquid` app embed. Its default URL is the existing production booking App Service. For a prototype use the corresponding Azure App Service URL. Enable the embed in an unpublished theme first. No new Shopify API scopes are needed. Turn off other chat widgets during the trial to avoid overlapping buttons.
9. Approve FAQs, test the actual Azure deployment, test the owner inbox, and verify desktop/mobile behavior in the unpublished theme before launch. No live-model accuracy or production-network test has been run by the local test suite.

## Usage, abuse, and failure behavior

Monthly AI request and token allowances are stored atomically in PostgreSQL, so scale-out instances and restarts share the same limits. Each call reserves a conservative UTF-8-byte upper bound plus 2,048 tokens for protocol/schema/output overhead. Successful calls settle against reported total usage; failures or missing usage keep the reservation. A compatible tokenizer and bounded 128-token output are required. Unknown IDs, refusals, malformed responses, timeouts, exhausted allowances, missing settings, and provider errors all fall back to contacting the team. Calls do not retry automatically.

The defaults are 2,000 AI requests and 2,000,000 total tokens monthly. These are **usage limits, not a dollar cap**, and are not an Azure price quote. Match the limits to confirmed deployment rates and use Azure cost alerts in addition. Suggested exact-match questions do not consume model quota. Hosting, database, logs, bandwidth, and abusive non-model traffic can still incur charges.

POSTs require a signed, one-hour, shop/network-bound token and an exact configured same-origin Origin header; there is no cross-origin API permission. A 6 KiB JSON body limit and 1,000-character question cap bound work. Durable rate limits allow 15 questions/minute per network identity, 3 inquiries/hour per network identity, and 100 inquiries/day per shop. Network identities are HMAC hashes rather than stored raw addresses.

The chat uses Express’s existing `req.ip`. No global proxy trust setting was changed because that could affect booking authentication. On Azure this can identify the gateway rather than an individual visitor, causing shared limits. Before launch, verify the real proxy chain and choose a narrowly trusted proxy configuration in a reviewed release; do not blindly trust arbitrary forwarded headers. The signed token, origin check, and rates deter casual misuse but do not authenticate a human. Monthly model limits provide the shared outer bound. Internet abuse protection at the hosting edge is still advisable at larger traffic volumes.

The application itself does not log prompt text, request bodies, model responses, tokens, or inquiries. Confirm App Service, Application Insights, and Azure model logging/retention settings before launch; provider-side processing is distinct from the `store:false` API flag. Review your privacy page for the actual Azure processing and inquiry retention policy. Customer inquiries are stored until an authorized maintenance process removes them; no unimplemented automatic deletion period is promised.

Run maintenance under a restricted operator role: remove `elunora_chat.rate` rows whose `expires_at` has passed; remove inquiry rows older than the business’s approved retention period and handle backups consistently. Preserve current-month usage records: deleting them resets cost protection. No scheduler or retention policy was created by this branch.

## Local verification

From `booking-app/`:

```sh
npm ci --include=dev
npm run test:chat
npm run typecheck
npm run build
npm run preview:chat
```

Preview opens at `http://127.0.0.1:4317`. It uses synthetic in-memory settings, three clearly labeled sample draft answers, no model call, and an ephemeral inbox that disappears when stopped. It is bound to loopback and is not a production start command. Tests exercise real PostgreSQL semantics with PGlite and mocked provider responses; they make no paid Azure calls. The existing booking CI picks up `tests/chat.test.mjs` through its test glob.

## Validation recorded for this branch

- 81 booking/payment/calendar/contract/chat regression tests passed against disposable local data.
- TypeScript checks and the production client/server build passed.
- Shopify AI Toolkit Liquid validation passed for the app embed (temporary official theme-check dependencies were used because the bundled validator dependencies were absent).
- Browser verification exercised the consent/start flow, an approved answer, the personal-request fallback, and a synthetic inquiry receipt. The preview made no Azure calls.
- Live Azure model authentication, model routing accuracy, production proxy behavior, and the Shopify unpublished-theme install still require a prototype release.

## Rollback

Set `ELUNORA_CHAT_ENABLED=false` and disable the theme app embed. Normal booking routes and data remain unchanged. Keep the new schema for saved settings/inquiries and usage history. A code rollback does not require dropping chat tables. No payment, order, booking, or gallery permissions were added.

## References

- [Shopify app embeds](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration)
- [Azure chat completion interface](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/chatgpt)
- [Azure structured outputs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs)
