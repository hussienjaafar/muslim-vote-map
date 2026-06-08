# Make the ActBlue webhook feed the dashboard in real time

## Problem

The `actblue-webhook` function upserts each incoming donation into the raw `actblue_transactions` table but never updates `daily_aggregated_metrics`. The dashboard's KPIs and chart read from that rollup table, which is only refreshed by the daily 03:30 cron sync. Result: webhook donations don't show in dashboard totals/chart until the next day (the "Recent Donations" list updates instantly because it reads raw transactions, but KPIs/chart lag).

## Fix

After successfully upserting the donation, re-aggregate just that donation's day for that org so the rollup stays current.

1. **`supabase/functions/actblue-webhook/index.ts`**
   - Import `aggregateDaily` from `../_shared/sync-lib.ts`.
   - After the successful `actblue_transactions` upsert, compute the transaction's day (`transaction_date` sliced to `YYYY-MM-DD`) and call `aggregateDaily(admin, orgId, 1, false, day)`. The `sinceDate` parameter (already added earlier) scopes the recompute to that single day — cheap, idempotent, well within CPU limits.
   - Run the aggregation in a way that never fails the webhook response: wrap it in try/catch (and/or `EdgeRuntime.waitUntil`) so ActBlue still receives a 200 even if aggregation hiccups. ActBlue retries on non-2xx, so the insert must remain the authoritative success signal.

## Why this is safe

- `aggregateDaily` recomputes a day fully from the raw tables, so processing the same webhook (or a retry) twice yields the same rollup — no double counting.
- Scoping to one day keeps each webhook invocation light, unlike a full re-aggregation.
- New-donor counts stay correct because `aggregateDaily` derives first-seen dates from `org_new_donors_since` over the raw data.

## Verification

- Send a test payload via the webhook for the org and confirm: the row appears in `actblue_transactions`, and the matching `daily_aggregated_metrics` day's `total_funds_raised` / `total_donations` increases to match.
- Confirm the dashboard KPIs/chart reflect the new donation without waiting for the 03:30 cron.
- Confirm a duplicate/retried webhook for the same `transaction_id` does not change the day's totals a second time.
