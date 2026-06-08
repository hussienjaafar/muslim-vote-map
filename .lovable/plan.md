# Fix: Dashboard data intermittently disappears ("No fundraising data")

## Root cause
The fundraising queries in `src/queries/useFundraisingQueries.ts` catch errors inside their `queryFn` and `return` an empty/zero result instead of throwing. React Query then stores that empty result as *successful* data, overwriting the last good cache. On the next render `hasData` is false and the dashboard shows the empty state — until the next successful poll repopulates it.

With a 20–30s poll interval, realtime invalidations on every ActBlue transaction, and manual refresh spam, a single transient fetch failure is enough to blank the whole dashboard momentarily.

## Fixes (frontend only, `src/queries/useFundraisingQueries.ts` + `src/pages/Dashboard.tsx`)

### 1. Stop swallowing errors — let React Query keep the last good data
- `useFundraisingSummary`: on `error`, `throw error` instead of returning the zeroed `empty` object. (Keep returning real `empty` only for the genuine `!orgId` short-circuit.)
- `useHourlyFundraising`: if either RPC returns an error, `throw` it instead of silently returning zero buckets.
- `useRecentDonations`: on `error`, `throw error` instead of returning `[]`.

When a query throws, React Query retains the previous `data` and exposes `isError`, so the UI keeps showing the last good values during a transient failure instead of going blank.

### 2. Keep previous data across refetches and range switches
Add `placeholderData: keepPreviousData` (import `keepPreviousData` from `@tanstack/react-query`) to all three queries. This prevents the brief empty/loading flash when the range changes or a background refetch is in flight.

### 3. Add light retry for transient failures
Add `retry: 2` (with the default backoff) to the three queries so a one-off network/auth blip self-heals before it ever surfaces.

### 4. Dashboard: distinguish "real empty" from "fetch error"
In `src/pages/Dashboard.tsx`:
- Pull `isError`/`error` from `useFundraisingSummary`.
- Only render the "No fundraising data for this period yet" empty state when the query **succeeded** and genuinely has no data (`!hasData && !isError`).
- When `isError` but we still have cached `summary` data, keep rendering the chart/KPIs (last good values) and show a small inline "Couldn't refresh — showing last data" note near the existing "Updated …" indicator. If there is an error and no cached data at all, show a retry message instead of the misleading "no data" copy.

## Out of scope
- No backend/schema/sync changes. The aggregation already upserts (never wipes), so this is purely a client data-handling fix.

## Validation
- Confirm the dashboard keeps showing data across repeated manual refreshes and the 30s poll without flashing the empty state.
- Simulate a failing fetch (e.g., offline toggle) and verify the last good chart/KPIs stay visible with the "couldn't refresh" note, instead of "No fundraising data".
- Switch between Today / 7D / 30D and confirm no empty flash between ranges.
