# Hourly Meta Ad Spend for the Single-Day View

## Goal
Show real per-hour Meta ad **spend** on the Today/Yesterday hourly chart, alongside the existing hourly ActBlue donations. SMS stays daily/flat (out of scope per your choice).

## Why a separate table
Meta's API returns daily insights today. Multi-day charts (7D/30D/90D) read daily rows and must stay fast. Storing 24 hourly rows in `meta_ad_metrics` would make every multi-day scan ~24× heavier. So hourly spend goes in its own table that is only touched on the single-day view.

## What gets built

### 1. New table: `meta_ad_hourly_metrics`
Stores hourly Meta spend per campaign per day, bucketed by Meta's advertiser-timezone hour.

Domain fields:
- `organization_id`, `campaign_id`
- `date` (the ad day)
- `hour` (0-23, advertiser timezone)
- `spend`, `impressions`, `clicks`
- `synced_at`

Constraints/indexes:
- Unique on (`organization_id`, `campaign_id`, `date`, `hour`) for clean upserts
- Index on (`organization_id`, `date`) for the single-day read
- RLS: same access model as `meta_ad_metrics` — members of the org (or admins) can read; writes are service-role only (edge function). GRANTs for `authenticated` (select) and `service_role` (all).

### 2. Ingestion change (`supabase/functions/_shared/sync-lib.ts`)
Extend `syncMeta` to also pull the hourly breakdown:
- A second Insights request (or added breakdown) using Meta's `hourly_stats_aggregated_by_advertiser_time_zone` time breakdown with `time_increment: '1'`, fields `spend,impressions,clicks`, level `campaign`.
- Meta returns the hour as a range string (e.g. `"13:00:00 - 13:59:59"`); parse the leading hour into an integer 0-23.
- To keep API cost and row volume bounded, only fetch hourly for a **short recent window** (e.g. last 7 days), not the full 37-month backfill. The single-day view only ever shows Today/Yesterday, so a rolling recent window is sufficient. Daily backfill behavior is unchanged.
- Upsert rows into `meta_ad_hourly_metrics` on the unique key. Existing daily upsert into `meta_ad_metrics` is untouched.

### 3. Read RPC: `meta_hourly_rollup(_org_id, _day)`
Mirrors the existing `org_hourly_rollup` pattern: `SECURITY DEFINER`, guarded by `can_access_organization_data(auth.uid(), _org_id)`, returns `hour, spend, impressions, clicks` aggregated across campaigns for the given day. Returns 0-row hours as absent (frontend fills gaps to 24 buckets, same as donations).

### 4. Frontend (`src/queries/useFundraisingQueries.ts`)
- Add `useHourlyMetaSpend(orgId, day)` calling `meta_hourly_rollup`, enabled only for single-day ranges.
- Merge its results into the hourly chart dataset by hour, so each hour bucket has both `funds` (ActBlue) and `adSpend` (Meta).

### 5. Chart (`src/pages/Dashboard.tsx`)
- On single-day view, the hourly area chart gains a Meta **spend** series (line/area) keyed to the hour axis.
- SMS remains a flat daily reference (unchanged).
- Multi-day charts unchanged.

## Notes & limits
- **Backfill:** historical days before this ships won't have hourly Meta rows, so Yesterday becomes accurate after the next sync runs; older single days stay flat. The rolling recent-window fetch keeps Today/Yesterday populated going forward.
- **Timezone:** Meta hourly is in the advertiser account timezone, while ActBlue is bucketed in ET. If the ad account isn't set to ET, the two hourly series can be offset by a few hours. We'll label the Meta series clearly; aligning to ET exactly isn't possible from Meta's hourly aggregation alone.
- **Cost:** one extra Insights call per sync over a small window; negligible row growth (≤24 rows/day/campaign for ~7 days).

## Validation
- Run a sync, confirm `meta_ad_hourly_metrics` populates 0-23 hours with non-zero spend.
- `meta_hourly_rollup` returns expected hourly spend for a known day and is access-guarded.
- Single-day chart shows both donations and Meta spend by hour; multi-day views and SMS unchanged.
