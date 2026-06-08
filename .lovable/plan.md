## Goal

Import the **complete available history** for Meta, ActBlue, and Switchboard for every client — automatically the first time each platform is connected, plus a manual "Backfill full history" button admins can re-run anytime. (Credentials are added after an org is created, so the true trigger point is "first connect," not the org-creation row insert itself.)

Reach per Meta's hard limit: **Meta ≈ 37 months** (max the Ads insights API returns), **ActBlue and Switchboard = all-time**.

## Behavior changes

The sync pipeline currently runs in incremental windows (default 30 days, capped at 365). We add a **full** mode that flows through the whole chain.

**Meta (`syncMeta`)**
- Full mode sets the window start to ~37 months ago (Meta's max for ad insights).
- Add **pagination**: follow `payload.paging.next` in a guarded loop so we collect every campaign/day, not just the first 500 rows.

**Switchboard (`syncSwitchboard`)**
- Full mode skips the `sinceDays` date filter entirely so every broadcast is imported (it already pages through results).

**ActBlue (`syncActblue`)**
- Full mode requests the CSV export with an early `date_range_start` (ActBlue founding, `2004-01-01`) through today, so the export contains all-time contributions. The existing background worker (`process-actblue-jobs`) finishes the import unchanged.

**Aggregation (`aggregateDaily`)**
- Full mode recomputes `daily_aggregated_metrics` across all history instead of just the recent window (new-donor first-seen already scans full history).

## Triggers

**1. Auto on first connect** — In `save-credentials`, when a platform is connected for the first time (new row / no prior `last_sync_at`), kick off a full backfill for the org in the background (`EdgeRuntime.waitUntil`) so the save response stays fast. Idempotent upserts make re-runs safe.

**2. Manual button** — Add a **"Backfill full history"** action in the org Integrations panel (admin-only) that calls `sync-org` with `full: true`, shows a spinner, and toasts the result. Reuses the ActBlue history panel already in place to confirm completion.

## Files to change

- `supabase/functions/_shared/sync-lib.ts` — thread a `full` flag through `runOrgSync` and each platform function; Meta 37-month window + pagination; Switchboard skip filter; ActBlue early start date; `aggregateDaily` all-history mode.
- `supabase/functions/sync-org/index.ts` — accept `full` in the request body and pass it through (normal path keeps the 365-day cap).
- `supabase/functions/save-credentials/index.ts` — detect first connect and trigger a background full backfill.
- `src/queries/useIntegrationQueries.ts` — extend the sync mutation to accept a `full` backfill option.
- `src/components/org/OrgIntegrations.tsx` — add the admin "Backfill full history" button.

## Verification

- Connect a platform on a fresh org → confirm a full backfill fires automatically (rows appear across months/years; ActBlue job shows a large window).
- Click "Backfill full history" → confirm `sync-org` runs with full mode and metrics/history refresh.
- Confirm incremental syncs and the once-a-minute ActBlue worker still behave normally.

## Notes / limitations

- Meta genuinely cannot return data older than ~37 months; the UI will note this.
- A full ActBlue export can be large but is handled by the existing async worker, so it won't time out the request.
