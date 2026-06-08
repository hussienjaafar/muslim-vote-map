## Why donations aren't updating live

Two separate gaps, both confirmed against the database:

1. **No live ingestion is actually happening.** Your 5 newest transactions all share the exact same insert time (`created_at = 19:28:04`) — they were loaded in one batch by a CSV sync job (`actblue_csv_jobs` shows a `complete` job importing 11,196 rows at that moment). The `actblue-webhook` function has **zero real request logs** — only boot/shutdown. So even though the webhook is configured in ActBlue, deliveries are not reaching/succeeding at our endpoint. New donations only appear when a CSV sync runs.

2. **The dashboard never receives a push.** `actblue_transactions` and `daily_aggregated_metrics` are **not** in the realtime publication, and the widgets only *poll* (`useRecentDonations` every 30s, `useFundraisingSummary` every 60s). So nothing is "instant" — at best it's a delayed poll after a batch sync.

You asked for instant (push), so the plan covers both: make the dashboard react instantly to DB changes, and confirm/repair the webhook so live donations actually land.

## Plan

### 1. Enable realtime on the two dashboard tables
Migration to add both tables to the `supabase_realtime` publication and set `REPLICA IDENTITY FULL`:
- `public.actblue_transactions`
- `public.daily_aggregated_metrics`

(Both already have org-scoped RLS SELECT policies, so subscribers only receive rows for orgs they can read.)

### 2. Subscribe the dashboard to realtime
In `src/pages/Dashboard.tsx` (or a small `useRealtimeFundraising(orgId)` hook), open a Supabase channel filtered by `organization_id = orgId` on both tables. On any insert/update, call `queryClient.invalidateQueries` for `['recent-donations', orgId]` and `['fundraising-summary', orgId]` so the widgets refetch within ~1s of the row landing. Clean up the channel on org change/unmount.
- Keep the existing polling as a fallback but lengthen the intervals (e.g. 60s/120s) since realtime now drives freshness.

### 3. Verify / repair the live webhook path
This is what makes a donation "live" in the first place — without a real ActBlue delivery there is nothing to push.
- Send a true ActBlue-shaped test payload (entityId/amount/paidAt inside `lineitems`, Basic Auth `CDS:CDS2026`) to the deployed `actblue-webhook` and confirm `200 {"ok":true}`, the row appears in `actblue_transactions`, `daily_aggregated_metrics` updates, and — with steps 1–2 in place — the dashboard updates without a manual refresh. Delete the test row afterward.
- Inspect edge logs during/after the test to confirm the function is actually being invoked.
- Because there are currently **zero** real deliveries despite ActBlue being configured, also confirm the webhook URL registered in ActBlue exactly matches the deployed function URL and that ActBlue's delivery log shows attempts. If ActBlue reports failures, the response status/body from our function will tell us whether it's auth (401), entity match (404), or parsing (400).

## Technical notes
- Realtime requires the table in the publication **and** `REPLICA IDENTITY FULL` to deliver full row payloads (needed for the `organization_id` filter).
- Channel filter: `postgres_changes` with `filter: organization_id=eq.<orgId>` on each table.
- No schema/column changes to the tables themselves — only publication + replica identity.

## Out of scope
- Webhook parsing logic itself (already updated to read `lineitems[]`).
- Any change to the CSV sync cadence — it stays as the backfill/reconciliation path.
