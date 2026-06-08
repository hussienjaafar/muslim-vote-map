# Make the dashboard auto-refresh so new data appears without a manual reload

## Why it looks "missing"
The June 8 data is already in the database and the aggregated rollup ($1,390 / 45 donations). The dashboard simply isn't re-fetching it. `useFundraisingSummary` and `useRecentDonations` (in `src/queries/useFundraisingQueries.ts`) use `staleTime: 60_000` and have no `refetchInterval`, so after the page loads the cached result is shown indefinitely. Data synced in afterward (via the hourly cron or the real-time webhook) never reaches the open dashboard until a full page reload.

## Fix

### 1. Add background polling + window-focus refresh to the fundraising queries
In `src/queries/useFundraisingQueries.ts`, for both `useFundraisingSummary` and `useRecentDonations`:
- Add `refetchInterval` (e.g. 60s) so the dashboard pulls fresh data on a steady cadence.
- Add `refetchOnWindowFocus: true` so returning to the tab triggers an immediate refresh.
- Lower `staleTime` (e.g. to ~30s) so the focus/interval refetches actually fire instead of being suppressed by the stale window.

### 2. Add a manual "Refresh" affordance on the dashboard
In `src/pages/Dashboard.tsx`, add a small refresh button near the date-range toggle that invalidates/refetches the fundraising-summary and recent-donations queries on demand, with a brief spinning state. This gives an instant way to pull the latest without waiting for the interval.

## Notes / trade-offs
- Polling every 60s is light (two small selects per org) and matches the backend freshness (hourly catch-up sync + real-time webhook). If you'd prefer near-instant updates instead of a 60s poll, the alternative is a realtime subscription on `daily_aggregated_metrics` / `actblue_transactions` that invalidates the queries on change — more moving parts, so I'd start with polling unless you want true live updates.

## Verification
- Open `/dashboard`, trigger a sync (or wait for one), and confirm the KPIs/chart/recent-donations update on their own within ~60s with no manual reload.
- Confirm the manual Refresh button pulls the latest immediately and shows a loading state.
- Confirm switching the 7D/30D/90D ranges still works and the new day appears in each applicable range.

## Open question
Do you want the simple 60s polling, or true real-time updates via a database subscription (instant, slightly more complex)?
