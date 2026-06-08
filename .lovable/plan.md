# Get June 8 in now + keep the dashboard up to date

## Why Jun 8 is empty
There are no ActBlue transactions dated June 8 in the database. The last backfill CSV only covered through June 7, and no sync (or live webhook donation) has run since. Nothing is broken — the data just hasn't been pulled yet.

There are three freshness mechanisms, in increasing latency:
1. **Real-time webhook** (`actblue-webhook`) — instant, but only fires if ActBlue is configured to POST to our endpoint.
2. **On-demand "Sync now"** (`sync-org`) — pulls a fresh ActBlue CSV export for the recent window; the per-minute worker imports + aggregates it.
3. **Scheduled cron** (`daily-fundraising-sync`) — currently runs only once a day at 03:30, pulling the last 7 days.

## Plan

### 1. Pull June 8 right now (one-time)
Trigger an incremental sync for the org (the same path as the "Sync now" button: `sync-org` with a small `sinceDays`, e.g. 7). This requests an ActBlue CSV export for the recent window, which the per-minute worker then imports and aggregates. Within a few minutes June 8 will populate. Then verify `actblue_transactions` and `daily_aggregated_metrics` both show June 8 rows with real totals.

### 2. Increase scheduled freshness (ongoing safety net)
Reschedule the `daily-fundraising-sync` cron from once-daily (`30 3 * * *`) to **hourly** (`0 * * * *`) so the dashboard catches up at least every hour without anyone clicking "Sync now." This is done by re-running `cron.schedule` with the same job name (uses the project URL + anon key, so it goes through the data tool, not a migration). Hourly is a reasonable cadence given ActBlue CSV exports are generated asynchronously.

### 3. Confirm the real-time path (true "as up to date as possible")
The webhook we just deployed already aggregates each donation's day on arrival — this is the only truly real-time route. The remaining step is operational, not code: **register the `actblue-webhook` URL in the ActBlue dashboard** so live donations stream in instantly. I'll surface the endpoint URL and the auth options (HMAC `webhook_secret` or Basic Auth) so it can be configured.

## Verification
- After step 1: June 8 appears in `actblue_transactions` and `daily_aggregated_metrics`, and the dashboard KPIs/chart show it.
- After step 2: confirm the cron row shows the hourly schedule.
- After step 3 (once ActBlue is configured): send a test donation and confirm it appears within seconds.

## Open question
For step 2, is **hourly** the right cadence, or do you want it tighter (e.g. every 15 minutes)? Tighter means more frequent ActBlue export requests but fresher catch-up data.
