# Align Integrations Page with ActBlue's Real Webhook Requirements

## Background: what ActBlue actually requires

Per ActBlue's webhook documentation ("Setting Up a Webhook Integration" and the Webhooks docs), receiving real-time contribution data requires exactly three things on the receiver side:

1. **Endpoint URL** — a public `https://` URL ActBlue POSTs each contribution to. (We already generate and display this: `…/functions/v1/actblue-webhook`.)
2. **Username + Password** — HTTP Basic Auth credentials the user types into ActBlue's webhook form. ActBlue sends these on every request as a standard `Authorization: Basic` header. These are values the user *invents* and must match on both sides.
3. **Entity ID** — the campaign/org's ActBlue Entity ID (shown on ActBlue's Webhook Integrations page). Used to identify which org a delivery belongs to and required for vendor-submitted webhook requests.

Crucially, **ActBlue does NOT use HMAC signatures**. There is no `X-ActBlue-Signature` header in ActBlue's contribution webhooks — authentication is Basic Auth only. The current "Webhook secret (HMAC)" field cannot ever be satisfied by ActBlue and misleads users into thinking it's the secure/preferred option.

## Problem with the current page

The ActBlue card in `src/components/org/OrgIntegrations.tsx` currently asks for:
- CSV API username / CSV API password (for scheduled CSV pulls — correct, keep)
- Entity ID (correct, keep)
- **Webhook secret (optional)** — HMAC; **incorrect, ActBlue never uses this**
- Webhook username (optional) — correct but labeled as merely optional/secondary
- Webhook password (optional) — same

The help text presents the HMAC secret as the primary ("preferred") path, which is backwards.

## Changes

### 1. Update the ActBlue field set (`OrgIntegrations.tsx`, ~lines 141–151)
- **Remove** the `webhook_secret` field entirely.
- **Keep & relabel** the Basic Auth pair as the real webhook credentials:
  - `basic_auth_username` → label "Webhook Username" (no longer "optional")
  - `basic_auth_password` → label "Webhook Password"
- Keep `username` / `password` but clarify they are the **CSV API** credentials (scheduled sync), distinct from the webhook.
- Keep `entity_id`.

### 2. Rewrite the help text + add setup steps
Make the card clearly explain the real ActBlue flow:
1. Copy the Webhook URL shown on this card.
2. In ActBlue → Tools → Integrations → Webhooks → "Create a new webhook" → choose **ActBlue Default**.
3. Paste the Webhook URL as the **Endpoint URL**.
4. Choose any **Username** and **Password** in ActBlue, and enter the *same* values here as "Webhook Username" / "Webhook Password".
5. Enter your **Entity ID** (found on ActBlue's Webhook Integrations page).

Keep the existing read-only Webhook URL field with copy button (already present).

### 3. Update the webhook edge function (`supabase/functions/actblue-webhook/index.ts`)
- Remove the now-dead HMAC branch (`validateHmac` / `X-ActBlue-Signature` / `webhook_secret`) so authentication relies solely on HTTP Basic Auth, which is what ActBlue sends.
- Keep the entity_id → org matching and the Basic Auth validation + 401 `WWW-Authenticate` response.
- This is a presentation-aligned cleanup; the Basic Auth path is unchanged in behavior.

### 4. No DB/schema changes
`encrypted_credentials` is a free-form encrypted JSON blob, and `save-credentials` already strips blank fields. Dropping `webhook_secret` from the UI simply means it's no longer written; existing rows are unaffected. No migration needed.

## Out of scope
- The timezone/normalization work (already done previously).
- CSV API sync logic (unchanged).

## Verification
- Load the Integrations page for an org and confirm the ActBlue card shows: CSV API username/password, Entity ID, Webhook Username, Webhook Password, and the read-only Webhook URL — with no HMAC secret field.
- Confirm saving only Entity ID + Webhook Username/Password enables the real-time path, and a test POST with matching Basic Auth is accepted while a mismatched one returns 401.
