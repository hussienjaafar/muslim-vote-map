# Visualize SMS Cost (Switchboard)

## Root problem found
The SMS table is empty and the sync reads the wrong Switchboard field names, so cost would be `$0` even when broadcasts sync. Per Switchboard's API docs, a broadcast object exposes:
`cost_estimate`, `total_messages`, `delivered`, `failed_to_deliver`, `opt_outs`, `clicks`, `donations`, `amount_raised`, `status`, `created_at`, `started_at`.

The current code maps `cost` from `cost ?? spend` (nonexistent), `messages_sent` from `messages_sent/sent` (nonexistent), and dates from `sent_at/scheduled_at` (nonexistent). Fixing this mapping is step one — without it there is nothing to visualize.

## What gets built

### 1. Fix the Switchboard sync mapping (`supabase/functions/_shared/sync-lib.ts`)
In `syncSwitchboard`, map to the real fields:
- `date` -> from `started_at` (fallback `created_at`), sliced to `YYYY-MM-DD`
- `cost` -> `cost_estimate`
- `messages_sent` -> `total_messages`
- `messages_delivered` -> `delivered`
- `messages_failed` -> `failed_to_deliver`
- `opt_outs` -> `opt_outs`
- `clicks` -> `clicks`
- `conversions` -> `donations`
- `amount_raised` -> `amount_raised`
- `campaign_name` -> `title`

Also only count actually-sent broadcasts (skip `draft`/`scheduled`/`error` so cost reflects real spend). Pagination already uses `next_page` correctly. Optionally pass a `filter=started_at>"<since>"` query param on incremental syncs to reduce paging.

### 2. Re-aggregation
The daily rollup in the same file already sums `sms_campaign_metrics.cost` into `daily_aggregated_metrics.total_sms_cost`, and the dashboard already reads `total_sms_cost`. Once the mapping is fixed and a sync runs, SMS cost flows through automatically — no schema change needed.

### 3. Dashboard chart: split Ad Spend vs SMS Cost (`src/pages/Dashboard.tsx`)
Currently the daily chart shows one combined `spend = ad + sms` line. Change to two separate series:
- `adSpend` (amber, existing color)
- `smsCost` (sky/teal — to match the existing SMS KPI accent)
- Keep `raised` (primary) as-is.

Update `dailyChartData` to carry `adSpend` and `smsCost` separately, add a second gradient + `<Area>` for SMS, update the tooltip formatter labels (Raised / Ad Spend / SMS Cost), and the `hasData` check.

For the single-day hourly view: SMS stays daily-only per your choice. The hourly chart keeps Funds Raised + Meta hourly Ad Spend; SMS is represented in the SMS Cost KPI card only (no hourly SMS line).

### 4. Backfill
After deploying the fixed sync, trigger a sync for the org so `sms_campaign_metrics` and the daily rollup repopulate with real cost. Verify the chart shows a distinct SMS Cost line and the SMS Cost KPI is non-zero.

## Out of scope (per your answers)
- No hourly SMS bucketing (daily only).
- No extra SMS metrics (messages, cost-per-message, SMS ROI) — cost only.

## Validation
- Run sync; confirm `sms_campaign_metrics` has rows with non-zero `cost` and correct dates.
- Confirm `daily_aggregated_metrics.total_sms_cost` is populated.
- Dashboard multi-day chart shows three lines (Raised, Ad Spend, SMS Cost); SMS Cost KPI matches the summed cost; single-day view unchanged except spend split.
