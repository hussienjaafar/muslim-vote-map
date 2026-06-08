# Plan

## What I found
- The **Webhook Deliveries** page is loading correctly, but it only shows the two earlier test calls at **19:55**.
- The latest rows in `actblue_transactions` were inserted at **19:28**, so no newer donation data has reached the database yet.
- The dashboard query/realtime code already refreshes from `actblue_transactions` and `daily_aggregated_metrics`, so this currently looks more like an **ingestion gap** than a frontend rendering bug.
- The background job function for ActBlue is actively booting on schedule, which means the fallback sync path exists and needs to be checked too.

## Plan
1. **Trace the live donation ingestion path end-to-end**
   - Check both paths that can bring in new donations: the public webhook and the scheduled/background sync.
   - Compare the current project’s flow with the working Molitico project so the missing step is isolated quickly.

2. **Identify the exact failure point**
   - Determine whether live donations are:
     - not reaching the webhook at all,
     - reaching the backend but failing parsing/auth/entity matching,
     - only available through the scheduled sync but not being fetched,
     - or being written to the database without triggering the dashboard refresh path.

3. **Implement the narrow fix at the broken hop**
   - If the webhook is missing a live payload shape, update parsing and logging to capture that variant.
   - If the scheduled sync is the source of truth, fix its fetch/filter/write logic so new donations land promptly.
   - If data lands but the UI stays stale, tighten invalidation/realtime on the dashboard and webhook admin page.

4. **Validate against the current donations**
   - Confirm the newest donations appear in at least one backend source (`webhook_deliveries` or `actblue_transactions`).
   - Confirm the daily rollup updates for the active organization.
   - Confirm the dashboard and `/admin/webhooks` reflect the new data without needing a full manual reload.

## Technical details
- Files likely involved:
  - `supabase/functions/actblue-webhook/index.ts`
  - `supabase/functions/process-actblue-jobs/index.ts`
  - shared sync helpers under `supabase/functions/_shared/`
  - `src/queries/useFundraisingQueries.ts`
  - `src/queries/useRealtimeFundraising.ts`
  - `src/pages/admin/WebhookDeliveries.tsx`
  - `src/pages/Dashboard.tsx`
- Validation will use backend queries plus edge-function logs so we can prove whether the issue is upstream delivery, ingestion logic, or frontend refresh.