# Fix missing dashboard data

## What's wrong

The dashboard reads from the `daily_aggregated_metrics` rollup table, not from raw transactions. After the ActBlue backfill, the raw `actblue_transactions` table is correct — it has **11,138 donations spanning Jan → June 2026**. But the rollup table only got recomputed for the **last 30 days**, so almost all the backfilled history never made it into the dashboard.

Evidence for the Hamawy org:
- Raw donations by month: Jan $284k, Feb $134k, Mar $75k, Apr $225k, May $520k, Jun $60k.
- Rollup table only covers **Apr 4 → Jun 8**, and every April day shows `total_funds_raised = 0` / `total_donations = 0` — those April rows exist only because Meta ad-spend data was aggregated for them; the ActBlue funds were skipped.

## Root cause

In `process-actblue-jobs/index.ts`, after importing the CSV, it calls:

```text
aggregateDaily(admin, job.organization_id, job.since_days ?? 30)
```

This recomputes the rollup for only the last `since_days` (30) days, with `full = false`. A backfill imports months/years of transactions, but only the most recent 30 days get rolled up — so the older history is invisible on the dashboard even though it's in the database.

The heavy in-memory work that previously caused "CPU Time exceeded" was already moved into the `org_new_donors_since` Postgres function, so a full re-aggregation is now safe to run.

## The fix

1. **`supabase/functions/process-actblue-jobs/index.ts`** — When a job finishes, aggregate over the **full imported range** instead of just 30 days. Pass the job's own `date_range_start` (already stored on the job row) as the lower bound for `aggregateDaily`, falling back to a full re-aggregation. This guarantees every day the export covers gets rolled up. Add `date_range_start` to the job `select`.

2. **`supabase/functions/_shared/sync-lib.ts`** — Add an optional explicit `since` date parameter to `aggregateDaily` so callers can aggregate from a specific date (the job's window start) rather than only "N days ago" or "all time". Keep existing behavior for incremental syncs.

3. **One-time re-aggregation of existing data** — After deploying the fix, run a full re-aggregation for the affected org(s) once so the dashboard immediately fills in the already-imported Jan–June history (no need to re-download from ActBlue). This will be triggered by invoking the worker/sync path with a full window after deploy, and verified against the numbers above.

## Verification

- Re-query `daily_aggregated_metrics` and confirm monthly `total_funds_raised` matches the raw-transaction monthly totals (Jan $284k … Jun $60k).
- Confirm April days now show real funds/donations instead of 0.
- Open `/dashboard`, switch the 7D/30D/90D ranges, and confirm the chart and KPIs populate across the full period.
- Confirm a normal incremental "Sync now" still aggregates correctly (including new-donor counts).
