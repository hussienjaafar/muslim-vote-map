# Monitor ActBlue CSV processing (per-org)

Add visibility into the background ActBlue export pipeline directly in each organization's Integrations panel, plus a button to run the worker on demand instead of waiting for the once-a-minute cron.

## 1. Track rows imported (migration)
Add a nullable `rows_imported` integer column to `actblue_csv_jobs` so the history can show how many donations each export brought in. (Status, attempts, errors, and timestamps already exist.)

## 2. Worker writes the count
In `process-actblue-jobs`, set `rows_imported` when a job completes (the count it upserts into `actblue_transactions`).

## 3. Data hook
New `useActblueJobs(orgId)` in `useIntegrationQueries.ts` reading recent `actblue_csv_jobs` rows (latest ~10, newest first). Auto-poll every 15s while any job is still `processing` so the panel updates itself.

Add `useRunActblueWorker()` that invokes the `process-actblue-jobs` edge function and, on success, refetches the jobs + credentials queries.

## 4. UI: "ActBlue export history" (in `OrgIntegrations.tsx`)
Inside the ActBlue platform block, render a compact history list:
- Status badge per job: Processing (spinner) / Complete / Error, themed with existing tokens.
- Requested window (e.g. "last 30 days"), created time, and "updated X ago".
- Rows imported on completed jobs; attempt count while processing; the error message on failed jobs.
- Empty state when there are no jobs yet.

Add a small **"Run check now"** button (admin) near the history header that calls `useRunActblueWorker`, shows a spinner while running, and toasts the outcome (e.g. "Checked — 1 export completed").

## Files
- Migration: add `rows_imported` to `actblue_csv_jobs`.
- `supabase/functions/process-actblue-jobs/index.ts`: write `rows_imported` on completion.
- `src/queries/useIntegrationQueries.ts`: `useActblueJobs`, `useRunActblueWorker`.
- `src/components/org/OrgIntegrations.tsx`: history list + run-now button.

## Verification
On Hamawy's org, the history shows the already-completed export with its row count. Click "Run check now" to confirm it invokes the worker and the list refreshes. Trigger a new Sync and watch a fresh job appear as Processing and flip to Complete automatically.
