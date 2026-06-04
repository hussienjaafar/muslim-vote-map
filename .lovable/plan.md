# Connect CDS to the Meta Marketing API (OAuth)

Replicate Molitico's "Connect with Facebook" experience inside CDS so admins can link a client org's Meta ad account without copy‑pasting tokens. OAuth becomes the primary path; the existing manual token fields stay as a fallback. Credentials continue to be stored AES‑GCM encrypted (CDS's existing `crypto.ts`), unlike Molitico which stored them in plaintext JSONB.

## How it works (end to end)

```text
Admin clicks "Connect with Facebook" (OrgIntegrations, Meta card)
        │
        ▼
 meta-oauth-init  ──► returns Facebook OAuth dialog URL (Marketing scopes)
        │
        ▼
 Popup opens facebook.com → admin authorizes
        │
        ▼
 Redirect to  /meta-oauth-callback  (new CDS route)
        │  (page posts code+state back to opener, then calls)
        ▼
 meta-oauth-callback ──► exchange code → long-lived 60-day token
                         discover all ad accounts (user + business)
                         ENCRYPT with crypto.ts → upsert client_api_credentials
        │
        ▼
 Admin picks the ad account in the Meta card
        │
        ▼
 meta-save-connection ──► re-encrypt creds with chosen ad_account_id
        │
        ▼
 Existing "Sync now" / daily cron uses the token like before
```

## Reused Meta App
Reuse Molitico's Meta App. Two secrets are added to CDS: `META_APP_ID` and `META_APP_SECRET`. You must add the CDS callback URL to that app's **Valid OAuth Redirect URIs** in the Meta for Developers dashboard:
- `https://www.campaigndata.solutions/meta-oauth-callback`
- `https://campaigndata.solutions/meta-oauth-callback`
- `https://muslim-vote-map.lovable.app/meta-oauth-callback` (published)
- the preview origin + `/meta-oauth-callback` (for testing)

## Changes

### 1. Secrets
- Add `META_APP_ID` and `META_APP_SECRET` (values from the existing Molitico Meta App).

### 2. New edge functions
- `supabase/functions/meta-oauth-init/index.ts` — validates the caller is a platform admin, builds the `facebook.com/v19.0/dialog/oauth` URL with scopes `ads_read, ads_management, business_management, pages_read_engagement, pages_show_list`, and a signed `state` (orgId + userId + timestamp). Returns `authUrl`.
- `supabase/functions/meta-oauth-callback/index.ts` — verifies JWT + admin, validates `state`, exchanges `code` → token → long‑lived token, fetches all user/business ad accounts, then **encrypts via `_shared/crypto.ts` (`encryptJson`)** and upserts into `client_api_credentials` (`platform='meta'`). Returns the ad‑account list (token never returned to the browser).
- `supabase/functions/meta-save-connection/index.ts` — admin picks an ad account; decrypts stored creds, merges `ad_account_id`/`ad_account_name`, re‑encrypts and saves.

These follow CDS conventions (Lovable-managed deploy; `verify_jwt=false` default with in-code `getClaims` + `has_role` admin check). No `config.toml` change needed (these are not public webhooks).

### 3. Storage shape
Keep using the existing `encrypted_credentials` (AES‑GCM `{iv, ciphertext}`) column — the decrypted JSON for Meta will now hold `{ access_token, ad_account_id, ad_account_name, ad_accounts[], meta_user_id, token_expires_at }`. `sync-lib.ts` already reads `access_token` + `ad_account_id`, so syncing keeps working unchanged. No schema migration is strictly required; the token expiry is stored inside the encrypted JSON.

### 4. Frontend
- New route `/meta-oauth-callback` in `src/App.tsx` → a small `MetaOAuthCallback` page that reads `code`+`state` from the URL, calls `meta-oauth-callback`, posts result to `window.opener`, and closes the popup.
- Update `src/components/org/OrgIntegrations.tsx` Meta card:
  - Add a primary **"Connect with Facebook"** button that calls `meta-oauth-init` and opens the popup.
  - After OAuth, show a select of discovered ad accounts → calls `meta-save-connection`.
  - Keep the existing manual `access_token` / `ad_account_id` fields below, collapsed as "Enter token manually" fallback.
- Add the three mutations/queries to `src/queries/useIntegrationQueries.ts` (`useMetaOAuthInit`, `useMetaSaveConnection`).

### 5. Token refresh (optional but recommended)
Long‑lived tokens last ~60 days. Either rely on admins reconnecting, or add a `refresh-meta-tokens` edge function + pg_cron job (like Molitico) to proactively exchange tokens nearing expiry. I'll include this as a follow‑on step unless you'd rather skip it.

## Out of scope
- No changes to the sync pulling logic itself (already built in Phase 5).
- No client-user self-serve connect (admins only, per your choice).

## Verification
- Deploy functions, add redirect URIs, click Connect on a test org, authorize, confirm ad accounts list appears, select one, run "Sync now" and confirm `meta_ad_metrics` / `daily_aggregated_metrics` populate.