## Problem

ActBlue rejects any export whose date range exceeds 6 months (`422: "Date range must be 6 months or less"`). The current full-history backfill requests one range back to 2004, so it always fails. Meta and Switchboard backfilled fine.

## Fix

Make the ActBlue **full** path create multiple export jobs, each covering a **6-month window across the last 2 years** (4 windows total): most-recent 6 months, the 6 before that, and so on. Each window is its own ActBlue CSV export + `actblue_csv_jobs` row, finished independently by the existing `process-actblue-jobs` worker. Empty windows simply import 0 rows.

```text
[ -24mo … -18mo ]  [ -18mo … -12mo ]  [ -12mo … -6mo ]  [ -6mo … today ]
   job 1               job 2              job 3             job 4
```

### Changes

**`supabase/functions/_shared/sync-lib.ts` — `syncActblue`**
- In full mode, loop over 4 consecutive 6-month windows covering the last 24 months. For each: POST to ActBlue with that window's `date_range_start`/`date_range_end`, then insert one `actblue_csv_jobs` row (status `processing`) with the window stored.
- Incremental (non-full) mode is unchanged, but clamp its window to ≤6 months so it can never trip the 422 either.
- Record each chunk's window on the job row (see migration) and set the per-platform credential status to reflect how many export windows were queued (e.g. "processing: 4 ActBlue export windows queued"). If one window errors, keep going with the rest and report which failed.

**Migration — `actblue_csv_jobs`**
- Add nullable `date_range_start date` and `date_range_end date` columns so each chunk's window is visible in the per-org ActBlue history panel. (Existing rows stay null.)

**`src/components/org/OrgIntegrations.tsx` — ActBlue history panel**
- Show each job's window (`date_range_start → date_range_end`) when present, so the 4 chunks are distinguishable instead of all looking identical.

## Verification

- Run "Backfill full history" on an org with ActBlue connected → confirm 4 ActBlue jobs appear, each with a distinct 6-month window, no 422, and they flip to Complete as the worker runs.
- Confirm Meta and Switchboard backfills still behave as before.
- Confirm a normal "Sync now" still works.

## Notes

- 2 years × 6-month chunks = 4 export jobs per org per full backfill, which keeps job volume low while covering recent history completely.
