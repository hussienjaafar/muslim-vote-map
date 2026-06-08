# Background ActBlue export sync

ActBlue generates its export asynchronously and it often takes longer than an edge function can safely wait. Today `syncActblue` polls inline for ~15s and throws "ActBlue CSV not ready (timeout)". We'll decouple it: the Sync action requests the export and returns immediately, and a scheduled background worker finishes the job when ActBlue is ready. Meta and Switchboard stay synchronous (they're fast).

## Flow

```text
Admin clicks "Sync now"
  -> sync-org runs Meta + Switchboard inline (as today)
  -> for ActBlue: request export, store a job row (status=processing), return now
Cron (every minute)
  -> process-actblue-jobs polls ActBlue for each open job
       ready?  -> download, parse, upsert donations, re-aggregate, mark success
       not yet -> leave job, retry next minute
       too old -> mark error
UI shows "Processing…" until the worker finishes, then "Synced".
```

## 1. New table `actblue_csv_jobs`
Tracks each in-flight export: `organization_id`, `csv_id` (ActBlue's export id), `status` (`processing` / `complete` / `error`), `since_days`, `attempts`, `last_error`, plus standard id/created_at/updated_at. Indexed on `status`. RLS: admins and members of the org can read; full access for the service role (the worker). Includes the standard updated_at trigger.

## 2. Refactor `supabase/functions/_shared/sync-lib.ts`
- `syncActblue`: stop inline polling. POST the export request (now with `date_range_end`, already fixed), capture `csv_id`, insert an `actblue_csv_jobs` row with status `processing`, and return `{ ok: true, rows: 0 }` with a "queued" note. Set the credential's `last_sync_status` to `processing: ActBlue export queued`.
- Export `aggregateDaily`, `parseActblueCsv`, and a small `pollActblueCsv(csvId, creds)` helper so the worker can reuse them.

## 3. New edge function `process-actblue-jobs`
Service-role worker, no JWT (cron-invoked):
- Load open jobs (`status = processing`). For each, decrypt that org's ActBlue credentials and poll `csvs/{csv_id}`.
  - **Complete:** download + `parseActblueCsv`, upsert into `actblue_transactions`, run `aggregateDaily` for the org, mark job `complete`, set credential `last_sync_status = success` and `last_sync_at = now`.
  - **Not ready:** increment `attempts`; once attempts exceed ~20 (≈20 min) mark `error` and write the error to the credential status.
  - **API error:** record `last_error`, mark `error` past the cap.

## 4. Schedule the worker
Enable `pg_cron`/`pg_net` and register a once-a-minute `cron.schedule` calling `process-actblue-jobs`. This is set up via the data/insert tool (not a migration) because the statement embeds the project function URL and anon key.

## 5. UI: surface the processing state (`OrgIntegrations.tsx`)
- Show a "Processing…" indicator (with spinner) when `last_sync_status` starts with `processing`, in addition to the existing error line.
- While any platform is processing, gently auto-refetch credential status (poll the `org-credentials` query every ~15s) so the badge flips to "Synced" without a manual refresh.
- Update the post-sync toast so ActBlue reads as "queued / processing in background" rather than success/failure.

## Files
- Migration: create `actblue_csv_jobs` (+ grants, RLS, trigger).
- `supabase/functions/_shared/sync-lib.ts`: rework ActBlue path; export helpers.
- `supabase/functions/process-actblue-jobs/index.ts`: new worker.
- `src/queries/useIntegrationQueries.ts`: optional polling while processing.
- `src/components/org/OrgIntegrations.tsx`: processing UI + toast copy.
- Cron registration via insert tool.

## Verification
Run Sync on Hamawy's org: toast should report Meta/Switchboard inline and ActBlue as queued. Watch `actblue_csv_jobs` and `process-actblue-jobs` logs over the next minute or two; confirm the job flips to `complete`, donations land in `actblue_transactions`, daily metrics re-aggregate, and the UI badge updates to Synced.
