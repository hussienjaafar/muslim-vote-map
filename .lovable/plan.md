# Fix: Meta ads data not auto-updating on the client dashboard

## What's happening
The dashboard reads from `meta_ad_metrics` / `meta_ad_hourly_metrics` (rolled into `daily_aggregated_metrics`). For the only active org, the latest data is frozen at **2026-06-08 21:38 UTC** — nothing has synced today.

## Root-cause evidence
- The `sync-all-orgs` cron (jobid 2) runs every 5 minutes and the function **is booting** (edge logs show `booted` / `shutdown` at 17:05 and 17:10 today) — so pg_cron and pg_net are firing.
- But `client_api_credentials.last_sync_at` for **all three platforms is stuck at 2026-06-08 21:38–21:48** with `last_sync_status = success`. `runOrgSync` always updates `last_sync_at` when it runs, so **`runOrgSync` is not executing** on these recent boots.
- There are **no error logs** from the function — it returns early and quietly.

The only early-return path that produces no log and no DB write is the **authorization check returning 401**:

```ts
if (apikey && (apikey === anon || apikey === service)) authorized = true;
...
if (!authorized) return json({ error: 'Unauthorized' }, 401);
```

The cron job has the anon key **hardcoded** in its SQL command. If the project's API keys were rotated, the env `SUPABASE_ANON_KEY` no longer equals the stale hardcoded key, so `apikey === anon` is false → 401 → silent stop. This matches every symptom (boots, no writes, no error logs, frozen since a specific timestamp). Note ActBlue (jobid 3) is a *separate* cron with its own hardcoded key — it may still work, which is why other parts look partially alive.

## Plan

### 1. Confirm the cause (no code changes)
- Manually invoke `sync-all-orgs` with a valid service-role Authorization header and confirm it returns `200` with per-org summaries and that `last_sync_at` advances. If a manual valid-auth call works while the cron does not, the stale hardcoded key is confirmed.
- Cross-check the cron's hardcoded anon key against the current anon key.

### 2. Fix the cron auth (primary fix)
- Reschedule the `sync-all-orgs` cron (jobid 2) so its `apikey`/Authorization header uses the **current** key, read from Vault at call time rather than a hardcoded literal — same pattern already used by the email cron (jobid 1), which pulls the key from `vault.decrypted_secrets`. This makes it survive future key rotations.
- Do the same hardening for the ActBlue cron (jobid 3) to prevent the identical failure later.

### 3. Make failures observable (prevent silent recurrence)
- In `sync-all-orgs`, add a concise log line on the unauthorized path and on entry (org count) so a future auth/expiry problem shows up in edge logs instead of failing silently.
- Surface staleness to operators: the dashboard "Updated …" line should warn when the newest `meta_ad_metrics.synced_at` is older than a threshold (e.g. > 2 hours), so a stalled sync is visible in-product.

### 4. Backfill the gap
- After the cron is fixed, trigger one `sync-all-orgs` run to pull the missing day(s) of Meta daily + hourly data and re-aggregate `daily_aggregated_metrics`.

### 5. Secondary check (if step 1 disproves the key theory)
- If a valid-auth manual call also fails to write Meta rows, inspect the Meta branch: an expired `access_token` would return a `Meta API 190` error and set `last_sync_status` to that error (which we are *not* seeing, making this less likely). In that case the fix is re-authorizing the Meta connection / refreshing the long-lived token.

## Notes
- Cron rescheduling uses project-specific keys/URLs, so it will be applied via the data/cron tooling (not a standard migration), consistent with how jobs 1–3 were created.
