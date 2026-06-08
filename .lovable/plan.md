# Fix: Dashboard funds raised double-counts SMS donations (systematically)

## Root cause (confirmed via DB)
For org `fe078036…`, May 26–Jun 8:
- ActBlue donations (`actblue_transactions`): **$113,984.66** (matches ActBlue's $113,965.66)
- Switchboard SMS `amount_raised`: **$6,082.00**
- Dashboard `total_funds_raised`: **$120,066.66 = 113,984.66 + 6,082.00**

In `supabase/functions/_shared/sync-lib.ts` the daily aggregation adds SMS `amount_raised` into the same `funds` total that already includes ActBlue donations from `org_daily_rollup`. SMS is a channel — those donations still process through ActBlue, so they are counted twice.

## Fix — systematic, applies to every sync going forward
1. **`supabase/functions/_shared/sync-lib.ts`**: remove `d.funds += num(r.amount_raised);` from the SMS loop. `total_funds_raised` will come solely from the ActBlue `org_daily_rollup`. Keep capturing SMS `cost`, `messages_sent`, `conversions`. This is the systematic fix: every future hourly/full sync recomputes funds without the SMS double-count.
2. **Deploy** the affected edge functions (`sync-org`, `sync-all-orgs`).
3. **Backfill / re-aggregate** existing rows: trigger a full re-sync for all orgs so historical `daily_aggregated_metrics` rows are recomputed (upsert on `organization_id,date`), clearing the inflated totals already stored.

## Notes
- ROI (`(funds - spend)/spend`) auto-corrects once funds is right.
- No frontend changes needed.
- The ~$19 residual vs ActBlue's screenshot is normal Eastern-Time day-boundary / refund timing, not part of this fix.

## Validation
- After re-sync, `sum(total_funds_raised)` for May 26–Jun 8 ≈ $113,984, matching ActBlue.
- Spot-check a couple other date ranges to confirm dashboard totals now align with ActBlue.
- Confirm SMS Cost KPI still populated.
