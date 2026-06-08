# Fix: donation times are an INGEST (timestamp) bug, not a visualization bug

## Verdict after studying Molitico end-to-end
This is **confirmed a timestamp/ingest problem**, not a charting/display problem. Proof: the newest stored row holds `2026-06-08 13:34:22+00`. Displaying that as Eastern gives 9:34 AM — but you know it was ~1:34 PM ET. A *correct* UTC instant for a 1:34 PM ET donation would be `17:34Z`. So the stored instant itself is wrong by the ET offset; no display tweak can recover the right time from a corrupted instant.

### How Molitico does it (the reference, traced fully)
**Ingest → stores a correct UTC instant.** ActBlue sends Eastern wall-clock with no timezone suffix. Molitico runs every incoming timestamp through `supabase/functions/_shared/actblue-timezone.ts` → `normalizeActBlueTimestamp()`:
- If the string already has `Z` / `±HH:MM`, parse and keep.
- If no offset, treat as **America/New_York**, compute EDT(−04:00) vs EST(−05:00) via a manual DST calc, append the offset, then `.toISOString()` → the true UTC instant.
This runs in its `actblue-webhook` (real-time) and its CSV/sync paths, so `transaction_date` is always a genuine UTC instant.

**Read.** RPC `get_recent_donations(_organization_id, _date, _limit, _timezone)` returns `transaction_date` as the **raw TIMESTAMPTZ** (the true instant). It only uses `_timezone` to *filter* by local day: `(t.transaction_date AT TIME ZONE _timezone)::DATE = _date`. It does not shift the returned instant.

**Display.** `RecentActivityFeed.tsx` renders `format(new Date(transaction_date), "h:mm a")` + `formatDistanceToNow(...)` "X minutes ago". Because the stored instant is correct, this shows the right time.

**"Live in real time" = webhook ingest + polling, not websockets.** Molitico ingests each donation the moment ActBlue posts to its `actblue-webhook`. The feed hook (`useRecentDonations`) is a react-query poll: `refetchInterval: 30s` when viewing today (`5 min` for the combined metrics), with a pulsing "Live" badge. No Postgres realtime channel is used for donations.

### Why ours is broken (contrast)
- Ingest: `sync-lib.ts` `parseDate` does `new Date(s).toISOString()` → reads ActBlue's Eastern string as UTC → stores it 4–5h early.
- Display: `Dashboard.tsx` `fmtEastern` then converts that already-wrong instant to ET, subtracting another 4h → 9:34 AM.
- Real-time: our `actblue_transactions` rows all arrived via **CSV sync batches** (clustered `created_at`); there are **no webhook-ingested rows**. That's why the 2:19 PM donation wasn't there yet — data only advances when the CSV sync runs (last run 1:47 PM ET), not live. The webhook function exists but isn't producing rows.

## Plan

### 1. Port Molitico's normalization util
Create `supabase/functions/_shared/actblue-timezone.ts` with `normalizeActBlueTimestamp()` + `isEasternDST()` (same logic as Molitico).

### 2. Apply it at every ingest point
- `supabase/functions/_shared/sync-lib.ts`: replace `parseDate(get('date'))` with `normalizeActBlueTimestamp(get('date'))`.
- `supabase/functions/actblue-webhook/index.ts`: wrap `c.createdAt` with `normalizeActBlueTimestamp(...)`.

### 3. Backfill existing mislabeled rows (migration)
```sql
UPDATE public.actblue_transactions
SET transaction_date =
  (transaction_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York';
```
Reinterprets each stored wall-clock as Eastern → writes back the true UTC instant (verified to yield the correct times). DST-safe.

### 4. Re-aggregate daily metrics
Re-run the rollup so `daily_aggregated_metrics` reflects corrected instants. `org_daily_rollup` / `org_new_donors_since` already bucket by `America/New_York`, so once instants are right the chart and new-donor counts are right.

### 5. Verify
Confirm newest donation shows real Eastern time and chart day totals stay correctly bucketed.

## Decisions for you
1. **Display timezone.** Molitico shows the viewer's **local** time; we currently force **Eastern** (`fmtEastern`). Your brand reports in ET, so I recommend keeping forced ET — just operating on corrected data. Want local-time (Molitico-exact) instead?
2. **True real-time.** The CSV-only data flow is why the feed lags. Do you want me to (a) verify/enable the ActBlue webhook so donations land live, and/or (b) tighten the recent-donations poll to 30s like Molitico? (Webhook configuration may need the ActBlue endpoint/secret set up — separate from this timezone fix.)

## Out of scope
No schema changes beyond the one-time backfill; chart aggregation logic unchanged (already ET-correct once data is fixed).
