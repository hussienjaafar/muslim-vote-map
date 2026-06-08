## Why reference Molitico

Molitico's ActBlue webhook works in production with the **same architecture as ours**: `verify_jwt = false`, Basic Auth validation, and org routing by `lineitems[0].entityId` matched against stored credentials. So our design is sound. The one thing Molitico does that we don't: it **logs every inbound request to a `webhook_logs` table before any auth/validation**, then updates that row at each exit point. That's what makes delivery problems debuggable there — and it sidesteps the unreliable edge-log "zero invocations" signal (function_id changes across deploys make those queries miss real calls).

We'll adopt that exact pattern.

## Plan

### 1. Add a `webhook_deliveries` log table (mirrors Molitico's `webhook_logs`)
Migration creating `public.webhook_deliveries`:
- `source` (text, `actblue`), `event_type` (text, `incoming`)
- `payload` (jsonb, capped), `headers` (jsonb, with `authorization`/signature **redacted** — never store the password)
- `source_ip`, `user_agent`
- `entity_ids_found` (text[]), `matched_organization_id` (uuid, nullable)
- `processing_status` (text: `pending` → `processed` / `failed`)
- `response_status` (int), `error_detail` (text)
- `id`, `received_at`/`created_at`

RLS: admin-only SELECT (`has_role(auth.uid(),'admin')`); writes via service role. GRANT `service_role` ALL, GRANT `authenticated` SELECT (policy gates to admins).

### 2. Instrument `actblue-webhook` exactly like Molitico
- Read headers (auth scheme, IP, UA) and the raw body first.
- Immediately after `JSON.parse`, **insert a `webhook_deliveries` row with `processing_status='pending'`** and the redacted headers + payload; keep its `id`.
- At every return path (bad payload, no matching entity/org, auth failure, success), **update that row** with `processing_status`, `response_status`, `matched_organization_id`, and `error_detail`.
- Wrap all logging in try/catch so it can never break the webhook response.
- No change to the existing ingestion, realtime, or aggregation logic.

### 3. Admin visibility panel
A small "Webhook Deliveries" table in the admin area (most recent first: time, IP, status, response code, matched org, entity IDs, error). Lets you watch ActBlue's next delivery land in real time and read exactly why it passes or fails. (If you prefer no UI, I can provide a query instead — but the panel is low-effort and reusable.)

### 4. Diagnose with the next real donation
- **Row appears** → read its outcome and fix the specific failure (auth mismatch, entity mismatch, payload shape).
- **No row at all** → ActBlue genuinely isn't reaching the function; the issue is on ActBlue's delivery side (check their webhook delivery log for errors / confirm saved URL+credentials), and we escalate to ActBlue with evidence.
- To prove reachability immediately, I'll also send no-auth and wrong-password test calls and confirm both create logged rows with the right failure status.

## Technical notes
- Uses the existing service-role client already in the function.
- `payload` capped (~8KB) and Basic Auth password is never persisted — only the scheme and a redacted header map.
- Additive only; mirrors a pattern already proven in Molitico.

## Out of scope (Molitico extras we are not copying)
- HMAC signature auth, refcode-mapping attribution, click_id/fbclid reconciliation, and failed-webhook reprocessing — larger systems beyond diagnosing/ingesting deliveries here.
