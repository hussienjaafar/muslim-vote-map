# Fix recurring flag + richer, infinite-scroll Recent Donations

## 1. Fix the recurring detection (data bug)
Per ActBlue's CSV field spec:
- `Recurrence Number` shows `"1"` for one-time gifts (so matching `1` is wrong).
- `Recurring Period` = `once` for one-time, `weekly`/`monthly` for recurring.
- `Recurring Total Months` is empty for one-time, a number or `unlimited` for recurring.

In `supabase/functions/_shared/sync-lib.ts` (`parseActblueCsv`), replace the regex with:
- `recurring = period !== '' && period !== 'once'` using `Recurring Period` / `Recurrence Frequency`; fallback to "`Recurring Total Months` is non-empty" when the period column is absent.

In `supabase/functions/actblue-webhook/index.ts`, align the live path: treat `recurringPeriod === 'once'` (or missing recurring fields) as one-time instead of `!!recurringPeriod`.

## 2. Capture the form name
Add a `form_name` column to `actblue_transactions` (migration). Populate it:
- CSV (`parseActblueCsv`): from `Form Name` / `Contribution Form`.
- Webhook: from `contributionForm` / `formName`.
(`source_campaign` currently stores the fundraising-page link and is unused in the UI; leave it as-is.)

## 3. Backfill existing rows
The historical 10,978 rows are mis-flagged and have no form name. After deploying the parser fix, run a one-time full re-sync (the existing 4-window backfill in `sync-all-orgs` + per-minute `process-actblue-jobs` worker) so the corrected `is_recurring` and new `form_name` values upsert over the existing transactions.

## 4. Recent Donations: more detail + infinite scroll
**Query** (`src/queries/useFundraisingQueries.ts`): convert `useRecentDonations` to a `useInfiniteQuery` that pages `actblue_transactions` with `.range()` (e.g. 25/page), ordered by `transaction_date desc`, selecting `donor_name, amount, is_recurring, transaction_date, refcode, form_name`. Keep the 60s refetch behavior.

**Widget** (`src/pages/Dashboard.tsx`): render the flattened pages in the Recent Donations card with:
- Full timestamp (date + time, e.g. `Jun 8, 2026 · 1:34 PM`).
- Form name line (when present), alongside the existing refcode.
- The "Recurring" badge only on truly recurring rows.
- Infinite scroll: a sentinel div observed via `IntersectionObserver` that calls `fetchNextPage()` when it enters view, with a loading spinner while fetching and a subtle "end of list" state. The card body gets a max height with internal scroll so it doesn't push the page indefinitely.

## Verification
- Confirm new/re-synced June 8 rows show a realistic mix of one-time vs recurring (not ~100% recurring).
- Scroll the widget and confirm older donations load in pages, each showing time + form name.
- Confirm the 60s auto-refresh + manual Refresh still work.

## Open question
For the infinite-scroll list, do you want it capped at a scrollable panel (e.g. ~480px tall, scroll within the card) or expanding the whole page as you scroll? I'll default to a scrollable panel unless you prefer full-page.
