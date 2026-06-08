# Fix the stuck ActBlue backfill window

## What's happening (not normal)

The 4th window (`2025-12-08 → 2026-06-08`) is the campaign's busiest 6 months. The `process-actblue-jobs` worker is hitting the edge function **"CPU Time exceeded"** limit on every run, which hard-kills it before it can record progress (that's why `attempts` is still `0` and the job has been `processing` for 30+ minutes). It's an infinite crash loop, not a long-running import.

Two things in the worker burn too much CPU for a large window:

1. The whole CSV is upserted in **one** call (no batching).
2. `aggregateDaily` scans the org's **entire transaction history twice** every run — once for daily metrics and once to build an in-memory "first donation date per donor" Map across all rows — to compute new-donor counts. This is the biggest CPU consumer and it grows with the data.

## Changes

### 1. `process-actblue-jobs/index.ts`
- Process **one job per invocation** (`limit(1)`) so a single heavy window can't be dragged down by sharing the CPU budget with other jobs.
- Upsert parsed rows in **batches of 1000** (same pattern already used in `syncMeta`), instead of one giant upsert.

### 2. `aggregateDaily` (`_shared/sync-lib.ts`)
- Remove the in-memory "load every donor row and build a first-seen Map" step.
- Replace the new-donor computation with a single Postgres aggregate (group by `donor_email`, `min(transaction_date)`) so the database does the heavy lifting and returns only the small set of first-time donors, instead of streaming all history into the function.
- Keep the daily metric rollups scoped to the window already passed in.

### 3. Unstick the frozen job
- Reset the stuck window job (`2eabdfe1…`) back to a clean `processing` state (attempts `0`, clear any error) after the new code deploys, so the next worker run reprocesses it with the lighter logic. If it still proves too large for one invocation, fall back to splitting that single window into two ~3‑month sub-windows.

## Verification
- Deploy `process-actblue-jobs`, then watch its edge logs: the "CPU Time exceeded" errors should stop.
- Confirm the 4th job flips to `complete` with a non-null `rows_imported`.
- Confirm `actblue_transactions` for the org now extends through `2026-06-08` and the older 3 windows are unaffected.
- Confirm a normal "Sync now" (incremental) still aggregates correctly, including new-donor counts.

## Technical notes
- The "CPU Time exceeded" kill bypasses JS `try/catch`, so the existing `attempts`/`last_error` bookkeeping never ran — that's why the job looked frozen rather than errored. Reducing per-invocation CPU is the actual fix; retry logic alone wouldn't help.
