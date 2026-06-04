# Fix ActBlue & Switchboard Connection Fields (match Molitico)

Our integration forms ask for the wrong credentials and our sync/webhook code authenticates incorrectly. Below is what Molitico (the reference implementation) actually requires, and the changes needed to match it.

## What Molitico requires

### Switchboard SMS
- `account_id` — **required** (Account ID)
- `api_key` — **required** (Secret key)
- Auth: HTTP **Basic** `base64(account_id:api_key)` against `https://api.oneswitchboard.com/v1/broadcasts` (no Bearer token, no base URL field).

### ActBlue
- `username` — **required** (CSV API username)
- `password` — **required** (CSV API password)
- `entity_id` — **required** (ActBlue entity ID — identifies the committee; used for CSV + matching webhook payloads)
- `webhook_secret` — optional (enables secure real-time webhooks via HMAC `X-ActBlue-Signature`)
- `basic_auth_username` / `basic_auth_password` — optional (fallback webhook auth)
- CSV auth: HTTP Basic `base64(username:password)`; webhook org is matched by `entity_id` in the payload.

## Current (incorrect) state in our app
- Switchboard form: `api_key` + `base_url`; sync uses Bearer token to `/v1/campaigns/metrics`. ❌
- ActBlue form: `client_uuid`, `client_secret`, `webhook_username`, `webhook_password`; webhook matches org via `?org=` query and basic auth only; no `entity_id`. ❌

## Changes

### 1. Connection form — `src/components/org/OrgIntegrations.tsx`
Update the `PLATFORMS` field definitions:
- **Switchboard**: replace fields with `account_id` (Account ID) and `api_key` (Secret key, `sb_live_...`). Remove `base_url`.
- **ActBlue**: replace fields with `username` (CSV API username), `password` (CSV API password), `entity_id` (ActBlue entity ID), `webhook_secret` (optional), `basic_auth_username` (optional), `basic_auth_password` (optional). Update help text.

### 2. Switchboard sync — `supabase/functions/_shared/sync-lib.ts`
- Read `account_id` + `api_key`; require both.
- Authenticate with Basic `base64(account_id:api_key)` against `https://api.oneswitchboard.com/v1/broadcasts` (drop `base_url` and Bearer/`/campaigns/metrics`). Adjust response parsing to the broadcasts shape.

### 3. ActBlue sync — `supabase/functions/_shared/sync-lib.ts`
- Read `username`, `password`, `entity_id`; require all three.
- Use Basic `base64(username:password)` for the CSV API (rename from `client_uuid`/`client_secret`).

### 4. ActBlue webhook — `supabase/functions/actblue-webhook/index.ts`
- Match org by `entity_id` from the payload against stored credentials (instead of `?org=`).
- Support HMAC `X-ActBlue-Signature` validation via `webhook_secret`, with Basic auth (`basic_auth_username`/`basic_auth_password`) as fallback.

### 5. Deploy
Redeploy the affected edge functions (`sync-org`/shared lib consumers, `actblue-webhook`).

## Notes
- The `save-credentials` function is generic (stores any provided keys encrypted), so no change is needed there.
- Existing stored credentials using old keys will need to be re-entered after this change; I'll flag this in the UI help text.