# Phase 5 — Fundraising Data Pipeline

This is the missing data layer. Today every fundraising table exists but nothing fills them, so the dashboard always shows zeros. Phase 5 connects each org's ActBlue, Meta Ads, and Switchboard accounts, pulls their data on a schedule, and rolls it up for the dashboard.

## What gets built

### 1. Secure credential storage
- Org owners/admins enter their ActBlue / Meta / Switchboard API keys in a new **Connections** screen.
- Keys are NEVER stored in plaintext or held in the browser. The screen calls a `save-credentials` edge function that encrypts them (AES-GCM) before writing to the existing `client_api_credentials.encrypted_credentials` column.
- A single project secret holds the encryption key. The UI only ever shows connection status (Connected / Not connected / Last synced), never the secret values.

### 2. Connections UI (`/dashboard/connections`)
- One card per platform (Meta Ads, Switchboard SMS, ActBlue) with connect / update / disconnect, a status badge, and last-sync time.
- A global **Sync now** button that triggers an immediate pull for the active org.
- Owner/admin only (members see a read-only status).

### 3. Sync edge functions
- `sync-meta-ads` — pulls campaign + daily insight data from the Meta Graph API into `meta_campaigns` and `meta_ad_metrics`.
- `sync-switchboard` — pulls SMS campaign daily metrics into `sms_campaign_metrics`.
- `sync-actblue` — pulls recent donations into `actblue_transactions`.
- `aggregate-daily-metrics` — rolls all three sources up into `daily_aggregated_metrics` (ad spend, SMS cost, funds raised, donations, new donors, ROI) per day.
- `sync-org` — orchestrator: decrypts that org's creds, runs the platform syncs it has configured, then runs the aggregation, and stamps `last_sync_at` / `last_sync_status`.
- `sync-all-orgs` — loops every org with active credentials and calls the per-org flow; this is what the daily schedule calls.

### 4. ActBlue webhook (real-time donations)
- A public `actblue-webhook` endpoint (no JWT) that validates a per-org shared secret, then upserts incoming donations into `actblue_transactions` immediately, so the dashboard reflects gifts as they happen between scheduled pulls.

### 5. Scheduled daily sync
- A `pg_cron` job (using `pg_net`) calls `sync-all-orgs` once a day. Set up via the data tool (not a migration) because it embeds the project URL + key.

### 6. Dashboard wiring
- Add the **Connections** link + **Sync now** to the dashboard, and surface "Last synced X ago" and an empty-state nudge ("Connect an account to see data") on `/dashboard`.

## Technical details

**Encryption.** New project secret `CREDENTIALS_ENCRYPTION_KEY` (32-byte base64). Edge functions use Web Crypto AES-GCM. `encrypted_credentials` stores `{ iv, ciphertext }` per platform. Decryption only happens server-side inside sync functions; the anon/authenticated client never receives plaintext (RLS already blocks members from reading the column, and we'll keep raw reads to service role + the save function).

**Upsert keys (idempotent syncs).**
- `meta_ad_metrics`: existing unique index on (org, campaign, ad_set, ad, date).
- `sms_campaign_metrics`: upsert on (org, campaign_id, date) — add a unique index.
- `actblue_transactions`: upsert on (org, transaction_id) — add a unique index.
- `daily_aggregated_metrics`: upsert on (org, date) — add a unique index.
- `meta_campaigns`: upsert on (org, campaign_id) — add a unique index.

These unique indexes are the only schema change (one migration). Everything else is edge functions + frontend.

**Aggregation formula** (matches the dashboard hook): per day, `total_ad_spend` = sum Meta spend, `total_sms_cost` = sum SMS cost, `total_funds_raised` = ActBlue donations + SMS amount_raised, `total_donations` = count, `roi_percentage` = (raised − (adSpend+smsCost)) / (adSpend+smsCost) × 100. `new_donors` = donors whose first-ever gift falls on that day.

**Function config.** All sync/webhook functions deploy with `verify_jwt = false`; auth is enforced in code (`getClaims` for user-triggered ones like `save-credentials` / `sync-org`; shared-secret for the webhook; service-role/cron auth for `sync-all-orgs`).

**Secrets required from you.** Only `CREDENTIALS_ENCRYPTION_KEY` (I generate the value and request it). All platform API keys are entered per-org in the Connections UI — no global Meta/ActBlue/Switchboard secrets.

## Build order
1. Migration: add the unique indexes for idempotent upserts.
2. Request `CREDENTIALS_ENCRYPTION_KEY` secret.
3. `save-credentials` + `sync-*` + `aggregate` + orchestrator + `actblue-webhook` edge functions.
4. Connections UI + dashboard wiring (Sync now, last-synced, empty states).
5. Schedule `sync-all-orgs` daily via cron.
6. Verify: connect a test org, run Sync now, confirm rows + dashboard populate.

## Open question on external APIs
The real Meta Graph / Switchboard / ActBlue request shapes depend on each provider's current API. I'll implement against their documented endpoints; if any provider's account/credential format differs from the standard, that platform's sync may need a small follow-up tweak once tested with live keys.